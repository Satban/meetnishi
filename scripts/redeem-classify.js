// /redeem page: turn a redeem_promo_code result into the screen to show.
// Success is `success === true` and nothing else. The server's cross-account
// email block ("already redeemed with your email on another account") is a
// FAILURE even though its text contains "already redeemed"; treating it as a
// success showed "You're Premium!" while granting nothing.
export function classifyRedeem(data) {
  if (data && data.success === true) return "success";
  const msg = String((data && data.error) || "").toLowerCase();
  if (msg.includes("another account")) return "other_account";
  if (msg.includes("expired")) return "expired";
  if (msg.includes("limit") || msg.includes("fully redeemed")) return "exhausted";
  if (msg === "unauthorized") return "signed_out";
  return "invalid";
}
