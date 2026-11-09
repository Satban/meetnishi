// Nishi Nexus member sign-up page: pure decision logic (no DOM, no network).
// Loaded as an ES module by _layouts/nexus-customer.html and verify.html, and by
// scripts/nexus-join.test.mjs under `node --test`.
//
// Design: Nexus v1 Week 2 plan v2.1 (reviewed twice before code).
//
// The rules that matter:
// - Success is `redeem.success === true` and nothing else. A `success:false` whose text
//   happens to contain "already redeemed" is the cross-account email BLOCK, not a grant.
// - Auto-redeem only for the account that just signed in from THIS page in THIS tab
//   (uid-bound one-shot token). Anyone already signed in gets a confirm step.
// - `decide` returns {state, next}. `next` is the only thing the DOM shell uses to decide
//   what to fetch, so the call order is covered by the tests.
// - A past or missing premium_until is never shown as "on until".

export const RETURN_TTL_MS = 10 * 60 * 1000;
export const JUST_SIGNED_IN_TTL_MS = 2 * 60 * 1000;

const RETURN_PATH_RE = /^\/nexus\/[a-z0-9-]{3,40}\/$/;

/** Only a bare /nexus/<slug>/ path on this origin may be returned to. */
export function returnPathOk(path) {
  return typeof path === "string" && RETURN_PATH_RE.test(path);
}

function parse(json) {
  if (typeof json !== "string" || !json) return null;
  try {
    const v = JSON.parse(json);
    return v && typeof v === "object" ? v : null;
  } catch {
    return null;
  }
}

/** Where verify.html sends a freshly signed-in user. */
export function verifyDestination(stashJson, nowMs) {
  const s = parse(stashJson);
  if (!s || !returnPathOk(s.path) || typeof s.at !== "number") return "/account.html";
  if (nowMs - s.at > RETURN_TTL_MS || nowMs < s.at) return "/account.html";
  return s.path;
}

/** The one-shot "just signed in here" token: {uid, provider} or null if absent/stale. */
export function justSignedIn(tokenJson, nowMs) {
  const t = parse(tokenJson);
  if (!t || typeof t.uid !== "string" || !t.uid || typeof t.at !== "number") return null;
  if (nowMs - t.at > JUST_SIGNED_IN_TTL_MS || nowMs < t.at) return null;
  const provider = t.provider === "apple" || t.provider === "google" ? t.provider : undefined;
  return { uid: t.uid, provider };
}

export function justSignedInUid(tokenJson, nowMs) {
  const t = justSignedIn(tokenJson, nowMs);
  return t ? t.uid : null;
}

/** /nexus/x/index.html and /nexus/x -> /nexus/x/ so the stash always matches returnPathOk. */
export function normalizeReturnPath(pathname) {
  let p = String(pathname || "").replace(/index\.html$/, "");
  if (!p.endsWith("/")) p += "/";
  return p;
}

export function providerLabel(provider) {
  if (provider === "apple") return "Continue with Apple";
  if (provider === "google") return "Continue with Google";
  if (provider === "email") return "the email you signed in with here";
  return "the same way you signed in here";
}

export function platform(ua) {
  const s = String(ua || "");
  if (/iPhone|iPad|iPod/.test(s)) return "ios";
  // iPadOS 13+ Safari reports a Mac UA; the shell passes "Macintosh;touch" when touch exists.
  if (/Macintosh/.test(s) && /touch/i.test(s)) return "ios";
  if (/Android/.test(s)) return "android";
  return "desktop";
}

/**
 * Embedded app browsers where Google sign-in is refused (403 disallowed_useragent).
 * iOS: a bare WKWebView UA has no "Safari/" token (Outlook, Gmail, most apps);
 * Safari, Chrome iOS and SFSafariViewController all carry it.
 */
