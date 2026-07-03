/* Nishi auth module — wraps Supabase Auth for the website.
   Exposes window.NishiAuth with:
     init()                 — create Supabase client once
     signInWithEmail(email) — send magic link
     signInWithGoogle()     — OAuth flow
     signInWithApple()      — OAuth flow
     getSession()           — returns the current session (or null)
     onSession(cb)          — subscribe to session changes
     signOut()              — clear session
   Pages bind buttons/forms to these via data-* attributes. */

(function () {
  'use strict';

  if (!window.NISHI_CONFIG || !window.supabase) {
    console.warn('NishiAuth: missing config or supabase global');
    return;
  }

  const { createClient } = window.supabase;
  const client = createClient(
    window.NISHI_CONFIG.supabaseUrl,
    window.NISHI_CONFIG.supabaseAnonKey,
    {
      auth: {
        detectSessionInUrl: true,
        persistSession: true,
        autoRefreshToken: true,
        flowType: 'pkce'
      }
    }
  );

  const REDIRECT_TO = `${window.location.origin}/verify.html`;

  async function signInWithEmail(email) {
    return client.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: REDIRECT_TO }
    });
  }

  async function signInWithGoogle() {
    return client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: REDIRECT_TO }
    });
  }

  async function signInWithApple() {
    return client.auth.signInWithOAuth({
      provider: 'apple',
      options: { redirectTo: REDIRECT_TO }
    });
  }

  async function getSession() {
    const { data, error } = await client.auth.getSession();
    if (error) console.warn('getSession error', error);
    return data?.session || null;
  }

  function onSession(cb) {
    client.auth.onAuthStateChange((event, session) => cb(session, event));
  }

  async function signOut() {
    await client.auth.signOut();
    window.location.href = '/';
  }

  // Claim any pending email premium grants for the signed-in user.
  //
  // Promo codes redeemed on the web only *reserve* premium against an email
  // (web-redeem creates a pending row in email_premium_grants). Premium
  // activates when claim_email_grant runs while signed in as that email — it
  // flips the grant into user_subscriptions.promo_premium_until. The mobile app
  // does this on every launch; the website did NOT, so anyone who redeemed on
  // the web and stayed web-only never got activated. This closes that gap.
  //
  // Idempotent: the RPC only picks up grants where user_id IS NULL, so calling
  // it on every session load / refresh is safe and does nothing once claimed.
  // We pass the session's own email, which equals auth.users.email, so the
  // function's email-match check always passes for this user.
  async function claimEmailGrants(session) {
    try {
      const s = session || (await getSession());
      const uid = s?.user?.id;
      const email = s?.user?.email;
      if (!uid || !email) return null;
      const { data, error } = await client.rpc('claim_email_grant', {
        p_user_id: uid,
        p_email: email
      });
      if (error) {
        console.warn('claim_email_grant error', error);
        return null;
      }
      return data; // { success, found, grants_claimed, premium_until, ... }
    } catch (e) {
      console.warn('claimEmailGrants failed', e);
      return null;
    }
  }

  // Finish a redemption that was deferred through the sign-in round-trip.
  //
  // The redeem page activates codes by identity (redeem_promo_code binds the
  // code straight to the signed-in user_id — no email, so Apple Hide-My-Email
  // relay addresses are irrelevant). When a signed-out user clicks a redeem
  // link, the page stashes the code and sends them through OAuth; they land
  // back on account.html, where this runs and completes the redemption.
  //
  // Idempotent: the code is cleared after one definitive response, and
  // redeem_promo_code rejects a second redemption by the same user anyway.
  async function redeemPendingCode(session) {
    let code = null;
    try { code = localStorage.getItem('nishi_pending_redeem'); } catch (_) {}
    if (!code) return null;
    const s = session || (await getSession());
    const uid = s?.user?.id;
    if (!uid) return null;
    try {
      const { data, error } = await client.rpc('redeem_promo_code', {
        p_code: code,
        p_user_id: uid
      });
      if (error) {
        console.warn('redeem_promo_code error', error);
        return null;
      }
      // Any definitive response (granted, or already-redeemed) resolves intent.
      try { localStorage.removeItem('nishi_pending_redeem'); } catch (_) {}
      return data; // { success, duration_months, premium_until } or { success:false, error }
    } catch (e) {
      console.warn('redeemPendingCode failed', e);
      return null;
    }
  }

  // Fire the claim automatically so it's seamless for users who are already
  // signed in: on page load with an existing session, and on fresh sign-ins.
  // Deduped to one attempt per page load. Pages that display premium status
  // (account.html) also await claimEmailGrants() directly before reading it, so
  // the account page reflects a just-claimed grant immediately.
  let _claimAttempted = false;
  function autoClaim(session) {
    if (!session || _claimAttempted) return;
    _claimAttempted = true;
    claimEmailGrants(session);
  }
  getSession().then(autoClaim);
  client.auth.onAuthStateChange((event, session) => {
    if (session) autoClaim(session);
  });

  window.NishiAuth = {
    client,
    signInWithEmail,
    signInWithGoogle,
    signInWithApple,
    getSession,
    onSession,
    claimEmailGrants,
    redeemPendingCode,
    signOut
  };

  // Auto-bind any element with data-auth="..." on the page
  document.addEventListener('DOMContentLoaded', () => {
    // OAuth buttons
    document.querySelectorAll('[data-auth="google"]').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.preventDefault();
        setBusy(el, true);
        const { error } = await signInWithGoogle();
        if (error) showError(el, error.message);
        // On success the browser is already redirecting; no need to clear busy.
      });
    });

    document.querySelectorAll('[data-auth="apple"]').forEach(el => {
      el.addEventListener('click', async (e) => {
        e.preventDefault();
        setBusy(el, true);
        const { error } = await signInWithApple();
        if (error) showError(el, error.message);
      });
    });

    // Email magic link form
    document.querySelectorAll('form[data-auth="email"]').forEach(form => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = form.querySelector('input[type="email"]');
        const email = input.value.trim();
        if (!email) return;
        const button = form.querySelector('button[type="submit"]');
        setBusy(button, true);
        const { error } = await signInWithEmail(email);
        setBusy(button, false);
        const status = form.querySelector('.auth-status');
        if (error) {
          if (status) {
            status.textContent = `Something went wrong: ${error.message}`;
            status.style.color = 'var(--error)';
          }
        } else {
          if (status) {
            status.textContent = `Check ${email} for a sign-in link.`;
            status.style.color = 'var(--sage)';
          }
          input.value = '';
        }
      });
    });

    // Sign-out buttons
    document.querySelectorAll('[data-auth="signout"]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        signOut();
      });
    });
  });

  function setBusy(el, busy) {
    if (!el) return;
    el.disabled = !!busy;
    el.style.opacity = busy ? '0.6' : '';
    el.style.pointerEvents = busy ? 'none' : '';
  }

  function showError(el, msg) {
    setBusy(el, false);
    // Look for a nearby .auth-status to surface; otherwise alert.
    const card = el.closest('.auth-card');
    const status = card && card.querySelector('.auth-status');
    if (status) {
      status.textContent = msg;
      status.style.color = 'var(--error)';
    } else {
      alert(msg);
    }
  }
})();
