/* ============================================================
   Nishi — shared site behavior
   - Sticky nav scroll state
   - Scroll-reveal (IntersectionObserver)
   - Mobile nav drawer
   - Hero video unmute toggle
   - FAQ accordion (native <details>; no JS needed)
   - Form stubs (alert until backend is wired)
   ============================================================ */

(function () {
  'use strict';

  // ----- Sticky nav scrolled state -----
  function initNavScroll() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    const onScroll = () => {
      if (window.scrollY > 12) nav.classList.add('scrolled');
      else nav.classList.remove('scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // ----- Mobile drawer -----
  function initDrawer() {
    const toggle = document.querySelector('.nav-toggle');
    const drawer = document.querySelector('.nav-drawer');
    const closeBtn = document.querySelector('.drawer-close');
    if (!toggle || !drawer) return;

    toggle.addEventListener('click', () => {
      drawer.classList.add('open');
      document.body.style.overflow = 'hidden';
    });

    const close = () => {
      drawer.classList.remove('open');
      document.body.style.overflow = '';
    };

    if (closeBtn) closeBtn.addEventListener('click', close);
    drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
  }

  // ----- Scroll-reveal -----
  function initReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!els.length) return;

    if (!('IntersectionObserver' in window)) {
      els.forEach(el => el.classList.add('visible'));
      return;
    }

    const io = new IntersectionObserver((entries) => {
      entries.forEach(e => {
        if (e.isIntersecting) {
          e.target.classList.add('visible');
          io.unobserve(e.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

    els.forEach(el => io.observe(el));
  }

  // ----- Hero video -----
  function initVideo() {
    const playWrap = document.querySelector('.video-play');
    const video = document.querySelector('#hero-video');
    const muteBtn = document.querySelector('.video-mute-btn');

    if (playWrap && video) {
      playWrap.addEventListener('click', () => {
        playWrap.style.display = 'none';
        video.muted = false;
        video.play().catch(() => {
          // Browser blocked unmuted autoplay — fall back to muted
          video.muted = true;
          video.play();
        });
        if (muteBtn) muteBtn.classList.add('unmuted');
      });
    }

    if (muteBtn && video) {
      muteBtn.addEventListener('click', () => {
        video.muted = !video.muted;
        muteBtn.classList.toggle('unmuted', !video.muted);
      });
    }
  }

  // ----- Form stubs (real backend will replace) -----
  function initFormStubs() {
    document.querySelectorAll('form[data-stub]').forEach(form => {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        const kind = form.dataset.stub;
        const messages = {
          waitlist: 'Thanks. We will let you know when there is something real to share.',
          signup: 'Sign-up will be wired to Supabase. For now this is a UI placeholder.',
          signin: 'Sign-in will be wired to Supabase. For now this is a UI placeholder.',
          forgot: 'We would send a magic link here. For now this is a UI placeholder.',
          checkout: 'Stripe checkout opens here. For now this is a UI placeholder.'
        };
        alert(messages[kind] || 'This form will be wired to a real backend before launch.');
      });
    });

    document.querySelectorAll('[data-checkout]').forEach(el => {
      el.addEventListener('click', (e) => {
        e.preventDefault();
        alert('Stripe Checkout opens here. For now this is a UI placeholder.');
      });
    });
  }

  // ----- Smooth scroll for in-page anchors -----
  function initSmoothScroll() {
    document.querySelectorAll('a[href^="#"]:not([href="#"])').forEach(a => {
      a.addEventListener('click', (e) => {
        const id = a.getAttribute('href').slice(1);
        const target = document.getElementById(id);
        if (target) {
          e.preventDefault();
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      });
    });
  }

  // ----- Boot -----
  function boot() {
    initNavScroll();
    initDrawer();
    initReveal();
    initVideo();
    initFormStubs();
    initSmoothScroll();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
