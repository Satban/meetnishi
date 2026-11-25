// node --test scripts/promo-allowance.test.mjs
// Pure core of the /admin "edit allowance" UI. Strings/classes are the frozen
// update_max_uses contract (nishi-bridge/inbox/for-app.md, 2026-11-25, amended).
// Tests check the CLASS, not example values; see the mutation notes at the end.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seatForbidsUnlimited,
  parseAllowance,
  buildUpdateRequest,
  classifyAllowanceError,
} from "./promo-allowance.js";

const GENERIC = "Could not save the new allowance. Please try again.";

// ---- seatForbidsUnlimited: ONLY an explicit `false` permits blank=unlimited ----
test("seat gating fails closed: only grants_seat===false allows unlimited", () => {
  assert.equal(seatForbidsUnlimited({ grants_seat: false }), false); // the only open case
  assert.equal(seatForbidsUnlimited({ grants_seat: true }), true);
  assert.equal(seatForbidsUnlimited({}), true); // missing metadata -> fixed cap required
  assert.equal(seatForbidsUnlimited({ grants_seat: null }), true);
  assert.equal(seatForbidsUnlimited({ grants_seat: "false" }), true); // wrong type, not false
  assert.equal(seatForbidsUnlimited(undefined), true);
  assert.equal(seatForbidsUnlimited(null), true);
});

// ---- parseAllowance: blank handling, integer-only, overflow safety ----
test("blank is unlimited only when allowed", () => {
  assert.deepEqual(parseAllowance("", false), { ok: true, max_uses: null });
  assert.deepEqual(parseAllowance("   ", false), { ok: true, max_uses: null }); // whitespace == blank
  const seat = parseAllowance("", true);
  assert.equal(seat.ok, false);
  assert.doesNotMatch(seat.message.toLowerCase(), /blank|unlimited/); // never offer it on a seat row
});

test("a valid whole number parses to that number (not a string)", () => {
  const r = parseAllowance("25", false);
  assert.deepEqual(r, { ok: true, max_uses: 25 });
  assert.equal(typeof r.max_uses, "number");
  assert.deepEqual(parseAllowance("  25  ", false), { ok: true, max_uses: 25 }); // trimmed
  assert.deepEqual(parseAllowance("0025", false), { ok: true, max_uses: 25 }); // leading zeros normalized
});

test("non-integers are rejected as correctable, with seat-aware copy", () => {
  for (const bad of ["25.5", "-5", "+25", "1e3", "1,000", "abc", "2５", "2 5", "٥", "12px"]) {
    const nonSeat = parseAllowance(bad, false);
    assert.equal(nonSeat.ok, false, `non-seat should reject ${JSON.stringify(bad)}`);
    assert.match(nonSeat.message.toLowerCase(), /blank|unlimited/, `non-seat hint for ${bad}`);
    const seat = parseAllowance(bad, true);
    assert.equal(seat.ok, false, `seat should reject ${JSON.stringify(bad)}`);
    assert.doesNotMatch(seat.message.toLowerCase(), /blank|unlimited/, `no blank hint on seat for ${bad}`);
  }
});

test("range is NOT enforced client-side: 0 and huge finite ints pass to the server", () => {
  // digits -> ok; the server owns 1..10000 and returns max_uses_out_of_range.
  assert.deepEqual(parseAllowance("0", false), { ok: true, max_uses: 0 });
  assert.deepEqual(parseAllowance("99999", false), { ok: true, max_uses: 99999 });
});

test("overflow never becomes unlimited: a non-safe-integer digit string is rejected", () => {
  const huge = "9".repeat(400); // Number(huge) === Infinity
  const r = parseAllowance(huge, false);
  assert.equal(r.ok, false, "must not accept an overflowing digit string");
  // The dangerous bug this guards: Infinity -> JSON.stringify -> null -> unlimited.
  assert.equal(JSON.stringify({ max_uses: Number(huge) }), '{"max_uses":null}');
  // And one past MAX_SAFE_INTEGER (precision would be silently lost).
  assert.equal(parseAllowance(String(Number.MAX_SAFE_INTEGER + 2), false).ok, false);
  // The max safe integer itself is still a clean integer and passes the parser.
  assert.equal(parseAllowance(String(Number.MAX_SAFE_INTEGER), false).ok, true);
});

test("every successful numeric parse survives JSON serialization unchanged", () => {
  for (const s of ["1", "25", "10000", "7", "0", "99999"]) {
    const r = parseAllowance(s, false);
    assert.equal(r.ok, true);
    assert.equal(JSON.stringify({ max_uses: r.max_uses }), `{"max_uses":${Number(s)}}`);
  }
});

