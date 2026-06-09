/* Nishi Checkout module
   - Binds buttons with data-plan="monthly|annual"
   - If signed in → call create-checkout-session edge function → redirect to Stripe Checkout
   - If signed out → store plan, redirect to /signup.html?plan=...
   Pages bind by adding [data-plan] to a button or link. */

(function () {
  'use strict';

  // Test-mode price IDs. Update for live mode.
  const PRICE_IDS = {
    monthly: 'price_1TgTIkJ3pIJt4gNSZljvsQvZ',
    annual: 'price_1TgTJnJ3pIJt4gNS5UVoIwWy',
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

    try {
      const resp = await fetch(
        `${window.NISHI_CONFIG.supabaseUrl}/functions/v1/create-checkout-session`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
            'apikey': window.NISHI_CONFIG.supabaseAnonKey,
          },
          body: JSON.stringify({ price_id: priceId }),
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
