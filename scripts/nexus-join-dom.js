// Nishi Nexus member page: thin DOM shell. All decisions live in nexus-join.js (tested).
// This file only: reads the page config, fetches what `decide()` asks for (`next`),
// renders the state, and wires the buttons.
import {
  decide,
  formatDate,
  justSignedInUid,
  payingStatus,
  platform,
  providerLabel,
} from "/scripts/nexus-join.js";

const APP_STORE = "https://apps.apple.com/us/app/nishi-your-nutrition-companion/id6759352471";
const PLAY = "https://play.google.com/store/apps/details?id=com.getfoil.app";
const DEMO_STATES = [
  "landing", "open_in_browser", "confirm", "activating", "success", "success_paying",
  "already_in", "other_account", "full", "ended", "invalid", "error", "session_expired",
];

const root = document.getElementById("nj-root");
const cfg = {
  customer: root.dataset.customer || "Your organization",
  code: root.dataset.code || "",
  demoAllowed: root.dataset.demoAllowed === "1",
};

// ── rendering ───────────────────────────────────────────────────────────────
function bindAll(scope, key, text) {
  scope.querySelectorAll(`[data-bind="${key}"]`).forEach((el) => {
    if (el.tagName === "INPUT") el.value = text;
    else el.textContent = text;
  });
}

function storeButtons(ua) {
  const p = platform(ua);
  const apple = `<a class="nj-btn nj-dark" href="${APP_STORE}" target="_blank" rel="noopener">Download on the App Store</a>`;
  const play = `<a class="nj-btn nj-light" href="${PLAY}" target="_blank" rel="noopener">Get it on Google Play</a>`;
  if (p === "ios") return apple + `<p class="nj-note"><a href="${PLAY}" target="_blank" rel="noopener">On Android instead?</a></p>`;
  if (p === "android") return play.replace("nj-light", "nj-dark") + `<p class="nj-note"><a href="${APP_STORE}" target="_blank" rel="noopener">On iPhone instead?</a></p>`;
  return apple + play + `<p class="nj-note">Or open this page on your phone.</p>`;
}

function fillSteps(section, info) {
  const slot = section.querySelector('[data-slot="steps"]');
  if (!slot) return;
  slot.replaceChildren(document.getElementById("nj-steps").content.cloneNode(true));
  bindAll(slot, "email", info.email || "your account");
  const relay = slot.querySelector('[data-bind="relay-note"]');
  if (relay) relay.hidden = !/privaterelay\.appleid\.com$/i.test(info.email || "");
  slot.querySelector('[data-slot="stores"]').innerHTML = storeButtons(navigator.userAgent + (navigator.maxTouchPoints > 1 ? " touch" : ""));
  const label = providerLabel(info.provider);
  const btn = slot.querySelector('[data-bind="provider-button"]');
  const note = slot.querySelector('[data-bind="provider-note"]');
  if (info.provider === "apple" || info.provider === "google") {
    btn.textContent = label;
    note.textContent = "Tap this in the app, the same way you signed in here.";
  } else {
    btn.hidden = true;
    note.textContent = `In the app, sign in with ${label}.`;
  }
}

function render(d, info) {
  const state = d.state === "success_paying" ? "success" : d.state;
  root.querySelectorAll("[data-state]").forEach((s) => { s.hidden = s.dataset.state !== state; });
  const section = root.querySelector(`[data-state="${state}"]`);
  bindAll(root, "customer", cfg.customer);
  bindAll(root, "url", location.href.split("?")[0]);
  if (info.durationMonths) bindAll(root, "duration", info.durationMonths === 1 ? "1 month" : `${info.durationMonths} months`);
  if (state === "confirm") bindAll(section, "email", info.email || "your account");
  if (state === "ended") bindAll(section, "ended-title", d.reason === "lapsed" ? "Your access from this program has ended." : "This program has ended.");
  if (state === "success" || state === "already_in") {
    bindAll(section, "until", formatDate(d.premiumUntil));
    fillSteps(section, info);
    const pay = section.querySelector('[data-slot="paying"]');
    if (pay) {
      const t = d.paying === "store" ? "nj-paying-store" : d.paying === "web" ? "nj-paying-web" : null;
      pay.replaceChildren(t ? document.getElementById(t).content.cloneNode(true) : "");
    }
  }
}

