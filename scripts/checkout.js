/* Nishi Checkout module
   - Binds buttons with data-plan="monthly|annual"
   - If signed in → call create-checkout-session edge function → redirect to Stripe Checkout
   - If signed out → store plan, redirect to /signup.html?plan=...
   Pages bind by adding [data-plan] to a button or link. */

(function () {
  'use strict';

  // Test-mode price IDs. Update for live mode.
  const PRICE_IDS = {
    // LIVE (Mirae Ventures) — $9.99/mo, $79.99/yr
    monthly: 'price_1U5IHsJUdBt48Nr03GynEwuH',
    annual: 'price_1U5IFoJUdBt48Nr0pzwYueIH',
  };

  function setBusy(el, busy) {
    if (!el) return;
    el.style.opacity = busy ? '0.6' : '';
    el.style.pointerEvents = busy ? 'none' : '';
  }

  // The referral code also rides in the URL as ?ref=<code> so attribution survives storage that is blocked
  // (private mode throws on setItem), cleared mid-flow, or partitioned. On every load we re-seed localStorage
  // from the URL. A fresh URL ref that differs from what's stored drops the stale click id (which may belong to
  // a different creator) so we never send A's click paired with B's ref. Returns the URL ref (trimmed) or null.
  function rehydrateRefFromUrl() {
    var urlRef = null;
    try { urlRef = (new URLSearchParams(location.search).get('ref') || '').trim() || null; } catch (_) {}
    if (urlRef) {
      try {
        if (localStorage.getItem('affiliate_ref') !== urlRef) {
          localStorage.removeItem('affiliate_click_id'); // stale click from a prior creator
        }
        localStorage.setItem('affiliate_ref', urlRef);
      } catch (_) {}
    }
    return urlRef;
  }

  async function startCheckout(plan, triggerEl) {
    const priceId = PRICE_IDS[plan];
    if (!priceId) {
      console.warn('Unknown plan:', plan);
      return;
    }

    if (!window.NishiAuth || !window.NISHI_CONFIG) {
      console.warn('Auth or config not loaded yet');
      return;
    }

    // REFERRAL (centralized here so it works for BOTH a direct click AND the resume-after-signin path — Codex):
    // a /r/?c=<slug> landing stashes the code in localStorage AND redirects with ?ref=<code>. We prefer the fresh
    // URL value, falling back to storage, and re-seed storage from the URL first. When present we route through
    // create-referred-checkout, which resolves the code server-side, enforces the 30-day window, and auto-applies
    // the creator coupon. A stale/invalid/absent code just falls back to unattributed checkout (the SERVER is
    // authoritative — a client hint can never mint a discount or commission on its own). Computed BEFORE the
    // session check so it can be threaded through the signed-out signup detour.
    const urlRef = rehydrateRefFromUrl();
    let clickId = null, ref = null;
    try { clickId = localStorage.getItem('affiliate_click_id'); } catch (_) {}
    try { ref = urlRef || (localStorage.getItem('affiliate_ref') || null); } catch (_) { ref = urlRef; }

    const session = await window.NishiAuth.getSession();
    if (!session) {
      // Not signed in. Remember the plan, route through signup — carrying ?ref so it survives the detour even if
      // storage is unavailable. signup.html re-seeds storage from ?ref before OAuth leaves our origin.
      try {
        sessionStorage.setItem('pending_checkout_plan', plan);
      } catch (_) {}
      let dest = `/signup.html?plan=${encodeURIComponent(plan)}`;
      if (ref) dest += `&ref=${encodeURIComponent(ref)}`;
      window.location.href = dest;
      return;
    }

    setBusy(triggerEl, true);

    // ── Web-first RC Web Billing (the go-forward web checkout). Ask the shared resolver
    // (get-applied-affiliate-code) for a checkout_url: it returns a DISCOUNTED tier link for an eligible
    // coded user, a BASE full-price link otherwise, or null when web checkout is gated off (WEB_CHECKOUT_ENABLED
    // — held until counsel's written OK). If we get a URL, bind the RC App User ID (== the Supabase user id)
    // as a PATH segment — normalizing a possibly-missing trailing slash so the id lands as its own segment,
    // never concatenated onto the link id — and hand off. On null / any error, fall through to the legacy
    // Stripe path below so nothing breaks during the hold. Same URL shape as the in-app CTA (byte-aligned).
    try {
      const rcRes = await fetch(
        `${window.NISHI_CONFIG.supabaseUrl}/functions/v1/get-applied-affiliate-code`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': window.NISHI_CONFIG.supabaseAnonKey,
          },
          body: JSON.stringify({ plan }),
        }
      );
      const rcData = await rcRes.json().catch(() => ({}));
      if (rcRes.ok && rcData && rcData.checkout_url && session.user && session.user.id) {
        const u = new URL(rcData.checkout_url);
        u.pathname = u.pathname.replace(/\/?$/, '/') + encodeURIComponent(session.user.id);
        try { sessionStorage.removeItem('pending_checkout_plan'); } catch (_) {}
        window.location.href = u.toString();
        return;
      }
    } catch (err) {
      console.warn('web checkout resolver failed; falling back to Stripe:', err);
    }

    const referred = !!(clickId || ref);
    const endpoint = referred ? 'create-referred-checkout' : 'create-checkout-session';
    const payload = referred
      ? { price_id: priceId, ...(clickId ? { click_id: clickId } : {}), ...(ref ? { ref } : {}) }
      : { price_id: priceId };

    try {
      const resp = await fetch(
        `${window.NISHI_CONFIG.supabaseUrl}/functions/v1/${endpoint}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': window.NISHI_CONFIG.supabaseAnonKey,
          },
          body: JSON.stringify(payload),
        }
      );

      const data = await resp.json();

      if (!resp.ok || !data.url) {
        console.error('Checkout creation failed:', data);
        alert(
          data.error || `Could not start checkout (HTTP ${resp.status}). Try again.`
        );
        setBusy(triggerEl, false);
        return;
      }

      // Clear any pending plan now that we're heading to Stripe
      try { sessionStorage.removeItem('pending_checkout_plan'); } catch (_) {}

      window.location.href = data.url;
    } catch (err) {
      console.error('Checkout error:', err);
      alert('Network error. Please try again.');
      setBusy(triggerEl, false);
    }
  }

  // Auto-bind [data-plan] elements + capture any ?ref on load (pricing.html and account.html both load this).
  document.addEventListener('DOMContentLoaded', () => {
    rehydrateRefFromUrl();
    document.querySelectorAll('[data-plan]').forEach((el) => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        startCheckout(el.dataset.plan, el);
      });
    });
  });

  // Expose for ad-hoc calls (e.g., from account.html if a pending plan is stashed)
  window.NishiCheckout = { startCheckout };
})();
