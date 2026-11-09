// node --test scripts/redeem-classify.test.mjs
// Strings are the exact ones redeem_promo_code returns (migration 20260716140000).
import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyRedeem } from "./redeem-classify.js";

test("success payloads (new and already-redeemed by this user) are success", () => {
  assert.equal(classifyRedeem({ success: true, already_redeemed: false, duration_months: 12, premium_until: "2027-11-08T00:00:00Z" }), "success");
  assert.equal(classifyRedeem({ success: true, already_redeemed: true, duration_months: 12 }), "success");
});

test("cross-account email block is NOT a success, despite 'already redeemed' in the text", () => {
  assert.equal(
    classifyRedeem({ success: false, error: "This code was already redeemed with your email on another account" }),
    "other_account",
  );
});

test("each server failure maps to its own screen", () => {
  assert.equal(classifyRedeem({ success: false, error: "This code has expired" }), "expired");
  assert.equal(classifyRedeem({ success: false, error: "This code has reached its redemption limit" }), "exhausted");
  assert.equal(classifyRedeem({ success: false, error: "Unauthorized" }), "signed_out");
  assert.equal(classifyRedeem({ success: false, error: "Invalid promo code" }), "invalid");
});

test("garbage never becomes success", () => {
  for (const d of [null, undefined, {}, { success: "true" }, { success: 1 }, { error: "already redeemed" }]) {
    assert.notEqual(classifyRedeem(d), "success", JSON.stringify(d));
  }
});
