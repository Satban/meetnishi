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

  window.NishiAuth = {
    client,
    signInWithEmail,
    signInWithGoogle,
    signInWithApple,
    getSession,
    onSession,
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