// ---- buildUpdateRequest: the exact wire body ----
test("the request body always carries id + an explicit max_uses, never a string", () => {
  const code = { id: "11111111-2222-3333-4444-555555555555", grants_seat: false };
  const r = buildUpdateRequest(code, "25");
  assert.deepEqual(r, { ok: true, body: { id: code.id, max_uses: 25 } });
  assert.equal(typeof r.body.max_uses, "number");
});

test("blank on a non-seat code sends explicit null (key present, not omitted, not '')", () => {
  const r = buildUpdateRequest({ id: "abc", grants_seat: false }, "");
  assert.equal(r.ok, true);
  assert.ok("max_uses" in r.body, "max_uses key must be present");
  assert.equal(r.body.max_uses, null);
  assert.equal(JSON.stringify(r.body), '{"id":"abc","max_uses":null}');
});

test("blank on a seat (or unknown-seat) code never reaches the wire", () => {
  for (const code of [{ id: "s", grants_seat: true }, { id: "s2" /* missing */ }, { id: "s3", grants_seat: null }]) {
    const r = buildUpdateRequest(code, "");
    assert.equal(r.ok, false, JSON.stringify(code));
    assert.doesNotMatch(r.message.toLowerCase(), /blank|unlimited/);
  }
});

test("a missing/invalid id is refused before any call", () => {
  for (const code of [null, {}, { id: "" }, { id: 123 }, { grants_seat: false }]) {
    assert.equal(buildUpdateRequest(code, "25").ok, false, JSON.stringify(code));
  }
});

// ---- classifyAllowanceError: branch on error_code, class not text ----
const CORRECTABLE = [
  "max_uses_not_integer",
  "max_uses_out_of_range",
  "max_uses_below_current",
  "seat_requires_fixed_allowance",
  "current_uses_changed",
];
const INTERNAL = [
  "max_uses_absent",
  "missing_id",
  "lookup_failed",
  "update_failed",
  "code_not_found",
  "invalid_body",
];

test("correctable codes render the server string verbatim", () => {
  for (const code of CORRECTABLE) {
    const r = classifyAllowanceError({ success: false, error: `server says ${code}`, error_code: code });
    assert.equal(r.internal, false, code);
    assert.equal(r.message, `server says ${code}`, code); // verbatim passthrough
  }
});

test("current_uses_changed is correctable AND triggers a reload", () => {
  const r = classifyAllowanceError({ success: false, error: "now has 6", error_code: "current_uses_changed" });
  assert.equal(r.internal, false);
  assert.equal(r.message, "now has 6");
  assert.equal(r.reloadList, true);
});

test("internal codes render generic (never the server string) and log; reload only on code_not_found", () => {
  for (const code of INTERNAL) {
    const r = classifyAllowanceError({ success: false, error: `leaked ${code}`, error_code: code });
    assert.equal(r.internal, true, code);
    assert.equal(r.message, GENERIC, `internal code ${code} must not leak its server string`);
    assert.equal(r.reloadList, code === "code_not_found", code);
  }
});

test("unknown / missing / malformed codes default to internal+generic without throwing", () => {
  for (const p of [
    { success: false, error: "x", error_code: "a_future_code" },
    { success: false, error: "x" }, // no code at all (network / not-authenticated throw)
    {},
    null,
    undefined,
  ]) {
    const r = classifyAllowanceError(p);
    assert.equal(r.internal, true, JSON.stringify(p));
    assert.equal(r.message, GENERIC, JSON.stringify(p));
    assert.equal(r.reloadList, false, JSON.stringify(p));
  }
});

test("an empty or non-string server message on a correctable code falls back to generic", () => {
  assert.equal(classifyAllowanceError({ error: "", error_code: "max_uses_out_of_range" }).message, GENERIC);
  assert.equal(classifyAllowanceError({ error: null, error_code: "max_uses_out_of_range" }).message, GENERIC);
  assert.equal(classifyAllowanceError({ error_code: "max_uses_out_of_range" }).message, GENERIC);
});

// Mutation notes (flip in promo-allowance.js, confirm a test turns red):
//  - drop Number.isSafeInteger guard            -> "overflow never becomes unlimited" red
//  - /^[0-9]+$/ -> /[0-9]+/ (loose .test)        -> non-integer + overflow cases red
//  - seatForbidsUnlimited: !== false -> === true -> seat gating (missing) red
//  - remove seat-aware message branch            -> non-integer seat case red
//  - add invalid_body to CORRECTABLE             -> internal-codes test red
//  - drop code_not_found from RELOAD             -> internal reload case red
//  - correctable returns error for empty string  -> empty-message fallback red
//  - buildUpdateRequest omits key / sends string -> wire-body tests red
