// Admin dashboard: edit a promo code's allowance (max_uses).
//
// Pairs with the admin-promo-codes `update_max_uses` edge-function action
// (contract: nishi-bridge/inbox/for-app.md, 2026-11-25, amended). These are the
// PURE pieces of that UI, imported both by /admin (bridged to window.PromoAllowance)
// and by scripts/promo-allowance.test.mjs, mirroring scripts/redeem-classify.js.
//
// Division of responsibility with the server (the single source of truth):
//   - The client only shapes the request and distinguishes blank(=unlimited) from
//     garbage, since those cannot be told apart once sent.
//   - Range (1..10000), below-current, seat-null and the "redeemed while editing"
//     race are all enforced server-side and surfaced verbatim via error_code.

// A seat code (grants_seat) cannot hold a null/unlimited cap (DB constraint), and the
// server omits the "or blank for unlimited" hint on such rows. Fail CLOSED on the
// displayed affordance: ONLY an explicit grants_seat === false permits blank=unlimited.
// Missing or malformed metadata is treated as a fixed-cap row.
export function seatForbidsUnlimited(code) {
  return !code || code.grants_seat !== false;
}

// Turn the inline edit field's raw string into the value to send, or a correctable
// message. `forbidUnlimited` true means blank is not allowed (seat / unknown-seat rows).
// The field is a TEXT input on purpose, so "" (unlimited) is distinguishable from "abc"
// (a typo); a number input blanks invalid input and would silently mean unlimited.
export function parseAllowance(rawValue, forbidUnlimited) {
  const s = String(rawValue == null ? "" : rawValue).trim();

  if (s === "") {
    if (forbidUnlimited) {
      return { ok: false, message: "This code needs a fixed number of seats. Enter a number." };
    }
    return { ok: true, max_uses: null }; // blank = unlimited (non-seat only)
  }

  // Whole number only. Rejects "25.5", "-5", "+25", "1e3", unicode digits, embedded
  // spaces. Leading zeros ("0025") are accepted and normalized by Number().
  if (!/^[0-9]+$/.test(s)) {
    return {
      ok: false,
      message: forbidUnlimited
        ? "Enter a whole number of seats."
        : "Enter a whole number, or leave blank for unlimited.",
    };
  }

  const n = Number(s);
  // A long all-digit string overflows to Infinity, which JSON.stringify writes as null
  // (an accidental unlimited grant). Anything past the safe-integer range is rejected
  // here; the server rejects the 1..10000 business range separately.
  if (!Number.isSafeInteger(n)) {
    return {
      ok: false,
      message: forbidUnlimited
        ? "Enter a whole number of seats."
        : "Enter a whole number, or leave blank for unlimited.",
    };
  }

  return { ok: true, max_uses: n };
}

// Compose the full request body for `update_max_uses`, or a correctable message.
// The body ALWAYS carries both keys; max_uses is a real number or explicit null, never
// a string, never omitted (the contract forbids omitting the key or sending "").
export function buildUpdateRequest(code, rawValue) {
  if (!code || typeof code.id !== "string" || code.id === "") {
    return { ok: false, message: "This code is missing an id. Refresh the list and try again." };
  }
  const p = parseAllowance(rawValue, seatForbidsUnlimited(code));
  if (!p.ok) return p;
  return { ok: true, body: { id: code.id, max_uses: p.max_uses } };
}

// Map an update_max_uses refusal payload to what the UI should do.
// Branch on error_code, never on the display text (contract). Correctable codes render
// the server's verbatim string; everything else — the internal codes, invalid_body,
// unknown/missing codes, and a payload with no code (a network error or the
// "Not authenticated" throw) — renders a generic line and logs the detail.
const CORRECTABLE = new Set([
  "max_uses_not_integer",
  "max_uses_out_of_range",
  "max_uses_below_current",
  "seat_requires_fixed_allowance",
  "current_uses_changed",
]);
// Codes whose resolution needs the list refreshed (and so are shown in a modal that
// survives the rebuild, not an inline bubble).
const RELOAD = new Set(["current_uses_changed", "code_not_found"]);
const GENERIC = "Could not save the new allowance. Please try again.";

export function classifyAllowanceError(payload) {
  const code = payload && payload.error_code;
  const correctable = CORRECTABLE.has(code);
  const serverMsg = payload && payload.error;
  return {
    message:
      correctable && typeof serverMsg === "string" && serverMsg.length > 0
        ? serverMsg
        : GENERIC,
    reloadList: RELOAD.has(code),
    internal: !correctable,
  };
}
