// node --test scripts/nexus-join.test.mjs
// IDs (J1..J7) match foil-strategy/NEXUS_V1_WEEK2_PLAN.md section F.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decide,
  formatDate,
  inAppBrowser,
  JUST_SIGNED_IN_TTL_MS,
  justSignedInUid,
  payingStatus,
  platform,
  providerLabel,
  RETURN_TTL_MS,
  returnPathOk,
  verifyDestination,
} from "./nexus-join.js";

const NOW = Date.parse("2026-11-08T12:00:00.000Z");
const FUTURE = "2027-11-08T12:00:00.000Z";
const PAST = "2026-10-02T12:00:00.000Z";
const SAFARI_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const WKWEBVIEW_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148";
const CHROME_IOS =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1";
const CHROME_ANDROID =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const ANDROID_WV =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/120.0.0.0 Mobile Safari/537.36";
const MAC = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const WINDOWS = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

const USER = { id: "uid-1", email: "susan@example.com", app_metadata: { provider: "google" } };
const SESSION = { user: USER };
const base = { ua: SAFARI_IOS, nowMs: NOW };

// ── J1 ──────────────────────────────────────────────────────────────────────
test("J1 returnPathOk accepts only a bare /nexus/<slug>/", () => {
  assert.equal(returnPathOk("/nexus/example-health/"), true);
  assert.equal(returnPathOk("/nexus/abc/"), true);
  for (const bad of [
    "//evil.com/",
    "/nexus/../account.html",
    "https://evil.com/nexus/abc/",
    "/nexus/abc/?a=b",
    "/nexus/abc/#x",
    "/nexus/AB/",
    "/nexus/ab/",
    "/nexus/abc",
    "/nexus/abc/x/",
    "/account.html",
    "",
    null,
    undefined,
    "/nexus/" + "a".repeat(41) + "/",
  ]) {
    assert.equal(returnPathOk(bad), false, `rejects ${JSON.stringify(bad)}`);
  }
});

// ── J2 ──────────────────────────────────────────────────────────────────────
test("J2 verifyDestination honours the 10-minute window exactly", () => {
  const stash = (path, at) => JSON.stringify({ path, at });
  assert.equal(verifyDestination(stash("/nexus/example-health/", NOW), NOW), "/nexus/example-health/");
  assert.equal(verifyDestination(stash("/nexus/example-health/", NOW - RETURN_TTL_MS), NOW), "/nexus/example-health/");
  assert.equal(verifyDestination(stash("/nexus/example-health/", NOW - RETURN_TTL_MS - 1), NOW), "/account.html");
  assert.equal(verifyDestination(stash("/nexus/example-health/", NOW + 60_000), NOW), "/account.html");
  assert.equal(verifyDestination(stash("//evil.com/", NOW), NOW), "/account.html");
  assert.equal(verifyDestination("{not json", NOW), "/account.html");
  assert.equal(verifyDestination(null, NOW), "/account.html");
  assert.equal(verifyDestination(JSON.stringify({ path: "/nexus/example-health/" }), NOW), "/account.html");
});
test("J2 justSignedInUid honours the 2-minute window and shape", () => {
  const tok = (uid, at) => JSON.stringify({ uid, at });
  assert.equal(justSignedInUid(tok("uid-1", NOW - JUST_SIGNED_IN_TTL_MS), NOW), "uid-1");
  assert.equal(justSignedInUid(tok("uid-1", NOW - JUST_SIGNED_IN_TTL_MS - 1), NOW), null);
  assert.equal(justSignedInUid(tok("", NOW), NOW), null);
  assert.equal(justSignedInUid("{bad", NOW), null);
  assert.equal(justSignedInUid(null, NOW), null);
});

// ── J3 ──────────────────────────────────────────────────────────────────────
test("J3 providerLabel", () => {
  assert.equal(providerLabel("apple"), "Continue with Apple");
  assert.equal(providerLabel("google"), "Continue with Google");
  assert.equal(providerLabel("email"), "the email and password you already use");
  assert.equal(providerLabel(undefined), "the same way you signed in here");
});

// ── J4 ──────────────────────────────────────────────────────────────────────
test("J4 platform", () => {
  assert.equal(platform(SAFARI_IOS), "ios");
  assert.equal(platform("Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) Safari/604.1"), "ios");
  assert.equal(platform(MAC + " touch"), "ios");
  assert.equal(platform(CHROME_ANDROID), "android");
  assert.equal(platform(MAC), "desktop");
  assert.equal(platform(WINDOWS), "desktop");
});
test("J4 inAppBrowser: embedded browsers true, real browsers false", () => {
  for (const ua of [
    WKWEBVIEW_IOS,
    SAFARI_IOS + " FBAN/FBIOS;FBAV/440.0",
    SAFARI_IOS + " Instagram 300.0",
    SAFARI_IOS + " LinkedInApp",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/300.0 Mobile/15E148 Safari/604.1",
    ANDROID_WV,
  ]) assert.equal(inAppBrowser(ua), true, ua);
  for (const ua of [SAFARI_IOS, CHROME_IOS, CHROME_ANDROID, MAC, WINDOWS]) assert.equal(inAppBrowser(ua), false, ua);
});

// ── J5 ──────────────────────────────────────────────────────────────────────
test("J5 payingStatus", () => {
  assert.equal(payingStatus({ is_premium: true, expires_date: FUTURE, product_identifier: "annual" }, null, NOW), "store");
  assert.equal(payingStatus({ is_premium: true, expires_date: FUTURE, product_identifier: null }, null, NOW), "store", "TRANSFER with no product id");
  assert.equal(payingStatus({ is_premium: true, expires_date: PAST, product_identifier: "annual" }, null, NOW), "none");
  assert.equal(payingStatus({ is_premium: false, expires_date: null, promo_premium_until: FUTURE }, null, NOW), "none", "promo-only is not paying");
  assert.equal(payingStatus(null, "stripe", NOW), "web");
  assert.equal(payingStatus(null, "trial", NOW), "web");
  for (const s of ["partner_grant", "seat", "admin", null, undefined]) assert.equal(payingStatus(null, s, NOW), "none");
});

