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

    const session = await window.NishiAuth.getSession();
    if (!session) {
      // Not signed in. Remember the plan, route through signup.
      try {
        sessionStorage.setItem('pending_checkout_plan', plan);
      } catch (_) {}
      window.location.href = `/signup.html?plan=${plan}`;
      return;
    }

    setBusy(triggerEl, true);

    // REFERRAL (centralized here so it works for BOTH a direct click AND the resume-after-signin path — Codex):
    // a /r/?c=<slug> landing stores the click id in localStorage (survives the signup detour). When present we
    // route through create-referred-checkout, which resolves the click server-side, enforces the 30-day window,
    // and auto-applies the creator coupon. A stale/invalid/absent click just falls back to unattributed checkout
    // (the SERVER is authoritative — a client hint can never mint a discount or commission on its own).
    let clickId = null, ref = null;
    try { clickId = localStorage.getItem('affiliate_click_id'); ref = localStorage.getItem('affiliate_ref'); } catch (_) {}
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

  // Auto-bind [data-plan] elements
  document.addEventListener('DOMContentLoaded', () => {
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