export function inAppBrowser(ua) {
  const s = String(ua || "");
  if (/FBAN|FBAV|Instagram|LinkedInApp|GSA\//.test(s)) return true;
  if (/Android/.test(s) && /; wv\)/.test(s)) return true;
  if (/iPhone|iPad|iPod/.test(s) && !/Safari\//.test(s)) return true;
  return false;
}

/**
 * Does this member already pay for Premium themselves?
 * store: an active Apple/Google subscription mirrored from RevenueCat.
 * web: a Stripe (or Stripe trial) subscription from the ledger.
 */
export function payingStatus(subRow, entitlementSource, nowMs) {
  if (subRow && subRow.is_premium === true && subRow.expires_date) {
    const exp = Date.parse(subRow.expires_date);
    if (Number.isFinite(exp) && exp > nowMs) return "store";
  }
  if (entitlementSource === "stripe" || entitlementSource === "trial") return "web";
  return "none";
}

function future(iso, nowMs) {
  if (!iso) return false;
  const t = Date.parse(iso);
  return Number.isFinite(t) && t > nowMs;
}

/**
 * input: {ua, nowMs, session, justSignedInUid, confirmed, validate, validateError,
 *         redeem, rpcError, ownPromoUntil (undefined = not read yet), paying (undefined = not read yet)}
 * returns {state, next, ...} where next in validate | redeem | readOwnPromo | readPaying | none
 */
export function decide(input) {
  const { ua, nowMs, session } = input;

  if (!session || !session.user) {
    if (inAppBrowser(ua)) return { state: "open_in_browser", next: "none" };
    if (input.validateError) return { state: "error", next: "none" };
    const v = input.validate;
    if (v === undefined) return { state: "loading", next: "validate" };
    if (v && v.valid === true) return { state: "landing", next: "none" };
    if (v && v.error_type === "expired") return { state: "ended", next: "none" };
    if (v && v.error_type === "exhausted") return { state: "full", next: "none" };
    return { state: "invalid", next: "none" };
  }

  const uid = session.user.id;

  if (input.rpcError) {
    // 401 (bad/expired JWT) or 403 (session gone, request fell back to the anon key).
    if (input.rpcError.status === 401 || input.rpcError.status === 403) return { state: "session_expired", next: "none" };
    return { state: "error", next: "none" };
  }

  const r = input.redeem;
  if (r === undefined) {
    if ((input.justSignedInUid && input.justSignedInUid === uid) || input.confirmed === true) {
      return { state: "activating", next: "redeem" };
    }
    return { state: "confirm", next: "none" };
  }

  if (r && r.success === true) {
    if (!future(r.premium_until, nowMs)) return { state: "ended", next: "none", reason: "lapsed" };
    if (input.paying === undefined) return { state: "activating", next: "readPaying" };
    const state = input.paying === "store" || input.paying === "web" ? "success_paying" : "success";
    return { state, next: "none", premiumUntil: r.premium_until, paying: input.paying };
  }

  const err = String((r && r.error) || "").toLowerCase();
  if (err === "unauthorized") return { state: "session_expired", next: "none" };
  if (err.includes("another account")) return { state: "other_account", next: "none" };
  if (err.includes("invalid promo code")) return { state: "invalid", next: "none" };
  const expired = err.includes("expired");
  const full = err.includes("limit") || err.includes("fully redeemed");
  if (expired || full) {
    if (input.ownPromoUntil === undefined) return { state: "activating", next: "readOwnPromo" };
    if (future(input.ownPromoUntil, nowMs)) {
      return { state: "already_in", next: "none", premiumUntil: input.ownPromoUntil };
    }
    return { state: expired ? "ended" : "full", next: "none" };
  }
  return { state: "error", next: "none" };
}

/** "Nov 8, 2027" (UTC date, so a member never sees the day before). */
export function formatDate(iso) {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const m = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${m[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

/**
 * The offer in the landing headline. Seat codes (validate returns access_ends_at)
 * run to the contract end, so they show the date; other codes show months.
 */
export function offerLine(validate) {
  const end = validate && validate.access_ends_at ? formatDate(validate.access_ends_at) : "";
  if (end) return `Nishi Premium, free, until ${end}`;
  const n = validate && Number.isInteger(validate.duration_months) && validate.duration_months > 0 ? validate.duration_months : 12;
  return `${n === 1 ? "1 month" : `${n} months`} of Nishi Premium, free`;
}