// ── J6: signed out ──────────────────────────────────────────────────────────
test("J6 signed out: first fetch is validate, then each outcome", () => {
  assert.deepEqual(decide({ ...base }), { state: "loading", next: "validate" });
  assert.equal(decide({ ...base, validate: { valid: true } }).state, "landing");
  assert.equal(decide({ ...base, validate: { valid: false, error_type: "expired" } }).state, "ended");
  assert.equal(decide({ ...base, validate: { valid: false, error_type: "exhausted" } }).state, "full");
  assert.equal(decide({ ...base, validate: { valid: false, error_type: "invalid" } }).state, "invalid");
  assert.equal(decide({ ...base, validateError: { status: 500 } }).state, "error");
});
test("J6 signed out in an embedded browser: open_in_browser before anything else", () => {
  assert.deepEqual(decide({ ...base, ua: WKWEBVIEW_IOS }), { state: "open_in_browser", next: "none" });
});

// ── J6 + J7: signed in, before redeem ───────────────────────────────────────
test("J6 ORDER signed in + matching token: first fetch is redeem, never validate", () => {
  assert.deepEqual(decide({ ...base, session: SESSION, justSignedInUid: "uid-1" }), { state: "activating", next: "redeem" });
});
test("J7 signed in without a matching token never auto-redeems", () => {
  assert.deepEqual(decide({ ...base, session: SESSION }), { state: "confirm", next: "none" });
  assert.deepEqual(decide({ ...base, session: SESSION, justSignedInUid: "someone-else" }), { state: "confirm", next: "none" });
  assert.deepEqual(decide({ ...base, session: SESSION, justSignedInUid: null }), { state: "confirm", next: "none" });
});
test("J6 confirm -> Activate tapped -> redeem", () => {
  assert.deepEqual(decide({ ...base, session: SESSION, confirmed: true }), { state: "activating", next: "redeem" });
});

// ── J6: redeem outcomes ─────────────────────────────────────────────────────
const signedIn = { ...base, session: SESSION, justSignedInUid: "uid-1" };
test("J6 success: reads paying status next, then success / success_paying", () => {
  const ok = { success: true, already_redeemed: false, premium_until: FUTURE };
  assert.deepEqual(decide({ ...signedIn, redeem: ok }), { state: "activating", next: "readPaying" });
  assert.equal(decide({ ...signedIn, redeem: ok, paying: "none" }).state, "success");
  assert.equal(decide({ ...signedIn, redeem: ok, paying: "store" }).state, "success_paying");
  assert.equal(decide({ ...signedIn, redeem: ok, paying: "web" }).state, "success_paying");
  assert.equal(decide({ ...signedIn, redeem: ok, paying: "none" }).next, "none");
});
test("J6 already_redeemed success payload is a success", () => {
  const r = { success: true, already_redeemed: true, premium_until: FUTURE };
  assert.equal(decide({ ...signedIn, redeem: r, paying: "none" }).state, "success");
});
test("J6 success with a past or missing premium_until never shows a date", () => {
  for (const pu of [PAST, null, undefined, "not a date"]) {
    const d = decide({ ...signedIn, redeem: { success: true, premium_until: pu }, paying: "none" });
    assert.equal(d.state, "ended", String(pu));
  }
});
test("J6 cross-account email block is NOT a success (contains 'already redeemed')", () => {
  const r = { success: false, error: "This code was already redeemed with your email on another account" };
  assert.equal(decide({ ...signedIn, redeem: r }).state, "other_account");
});
for (const [label, error, closed] of [
  ["expired", "This code has expired", "ended"],
  ["limit", "This code has reached its redemption limit", "full"],
]) {
  test(`J6 ORDER ${label}: reads own promo next, then already_in or ${closed}`, () => {
    const r = { success: false, error };
    assert.deepEqual(decide({ ...signedIn, redeem: r }), { state: "activating", next: "readOwnPromo" });
    const inside = decide({ ...signedIn, redeem: r, ownPromoUntil: FUTURE });
    assert.equal(inside.state, "already_in");
    assert.equal(inside.premiumUntil, FUTURE);
    assert.equal(decide({ ...signedIn, redeem: r, ownPromoUntil: PAST }).state, closed);
    assert.equal(decide({ ...signedIn, redeem: r, ownPromoUntil: null }).state, closed);
  });
}
test("J6 session expiry: Unauthorized JSON and RPC-level 401 both -> session_expired", () => {
  assert.equal(decide({ ...signedIn, redeem: { success: false, error: "Unauthorized" } }).state, "session_expired");
  assert.equal(decide({ ...signedIn, rpcError: { status: 401, message: "JWT expired" } }).state, "session_expired");
  assert.equal(decide({ ...signedIn, rpcError: { status: 500 } }).state, "error");
});
test("J6 unknown failures -> error", () => {
  assert.equal(decide({ ...signedIn, redeem: { success: false, error: "Invalid promo code" } }).state, "error");
  assert.equal(decide({ ...signedIn, redeem: { success: false } }).state, "error");
  assert.equal(decide({ ...signedIn, redeem: null }).state, "error");
});

test("formatDate is UTC and plain", () => {
  assert.equal(formatDate("2027-11-08T03:00:00Z"), "Nov 8, 2027");
  assert.equal(formatDate("nope"), "");
});
