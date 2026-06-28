/* Motion prototype — reveals, venn fly-in, count-ups, parallax, hero cards.
   Respects prefers-reduced-motion. */
(function () {
  'use strict';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---- count-up ----
  function countUp(el) {
    var target = parseFloat(el.dataset.count);
    var dec = (el.dataset.count.indexOf('.') > -1) ? 1 : 0;
    var suffix = el.dataset.suffix || '';
    var dur = 1100, start = null;
    function step(ts) {
      if (!start) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      el.textContent = (target * eased).toFixed(dec) + suffix;
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = target.toFixed(dec) + suffix;
    }
    if (reduce) { el.textContent = target.toFixed(dec) + suffix; return; }
    requestAnimationFrame(step);
  }

  // ---- intersection reveals ----
  var io = new IntersectionObserver(function (entries) {
    entries.forEach(function (e) {
      if (!e.isIntersecting) return;
      var el = e.target;
      el.classList.add('visible');

      if (el.classList.contains('venn-live')) el.classList.add('in');

      if (el.classList.contains('hero-photo')) {
        el.classList.add('in');
        // start perpetual float once entrance finishes
        setTimeout(function () { el.classList.add('floated'); }, reduce ? 0 : 1400);
      }

      el.querySelectorAll('[data-count]').forEach(countUp);
      if (el.hasAttribute('data-count')) countUp(el);

      io.unobserve(el);
    });
  }, { threshold: 0.2, rootMargin: '0px 0px -60px 0px' });

  document.querySelectorAll('.reveal, .stagger, .venn-live, .hero-photo, [data-count]').forEach(function (el) {
    io.observe(el);
  });

  // ---- parallax on full-bleed band backgrounds ----
  if (!reduce) {
    var layers = Array.prototype.slice.call(document.querySelectorAll('[data-parallax]'));
    if (layers.length) {
      var ticking = false;
      function update() {
        var vh = window.innerHeight;
        layers.forEach(function (img) {
          var r = img.parentElement.getBoundingClientRect();
          if (r.bottom < -100 || r.top > vh + 100) return;
          var center = r.top + r.height / 2;
          var off = (center - vh / 2) / vh; // -1..1
          var amt = parseFloat(img.dataset.parallax) || 40;
          img.style.transform = 'translate3d(0,' + (off * amt).toFixed(1) + 'px,0) scale(1.18)';
        });
        ticking = false;
      }
      window.addEventListener('scroll', function () {
        if (!ticking) { requestAnimationFrame(update); ticking = true; }
      }, { passive: true });
      update();
    }
  }
})();