// ── data fetching (only what decide() asks for) ────────────────────────────
async function fetchNext(next, input) {
  const client = window.NishiAuth.client;
  if (next === "validate") {
    const { data, error } = await client.rpc("validate_promo_code", { p_code: cfg.code });
    if (error) input.validateError = { status: error.status || 0 };
    else input.validate = data;
    return;
  }
  if (next === "redeem") {
    const res = await client.rpc("redeem_promo_code", { p_code: cfg.code, p_user_id: input.session.user.id });
    if (res.error) input.rpcError = { status: res.status || 0 };
    else input.redeem = res.data;
    return;
  }
  if (next === "readOwnPromo") {
    const { data, error } = await client
      .from("user_subscriptions").select("promo_premium_until")
      .eq("user_id", input.session.user.id).maybeSingle();
    input.ownPromoUntil = error || !data ? null : data.promo_premium_until;
    return;
  }
  if (next === "readPaying") {
    let row = null;
    let source = null;
    try {
      const sub = await client.from("user_subscriptions")
        .select("is_premium, expires_date, product_identifier")
        .eq("user_id", input.session.user.id).maybeSingle();
      row = sub.data || null;
      const ent = await client.rpc("get_self_entitlement");
      const first = Array.isArray(ent.data) ? ent.data[0] : ent.data;
      source = first ? first.source : null;
    } catch (_) { /* best effort: no callout */ }
    input.paying = payingStatus(row, source, Date.now());
  }
}

let input = null;

function sessionInfo(session) {
  const u = session && session.user;
  return { email: u ? u.email : "", provider: u && u.app_metadata ? u.app_metadata.provider : undefined };
}

async function run() {
  // Bounded: each step resolves one missing input.
  for (let i = 0; i < 6; i++) {
    input.nowMs = Date.now();
    const d = decide(input);
    const info = { ...sessionInfo(input.session), durationMonths: input.validate && input.validate.duration_months };
    render(d, info);
    if (d.next === "none") return;
    try { await fetchNext(d.next, input); } catch (_) { input.rpcError = input.rpcError || { status: 0 }; }
  }
}

// ── actions ─────────────────────────────────────────────────────────────────
function stashReturn() {
  try { sessionStorage.setItem("nexus_return", JSON.stringify({ path: location.pathname, at: Date.now() })); } catch (_) {}
}
function signIn(provider) {
  stashReturn();
  if (provider === "apple") window.NishiAuth.signInWithApple();
  else window.NishiAuth.signInWithGoogle({ selectAccount: true });
}
async function signOutToLanding() {
  try { await window.NishiAuth.signOut(); } catch (_) {}
  input = { ua: navigator.userAgent, nowMs: Date.now(), session: null };
  run();
}

root.addEventListener("click", async (e) => {
  const b = e.target.closest("[data-action]");
  if (!b || !input) return;
  const a = b.dataset.action;
  if (a === "apple" || a === "google") { b.disabled = true; signIn(a); }
  else if (a === "activate") { b.disabled = true; input.confirmed = true; run(); }
  else if (a === "switch" || a === "restart") signOutToLanding();
  else if (a === "retry") location.reload();
  else if (a === "copy") {
    const field = root.querySelector('[data-bind="url"]');
    field.select();
    try { await navigator.clipboard.writeText(field.value); b.textContent = "Copied"; } catch (_) { b.textContent = "Select and copy"; }
  }
});

// ── demo mode (example customer only, no network) ───────────────────────────
function demo(state) {
  input = { demo: true };
  const until = new Date(Date.now() + 365 * 864e5).toISOString();
  const info = { email: "susan@example.com", provider: "google", durationMonths: 12 };
  const d = { state, next: "none", premiumUntil: until };
  if (state === "success_paying") d.paying = "store";
  render(d, info);
}

// ── boot ────────────────────────────────────────────────────────────────────
async function boot() {
  const q = new URLSearchParams(location.search).get("demo");
  if (cfg.demoAllowed && q && DEMO_STATES.includes(q)) { demo(q); return; }
  for (let i = 0; i < 50 && !window.NishiAuth; i++) await new Promise((r) => setTimeout(r, 100));
  if (!window.NishiAuth) { render({ state: "error", next: "none" }, {}); return; }

  // Consume the one-shot token exactly once, valid or not.
  let token = null;
  try {
    token = justSignedInUid(sessionStorage.getItem("nexus_just_signed_in"), Date.now());
    sessionStorage.removeItem("nexus_just_signed_in");
  } catch (_) {}

  const session = await window.NishiAuth.getSession();
  input = { ua: navigator.userAgent, nowMs: Date.now(), session, justSignedInUid: token };
  run();
}
boot();
