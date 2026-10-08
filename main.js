(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const narrow = window.matchMedia('(max-width: 700px)');
  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => Array.from(ctx.querySelectorAll(sel));
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const SVG_NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const key in attrs) el.setAttribute(key, attrs[key]);
    return el;
  }

  // Client coordinates to an SVG's own user units
  function toSvgPoint(svg, e) {
    return new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
  }

  // Runs `step` every frame until it returns false; calling the result again restarts it
  function animator(step) {
    let id = 0;
    const run = () => { id = step() ? requestAnimationFrame(run) : 0; };
    return () => { if (!id) id = requestAnimationFrame(run); };
  }

  /* ---------- Statement: split words for the scroll highlight ---------- */
  const statement = $('.statement-text');
  const words = [];
  if (statement) {
    const parts = statement.textContent.trim().split(/\s+/);
    statement.textContent = '';
    parts.forEach((part, i) => {
      const span = document.createElement('span');
      span.className = 'w';
      span.textContent = part;
      statement.appendChild(span);
      if (i < parts.length - 1) statement.appendChild(document.createTextNode(' '));
      words.push(span);
    });
  }

  /* ---------- Preloader ---------- */
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const pageLoaded = new Promise((resolve) => {
    if (document.readyState === 'complete') resolve();
    else window.addEventListener('load', resolve, { once: true });
  });
  const fontsLoaded = document.fonts ? document.fonts.ready : Promise.resolve();
  Promise.race([
    Promise.all([wait(reduceMotion ? 0 : 900), pageLoaded, fontsLoaded]),
    wait(2600),
  ]).then(() => root.classList.add('is-loaded'));

  /* ---------- Smooth scrolling ---------- */
  let lenis = null;
  if (window.Lenis && !reduceMotion) {
    lenis = new window.Lenis({ lerp: 0.1, smoothWheel: true });
    const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
    requestAnimationFrame(raf);
  }

  /* ---------- Menu ---------- */
  const menu = $('#site-menu');
  const toggle = $('.menu-toggle');
  const toggleLabel = $('.menu-label', toggle);
  const page = [$('#main'), $('.site-footer')];
  const isMenuOpen = () => root.classList.contains('menu-open');
  menu.inert = true;

  function setMenu(open, focusFirst = false) {
    root.classList.toggle('menu-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggleLabel.textContent = open ? 'Close' : 'Menu';
    menu.inert = !open;
    page.forEach((el) => { if (el) el.inert = open; });
    if (lenis) open ? lenis.stop() : lenis.start();
    else document.body.style.overflow = open ? 'hidden' : '';
    if (open && focusFirst) setTimeout(() => $('a', menu).focus({ preventScroll: true }), 350);
  }
  // detail === 0 means the button was activated from the keyboard
  toggle.addEventListener('click', (e) => setMenu(!isMenuOpen(), e.detail === 0));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isMenuOpen()) { setMenu(false); toggle.focus(); }
  });

  /* ---------- In-page links ---------- */
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const hash = link.getAttribute('href');
    const target = hash.length > 1 ? document.getElementById(hash.slice(1)) : null;
    if (!target) return;
    e.preventDefault();

    const toTop = hash === '#top';
    const go = () => {
      if (lenis) {
        lenis.scrollTo(toTop ? 0 : target, { offset: toTop ? 0 : -72, duration: 1.4 });
      } else if (toTop) {
        window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
      } else {
        target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
      }
      history.replaceState(null, '', toTop ? location.pathname + location.search : hash);
      if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    };

    if (isMenuOpen()) { setMenu(false); setTimeout(go, 450); } else { go(); }
  });

  /* ---------- Reveal on scroll ---------- */
  const revealer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      if (el.classList.contains('art')) {
        el.classList.add('is-drawn');
        // Once the entrance has played, interactions should respond without its delays
        setTimeout(() => el.classList.add('is-live'), 2200);
      } else {
        el.classList.add('is-in');
      }
      revealer.unobserve(el);
    });
  }, { rootMargin: '0px 0px -10% 0px', threshold: 0.15 });
  $$('[data-reveal], .art').forEach((el) => revealer.observe(el));

  // Which drawings are on screen, so their idle animations only run when seen
  const onScreen = new WeakSet();
  const screenWatcher = new IntersectionObserver((entries) => {
    entries.forEach((e) => (e.isIntersecting ? onScreen.add(e.target) : onScreen.delete(e.target)));
  });
  $$('.art').forEach((el) => screenWatcher.observe(el));

  /* ---------- Scroll-linked effects ---------- */
  const heroContent = $('.hero-content');
  const cards = $$('.card');
  const indexLinks = $$('.solutions-list a');
  let cardTops = [];

  function measure() {
    cardTops = cards.map((card) => parseFloat(getComputedStyle(card).top) || 0);
  }

  function onScroll() {
    const y = window.scrollY;
    const vh = window.innerHeight;
    root.classList.toggle('is-scrolled', y > 40);
    if (reduceMotion) return;

    // Hero copy drifts up and fades as you leave it
    if (heroContent && y < vh * 1.2) {
      heroContent.style.transform = `translate3d(0, ${(y * 0.35).toFixed(1)}px, 0)`;
      heroContent.style.opacity = String(clamp(1 - y / (vh * 0.75), 0, 1));
    }

    // Each card shrinks and dims as the next one slides over it
    const cardProgress = cards.map((card, i) => {
      const next = cards[i + 1];
      if (!next) return 0;
      const nextTop = next.getBoundingClientRect().top;
      return clamp(1 - (nextTop - cardTops[i + 1]) / card.offsetHeight, 0, 1);
    });

    // Statement words light up in reading order
    let lit = -1;
    if (statement) {
      const r = statement.getBoundingClientRect();
      if (r.top < vh && r.bottom > 0) {
        lit = clamp((vh * 0.85 - r.top) / (r.height + vh * 0.35), 0, 1) * words.length;
      }
    }

    // Capability index lines brighten near the middle of the screen
    const indexOpacity = indexLinks.map((a) => {
      const r = a.getBoundingClientRect();
      const d = Math.abs(r.top + r.height / 2 - vh / 2) / (vh * 0.42);
      return 1 - clamp(d, 0, 1) * 0.88;
    });

    cards.forEach((card, i) => card.style.setProperty('--p', cardProgress[i].toFixed(3)));
    if (lit >= 0) words.forEach((w, i) => { w.style.opacity = (0.16 + 0.84 * clamp(lit - i, 0, 1)).toFixed(3); });
    indexLinks.forEach((a, i) => a.style.setProperty('--o', indexOpacity[i].toFixed(3)));
  }

  let ticking = false;
  const requestTick = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => { ticking = false; onScroll(); });
  };
  if (lenis) lenis.on('scroll', onScroll);
  window.addEventListener('scroll', requestTick, { passive: true });
  window.addEventListener('resize', () => { measure(); requestTick(); });
  measure();
  onScroll();

  /* ---------- Hero: ocean, horizon and cursor ---------- */
  // The horizon sits just under the headline, so the words stand on the water
  // at every screen size. offsetTop ignores the scroll parallax transform.
  const hero = $('.hero');
  const heroTitle = $('.hero-title');

  function placeHorizon() {
    if (!hero || !heroTitle) return;
    const fontSize = parseFloat(getComputedStyle(heroTitle).fontSize);
    const bottom = heroTitle.offsetTop + heroTitle.offsetHeight + fontSize * 0.2;
    hero.style.setProperty('--horizon', ((bottom / hero.clientHeight) * 100).toFixed(2) + '%');
  }

  const canvas = $('.hero-sea');
  const sea = canvas && canvas.getContext ? initSea(canvas) : null;
  const layoutHero = () => { placeHorizon(); if (sea) sea.resize(); };
  window.addEventListener('resize', layoutHero);
  layoutHero();
  fontsLoaded.then(layoutHero);

  if (hero && !reduceMotion) {
    const hint = $('[data-hero-hint]');
    if (hint && finePointer) hint.textContent = 'Move across the water. Click to ping';
    let last = { x: 0, y: 0, t: 0 };

    hero.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const now = performance.now();
      if (sea && (Math.hypot(sx - last.x, sy - last.y) > 36 || now - last.t > 180)) {
        sea.addRipple(sx, sy, 0.12);
        last = { x: sx, y: sy, t: now };
      }
      hero.style.setProperty('--mx', ((sx / rect.width) * 2 - 1).toFixed(3));
    }, { passive: true });

    hero.addEventListener('pointerleave', () => {
      hero.style.setProperty('--mx', '0');
    });

    hero.addEventListener('pointerdown', (e) => {
      if (!sea || e.target.closest('a, button')) return;
      const rect = canvas.getBoundingClientRect();
      sea.ping(e.clientX - rect.left, e.clientY - rect.top);
    });
  }

  function initSea(canvas) {
    const ctx = canvas.getContext('2d');
    const ROWS = 36;
    const COLS = 96;
    const Z_NEAR = 1.1;
    const Z_FAR = 70;
    const CAMERA = 1.6;
    const start = performance.now();
    const ripples = [];
    const rings = [];
    let w = 0;
    let h = 0;
    let horizon = 0;
    let focal = 1;
    let frame = 0;
    const clock = () => (performance.now() - start) / 1000;

    const swell = (x, z, t) =>
      Math.sin(x * 0.45 + t * 0.7) * 0.1 +
      Math.sin(z * 0.5 - t * 1.05 + x * 0.12) * 0.13 +
      Math.sin(x * 1.3 - z * 0.8 + t * 1.6) * 0.04;

    // Ring waves spreading out from where the cursor touched the water
    function height(x, z, t) {
      let y = swell(x, z, t);
      for (const r of ripples) {
        const age = t - r.t0;
        const d = Math.hypot(x - r.x, z - r.z) - age * 1.4;
        if (d > 0.6 || d < -2.4) continue;
        y += r.amp * Math.exp(-age * 1.1) * Math.exp(-d * d * 5) * Math.cos(d * 9);
      }
      return y;
    }

    // Screen point to a spot on the water plane
    function toWater(sx, sy) {
      const dy = sy - horizon;
      if (dy < 6) return null;
      const z = Math.min((CAMERA * focal) / dy, Z_FAR);
      return { x: ((sx - w / 2) * z) / focal, z };
    }

    function addRipple(sx, sy, amp) {
      const p = toWater(sx, sy);
      if (!p) return false;
      ripples.push({ x: p.x, z: p.z, t0: clock(), amp });
      if (ripples.length > 16) ripples.shift();
      return true;
    }

    function ping(sx, sy) {
      if (addRipple(sx, sy, 0.34)) rings.push({ sx, sy, t0: clock() });
    }

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      horizon = h * (parseFloat(getComputedStyle(canvas.closest('.hero')).getPropertyValue('--horizon')) || 60) / 100;
      // Focal length chosen so the nearest row lands near the bottom edge
      focal = ((h - horizon) * 0.92 * Z_NEAR) / CAMERA;
      draw();
    }

    function draw() {
      const t = clock();
      while (ripples.length && t - ripples[0].t0 > 3.2) ripples.shift();
      while (rings.length && t - rings[0].t0 > 1.8) rings.shift();

      ctx.clearRect(0, 0, w, h);
      ctx.lineWidth = 1;
      for (let r = ROWS - 1; r >= 0; r--) {
        const k = r / (ROWS - 1);
        const z = Z_NEAR * Math.pow(Z_FAR / Z_NEAR, k);
        const half = ((w / 2) / focal) * z * 1.1;
        const alpha = 0.04 + 0.42 * Math.pow(1 - k, 1.6);
        ctx.strokeStyle = `rgba(127, 176, 214, ${alpha.toFixed(3)})`;
        ctx.beginPath();
        for (let c = 0; c <= COLS; c++) {
          const x = -half + (2 * half * c) / COLS;
          const sx = w / 2 + (x * focal) / z;
          const sy = horizon + ((CAMERA - height(x, z, t)) * focal) / z;
          if (c === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
      }

      // Warm glint on the water below the horizon glow
      const gy = horizon + (h - horizon) * 0.2;
      const glint = ctx.createRadialGradient(w / 2, gy, 0, w / 2, gy, w * 0.32);
      glint.addColorStop(0, 'rgba(243, 214, 164, 0.85)');
      glint.addColorStop(1, 'rgba(243, 214, 164, 0)');
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = glint;
      ctx.fillRect(0, horizon, w, h - horizon);
      ctx.globalCompositeOperation = 'source-over';

      // Sonar rings, flattened by perspective the deeper they sit in the scene
      if (rings.length) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, horizon, w, h - horizon);
        ctx.clip();
        ctx.lineWidth = 1.5;
        for (const ring of rings) {
          const depth = clamp((ring.sy - horizon) / (h - horizon), 0.05, 1);
          for (let n = 0; n < 2; n++) {
            const a = t - ring.t0 - n * 0.22;
            if (a <= 0) continue;
            const rx = 10 + a * 260;
            ctx.strokeStyle = `rgba(221, 168, 104, ${(0.8 * (1 - a / 1.8)).toFixed(3)})`;
            ctx.beginPath();
            ctx.ellipse(ring.sx, ring.sy, rx, rx * (0.1 + depth * 0.32), 0, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.restore();
      }
    }

    function loop() {
      draw();
      frame = requestAnimationFrame(loop);
    }

    // Only animate while the hero is on screen
    if (!reduceMotion) {
      new IntersectionObserver(([entry]) => {
        if (entry.isIntersecting && !frame) frame = requestAnimationFrame(loop);
        if (!entry.isIntersecting && frame) { cancelAnimationFrame(frame); frame = 0; }
      }).observe(canvas);
    }
    return { resize, addRipple, ping };
  }

  /* ---------- Hero headline: planned, tracked, closed out ---------- */
  const rotator = $('[data-rotator]');
  if (rotator && !reduceMotion) {
    const wordsInTurn = $$('span', rotator);
    let turn = 0;
    let heroVisible = true;
    new IntersectionObserver(([entry]) => { heroVisible = entry.isIntersecting; }).observe(rotator);
    setInterval(() => {
      if (!heroVisible || !root.classList.contains('is-loaded')) return;
      const out = wordsInTurn[turn];
      turn = (turn + 1) % wordsInTurn.length;
      out.classList.remove('is-on');
      out.classList.add('is-out');
      setTimeout(() => out.classList.remove('is-out'), 700);
      wordsInTurn[turn].classList.add('is-on');
      if (sea) {
        const r = canvas.getBoundingClientRect();
        sea.addRipple(r.width * (0.3 + Math.random() * 0.4), r.height * (0.78 + Math.random() * 0.12), 0.18);
      }
    }, 2600);
  }

  /* ---------- Capability drawings ---------- */
  const planArt = $('.art-plan');
  const closeoutArt = $('.art-closeout');
  const watchArt = $('.art-watch');
  const systemsArt = $('.art-systems');
  if (planArt) initPlanArt(planArt);
  if (closeoutArt) initCloseoutArt(closeoutArt);
  if (watchArt) initWatchArt(watchArt);
  if (systemsArt) initSystemsArt(systemsArt);

  // Runs a drawing's self-playing story. Any interaction pauses it; it picks up again after a quiet spell.
  function storyteller(play, quiet = 9000) {
    let token = 0;
    let timer = 0;
    const start = () => {
      clearTimeout(timer);
      const my = ++token;
      play(() => my === token);
    };
    const interrupt = () => {
      const my = ++token;
      clearTimeout(timer);
      if (!reduceMotion) timer = setTimeout(start, quiet);
      return () => my === token;
    };
    return { start, interrupt };
  }
  function ready(svg) {
    return onScreen.has(svg) && svg.classList.contains('is-live');
  }

  // 01: the planner sequences three alterations, cross-checks frames, finds any that
  // share a space at the same time, resequences them, then sends crews aboard
  function initPlanArt(svg) {
    const BOW = 728;
    const PX = 2.75;
    const LANE_END = 650;
    const ALTS = [
      { label: 'ALT 01', aft: 164, span: 24, slot: 150, dur: 190 },
      { label: 'ALT 02', aft: 116, span: 20, slot: 300, dur: 170 },
      { label: 'ALT 03', aft: 128, span: 24, slot: 330, dur: 160 },
    ];
    const HOME = ALTS.map((a) => a.aft);
    const readout = $('[data-readout]', svg);
    const live = $('[data-live]', svg.parentElement);
    const zones = $$('[data-zone]', svg);
    const tags = $$('[data-zone-tag]', svg);
    const bars = $$('[data-bar]', svg);
    const steps = $$('[data-step]', svg);
    const clashBand = $('[data-clash]', svg);
    const scan = $('[data-scan]', svg);
    const fore = (a) => a.aft - a.span;
    const zoneX = (a) => BOW - a.aft * PX;
    const shareFrames = (a, b) => fore(a) < b.aft && fore(b) < a.aft;
    const shareTime = (r, p) => r.start < p.start + p.a.dur && r.start + r.a.dur > p.start;

    const crews = ALTS.map((_, i) => {
      const g = svgEl('g', { class: 'crew' });
      g.style.setProperty('--cd', `${i * 0.25}s`);
      for (let k = 0; k < 3; k++) g.appendChild(svgEl('circle', { cx: k * 7, cy: 123, r: 3 }));
      $('[data-crews]', svg).appendChild(g);
      return g;
    });
    const marks = ALTS.map(() => $('[data-ruler-marks]', svg).appendChild(svgEl('rect', { class: 'ruler-mark', y: 163, height: 5, rx: 2 })));

    const state = { bars: false, zones: false, crews: false, clash: false, resolved: false };
    const set = (next) => Object.assign(state, next);

    // Once resolved, later alterations slide back until no two share frames at the same time
    function sequence() {
      const placed = [];
      ALTS.forEach((a, i) => {
        const row = { i, a, start: a.slot, after: null };
        let moved = state.resolved;
        while (moved) {
          moved = false;
          for (const p of placed) {
            if (shareFrames(a, p.a) && shareTime(row, p)) { row.start = p.start + p.a.dur; row.after = p.i; moved = true; }
          }
        }
        placed.push(row);
      });
      return placed;
    }

    function describe(rows, clashes) {
      if (clashes.length) {
        const [p, r] = clashes[0];
        return { text: `SPACE CONFLICT · ${p.a.label} / ${r.a.label} · FR ${Math.max(fore(p.a), fore(r.a))}–${Math.min(p.a.aft, r.a.aft)}`, alert: true };
      }
      const over = rows.find((r) => r.start + r.a.dur > LANE_END + 0.5);
      if (over) return { text: `${over.a.label} RUNS PAST THE AVAILABILITY`, alert: true };
      const pushed = rows.filter((r) => r.after !== null);
      if (pushed.length) return { text: `RESEQUENCED · ${pushed.map((r) => `${r.a.label} FOLLOWS ${ALTS[r.after].label}`).join(' · ')}`, alert: false };
      return { text: 'NO SPACE CONFLICTS · PLAN CLEAR', alert: false };
    }

    function render(message) {
      svg.classList.toggle('show-bars', state.bars);
      svg.classList.toggle('show-zones', state.zones);
      svg.classList.toggle('show-crews', state.crews);
      const rows = sequence();
      const clashes = [];
      if (state.clash) {
        rows.forEach((r, i) => rows.slice(0, i).forEach((p) => {
          if (shareFrames(r.a, p.a) && shareTime(r, p)) clashes.push([p, r]);
        }));
      }

      const tagged = [];
      ALTS.forEach((a, i) => {
        const x = zoneX(a);
        const w = a.span * PX;
        const c = x + w / 2;
        const box = $('rect', zones[i]);
        box.setAttribute('x', x.toFixed(1));
        box.setAttribute('width', w.toFixed(1));
        zones[i].setAttribute('aria-valuetext', `Frames ${fore(a)} to ${a.aft}`);
        // Stack labels when zones sit close together
        let tier = 0;
        while (tagged.some((t) => t.tier === tier && Math.abs(t.c - c) < 54)) tier++;
        tagged.push({ c, tier });
        const [name, frames] = $$('text', tags[i]);
        name.setAttribute('x', c.toFixed(1));
        frames.setAttribute('x', c.toFixed(1));
        name.setAttribute('y', 40 + tier * 28);
        frames.setAttribute('y', 52 + tier * 28);
        frames.textContent = `FR ${fore(a)}–${a.aft}`;
        marks[i].setAttribute('x', x.toFixed(1));
        marks[i].setAttribute('width', w.toFixed(1));
        crews[i].style.transform = `translate(${(state.crews ? c - 7 : 92).toFixed(1)}px, 0px)`;
        const involved = clashes.some(([p, r]) => p.i === i || r.i === i);
        zones[i].classList.toggle('is-clash', involved);
        bars[i].classList.toggle('is-clash', involved);
      });
      rows.forEach((r) => {
        bars[r.i].style.transform = `translate(${r.start}px, 0px)`;
        bars[r.i].classList.toggle('is-pushed', r.after !== null);
        bars[r.i].classList.toggle('is-over', r.start + r.a.dur > LANE_END + 0.5);
      });
      if (clashes.length) {
        const [p, r] = clashes[0];
        const to = Math.min(p.a.aft, r.a.aft);
        const from = Math.max(fore(p.a), fore(r.a));
        clashBand.setAttribute('x', (BOW - to * PX).toFixed(1));
        clashBand.setAttribute('width', ((to - from) * PX).toFixed(1));
      }
      clashBand.classList.toggle('is-on', clashes.length > 0);
      const auto = describe(rows, clashes);
      readout.textContent = message || auto.text;
      readout.classList.toggle('is-alert', !message && auto.alert);
    }

    const setStep = (n) => steps.forEach((s, k) => s.classList.toggle('is-on', k === n));

    async function sweep() {
      scan.classList.remove('is-sweeping');
      void scan.getBoundingClientRect();
      scan.classList.add('is-sweeping');
      await wait(1700);
      scan.classList.remove('is-sweeping');
    }

    async function phase(n, alive) {
      setStep(n);
      if (n === 0) { set({ bars: true, zones: false, crews: false, clash: false, resolved: false }); render('SEQUENCING 3 ALTERATIONS'); }
      if (n === 1) { set({ bars: true, zones: true, crews: false, clash: false, resolved: false }); render('DRAWINGS CROSS-CHECKED · 3 / 3'); }
      if (n === 2) {
        set({ bars: true, zones: true, crews: false, clash: false, resolved: false });
        render('CHECKING SPACE ACCESS…');
        if (!reduceMotion) { await sweep(); if (!alive()) return; }
        set({ clash: true });
        render();
        await wait(reduceMotion ? 0 : 1700);
        if (!alive()) return;
        set({ clash: false, resolved: true });
        render();
      }
      if (n === 3) { set({ bars: true, zones: true, crews: true, clash: false, resolved: true }); render(`${ALTS.length} CREWS ON STATION · NO CONFLICTS`); }
    }

    function reset() {
      ALTS.forEach((a, i) => { a.aft = HOME[i]; });
      set({ bars: false, zones: false, crews: false, clash: false, resolved: false });
      setStep(-1);
      render('PLANNING THE AVAILABILITY');
    }

    const story = storyteller(async (alive) => {
      while (alive()) {
        if (!ready(svg)) { await wait(500); continue; }
        reset();
        await wait(900);
        for (let n = 0; n < 4 && alive(); n++) {
          await phase(n, alive);
          if (alive()) await wait(n === 3 ? 3600 : 2100);
        }
      }
    });

    steps.forEach((s, n) => {
      const go = () => { const alive = story.interrupt(); phase(n, alive); };
      s.addEventListener('click', go);
      s.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });

    // Dragging an alteration replans live: anything that now shares its space gets resequenced
    const takeControl = () => {
      story.interrupt();
      set({ bars: true, zones: true, clash: false, resolved: true });
      setStep(2);
    };
    zones.forEach((zone, i) => {
      const a = ALTS[i];
      const moveTo = (aft) => { a.aft = clamp(aft, a.span + 6, 236); render(); };
      zone.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        takeControl();
        zone.setPointerCapture(e.pointerId);
        zone.classList.add('is-dragging');
        const x0 = toSvgPoint(svg, e).x;
        const aft0 = a.aft;
        const move = (ev) => moveTo(Math.round(aft0 - (toSvgPoint(svg, ev).x - x0) / PX));
        const end = () => {
          zone.classList.remove('is-dragging');
          zone.removeEventListener('pointermove', move);
          zone.removeEventListener('pointerup', end);
          zone.removeEventListener('pointercancel', end);
          live.textContent = readout.textContent;
          story.interrupt();
        };
        zone.addEventListener('pointermove', move);
        zone.addEventListener('pointerup', end);
        zone.addEventListener('pointercancel', end);
        render();
      });
      zone.addEventListener('keydown', (e) => {
        const dir = { ArrowLeft: 1, ArrowRight: -1 }[e.key];
        if (!dir) return;
        e.preventDefault();
        takeControl();
        moveTo(a.aft + dir * (e.shiftKey ? 8 : 2));
        live.textContent = readout.textContent;
      });
    });

    reset();
    if (reduceMotion) phase(3, () => true);
    else story.start();
  }

  // 02: an inspector walks the deck; each space's checklist fills in until it closes out
  function initCloseoutArt(svg) {
    const ITEMS = ['PENETRATIONS SEALED', 'INSULATION RESTORED', 'LIGHTING & POWER TESTED', 'LABELS & PLACARDS', 'SPACE CLEANED'];
    const START = [5, 5, 3, 5, 0, 5, 2, 5, 0, 0, 4];
    const ROUTE = [0, 1, 2, 3, 4, 10, 9, 8, 7, 6, 5];
    const HOME = { x: 46, y: 165 };
    const LABEL = { 'is-c': 'CLOSED OUT', 'is-q': 'IN QA', 'is-o': 'OPEN' };
    const plan = $('[data-plan]', svg);
    const panel = $('[data-panel]', svg);
    const trail = $('[data-trail]', svg);
    const inspector = $('[data-inspector]', svg);
    const live = $('[data-live]', svg.parentElement);
    const cmps = $$('.cmp', svg);
    const names = cmps.map((g) => $('text', g).textContent);
    const centers = cmps.map((g) => {
      const b = $('.box', g).getBBox();
      return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
    });
    const done = START.slice();
    const statusOf = (n) => (n >= ITEMS.length ? 'is-c' : n === 0 ? 'is-o' : 'is-q');
    let route = [];
    let shown = ROUTE[0];
    let ui;

    function buildPanel() {
      const compact = narrow.matches;
      svg.setAttribute('viewBox', compact ? '0 0 520 330' : '0 0 800 330');
      svg.classList.toggle('is-compact', compact);
      if (compact) plan.setAttribute('transform', 'translate(-5 -90)');
      else plan.removeAttribute('transform');
      panel.replaceChildren();
      const add = (tag, attrs, text) => {
        const el = svgEl(tag, attrs);
        if (text !== undefined) el.textContent = text;
        panel.appendChild(el);
        return el;
      };
      const checkRow = (x, y, label) => ({
        box: add('rect', { class: 'qa-box', x, y: y - 10, width: 12, height: 12, rx: 2 }),
        tick: add('path', { class: 'qa-tick', d: `M${x + 2.5} ${y - 4}l3 3 5-6` }),
        text: add('text', { class: 'qa-item', x: x + 22, y }, label),
      });
      const out = { items: [] };
      if (compact) {
        add('text', { class: 't-brass', x: 16, y: 174 }, 'INSPECTION RECORD');
        out.id = add('text', { class: 'qa-id', x: 16, y: 202 });
        out.status = add('text', { class: 'qa-status', x: 16, y: 224 });
        add('text', { class: 'wb-head', x: 16, y: 258 }, 'SELL-OFF PACKAGE');
        add('rect', { class: 'wb-track', x: 16, y: 268, width: 220, height: 8, rx: 4 });
        out.meter = add('rect', { class: 'wb-fill', x: 16, y: 268, width: 220, height: 8, rx: 4 });
        out.count = add('text', { class: 't-white', x: 16, y: 298 });
        out.records = add('text', { x: 16, y: 320 });
        ITEMS.forEach((label, k) => out.items.push(checkRow(262, 180 + k * 30, label)));
      } else {
        add('text', { class: 't-brass', x: 540, y: 40 }, 'INSPECTION RECORD');
        out.status = add('text', { class: 'qa-status', x: 780, y: 40, 'text-anchor': 'end' });
        out.id = add('text', { class: 'qa-id', x: 540, y: 74 });
        add('path', { class: 'ln-dim', d: 'M540 88H780' });
        ITEMS.forEach((label, k) => out.items.push(checkRow(540, 114 + k * 25, label)));
        add('path', { class: 'ln-dim', d: 'M540 238H780' });
        add('text', { class: 'wb-head', x: 540, y: 260 }, 'SELL-OFF PACKAGE');
        out.count = add('text', { class: 't-white', x: 780, y: 260, 'text-anchor': 'end' });
        add('rect', { class: 'wb-track', x: 540, y: 270, width: 240, height: 8, rx: 4 });
        out.meter = add('rect', { class: 'wb-fill', x: 540, y: 270, width: 240, height: 8, rx: 4 });
        out.records = add('text', { x: 540, y: 302 });
      }
      return out;
    }

    function paintSpace(i) {
      const g = cmps[i];
      const st = statusOf(done[i]);
      g.classList.remove('is-o', 'is-q', 'is-c');
      g.classList.add(st);
      g.setAttribute('aria-label', `Compartment ${names[i]}, ${LABEL[st].toLowerCase()}, ${done[i]} of ${ITEMS.length} checks. Activate to inspect.`);
    }

    function showRecord(i) {
      shown = i;
      const st = statusOf(done[i]);
      ui.id.textContent = names[i];
      ui.status.textContent = LABEL[st];
      ui.status.setAttribute('class', `qa-status ${st}`);
      ui.items.forEach((row, k) => {
        const on = k < done[i];
        row.box.classList.toggle('is-on', on);
        row.tick.classList.toggle('is-on', on);
        row.text.classList.toggle('is-on', on);
      });
      cmps.forEach((g, k) => g.classList.toggle('is-active', k === i));
    }

    function totals(message) {
      const closed = done.filter((n) => n >= ITEMS.length).length;
      ui.count.textContent = `${closed} / ${done.length} SPACES`;
      ui.meter.style.transform = `scaleX(${(closed / done.length).toFixed(3)})`;
      ui.records.textContent = message || `${done.reduce((sum, n) => sum + n, 0)} QA RECORDS ON FILE`;
    }

    function walkTo(i) {
      const c = centers[i];
      inspector.style.transform = `translate(${c.x}px, ${c.y}px)`;
      route.push(`${c.x} ${c.y}`);
      trail.setAttribute('d', route.length > 1 ? `M${route.join('L')}` : '');
      cmps.forEach((g, k) => g.classList.toggle('is-active', k === i));
    }

    async function inspect(i, alive) {
      walkTo(i);
      await wait(reduceMotion ? 0 : 950);
      if (!alive()) return;
      showRecord(i);
      while (alive() && done[i] < ITEMS.length) {
        await wait(reduceMotion ? 0 : 430);
        if (!alive()) return;
        done[i]++;
        paintSpace(i);
        showRecord(i);
        totals();
      }
    }

    function reset() {
      START.forEach((n, i) => { done[i] = n; paintSpace(i); });
      route = [`${HOME.x} ${HOME.y}`];
      trail.setAttribute('d', '');
      inspector.style.transform = `translate(${HOME.x}px, ${HOME.y}px)`;
      showRecord(ROUTE.find((i) => done[i] < ITEMS.length));
      totals();
    }

    const story = storyteller(async (alive) => {
      while (alive()) {
        if (!ready(svg)) { await wait(500); continue; }
        const next = ROUTE.find((i) => done[i] < ITEMS.length);
        if (next === undefined) {
          cmps.forEach((g) => g.classList.remove('is-active'));
          ui.id.textContent = 'SELL-OFF READY';
          ui.status.textContent = 'ALL CLOSED';
          ui.status.setAttribute('class', 'qa-status is-c');
          totals('PACKAGE READY FOR SELL-OFF');
          await wait(3200);
          if (alive()) reset();
          await wait(1000);
          continue;
        }
        await inspect(next, alive);
        await wait(700);
      }
    });

    cmps.forEach((g, i) => {
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      const go = async () => {
        const alive = story.interrupt();
        await inspect(i, alive);
        if (alive()) live.textContent = `${names[i]} ${done[i] >= ITEMS.length ? 'closed out' : 'in QA'}`;
      };
      g.addEventListener('click', go);
      g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    });

    narrow.addEventListener('change', () => { ui = buildPanel(); showRecord(shown); totals(); });
    ui = buildPanel();
    reset();
    if (!reduceMotion) story.start();
  }

  // 03: a round-the-clock shift dial drives the watch bill beside it
  function initWatchArt(svg) {
    // [crew, headcount, space, tasks done, tasks planned]
    const SHIFTS = {
      day: { name: 'DAY SHIFT', handoff: '1430', crews: [
        ['ELECTRICAL', 6, '2-120-1-C', 3, 4], ['PIPEFITTING', 4, '3-140-0-E', 2, 3],
        ['SHIPFITTING', 5, '2-160-2-Q', 1, 3], ['QA INSPECTION', 2, 'CLOSEOUT WALK', 3, 4]] },
      swing: { name: 'SWING SHIFT', handoff: '2300', crews: [
        ['ELECTRICAL', 4, '2-100-1-L', 2, 3], ['CABLE PULL', 5, 'W-101–103', 1, 2],
        ['PAINT', 3, '2-180-2-A', 2, 2], ['QA INSPECTION', 2, '2-200-1-L', 1, 2]] },
      night: { name: 'NIGHT SHIFT', handoff: '0600', crews: [
        ['HOT WORK', 3, '4-200-0-E', 1, 2], ['FIRE WATCH', 2, '4-200-0-E', 1, 1],
        ['INSULATION', 2, '3-140-0-E', 0, 2], ['CLEANUP', 2, '2-120-2-C', 1, 1]] },
    };
    const CX = 165;
    const CY = 168;
    const dial = $('[data-dial]', svg);
    const hand = $('[data-hand]', svg);
    const timeOut = $('[data-time]', svg);
    const shiftOut = $('[data-shift-name]', svg);
    const board = $('[data-board]', svg);
    const arcs = $$('[data-arc]', svg);
    const arcLabels = $$('[data-arc-label]', svg);

    const ticks = $('[data-ticks]', svg);
    for (let h = 0; h < 24; h++) {
      const major = h % 6 === 0;
      ticks.appendChild(svgEl('path', {
        class: major ? 'ln' : 'ln-dim',
        d: `M${CX} ${CY - 108}V${CY - (major ? 95 : 100)}`,
        transform: `rotate(${h * 15} ${CX} ${CY})`,
      }));
    }

    // Phones get a narrower drawing: smaller dial, and the board drops the space column
    let layout;
    let shown = null;
    function buildBoard() {
      const compact = narrow.matches;
      const x0 = compact ? 240 : 340;
      const right = compact ? 512 : 780;
      svg.setAttribute('viewBox', compact ? '0 0 520 330' : '0 0 800 330');
      svg.classList.toggle('is-compact', compact);
      if (compact) dial.setAttribute('transform', `translate(112 ${CY}) scale(0.78) translate(${-CX} ${-CY})`);
      else dial.removeAttribute('transform');
      board.replaceChildren();

      const add = (tag, attrs, value) => {
        const el = svgEl(tag, attrs);
        if (value !== undefined) el.textContent = value;
        board.appendChild(el);
        return el;
      };
      add('text', { class: 't-brass', x: x0, y: 40 }, 'WATCH BILL');
      const onDeck = add('text', { class: 't-white', x: right, y: 40, 'text-anchor': 'end' });
      add('path', { class: 'ln-dim', d: `M${x0} 52H${right}` });
      add('text', { class: 'wb-head', x: x0, y: 76 }, 'CREW');
      if (compact) {
        add('text', { class: 'wb-head', x: 404, y: 76, 'text-anchor': 'end' }, 'MANNING');
      } else {
        add('text', { class: 'wb-head', x: 470, y: 76 }, 'MANNING');
        add('text', { class: 'wb-head', x: 600, y: 76 }, 'SPACE');
      }
      add('text', { class: 'wb-head', x: right, y: 76, 'text-anchor': 'end' }, 'DONE');

      const rows = [0, 1, 2, 3].map((i) => {
        const y = 108 + i * 44;
        const row = { name: add('text', { class: 'wb-name', x: x0, y }) };
        if (compact) {
          row.size = add('text', { class: 't-white', x: 404, y, 'text-anchor': 'end' });
        } else {
          row.pips = Array.from({ length: 7 }, (_, k) => add('circle', { class: 'pip', cx: 474 + k * 13, cy: y - 4, r: 4.2 }));
          row.space = add('text', { class: 'wb-space', x: 600, y });
        }
        const trackX = compact ? 418 : 690;
        add('rect', { class: 'wb-track', x: trackX, y: y - 7, width: 58, height: 6, rx: 3 });
        row.fill = add('rect', { class: 'wb-fill', x: trackX, y: y - 7, width: 58, height: 6, rx: 3 });
        row.count = add('text', { class: 't-white', x: right, y, 'text-anchor': 'end' });
        if (i < 3) add('path', { class: 'ln-dim', d: `M${x0} ${y + 18}H${right}` });
        return row;
      });
      const tasks = add('text', { class: 't-white', x: x0, y: 300 });
      const handoff = add('text', { class: 't-brass', x: right, y: 300, 'text-anchor': 'end' });
      return { compact, x0, rows, onDeck, tasks, handoff };
    }

    function fillBoard(key) {
      const shift = SHIFTS[key];
      let crew = 0, done = 0, planned = 0;
      shift.crews.forEach(([name, size, space, d, t], i) => {
        const row = layout.rows[i];
        row.name.textContent = name;
        if (row.size) row.size.textContent = String(size);
        if (row.pips) row.pips.forEach((pip, k) => pip.classList.toggle('is-on', k < size));
        if (row.space) row.space.textContent = space;
        row.fill.style.transform = `scaleX(${(d / t).toFixed(3)})`;
        row.count.textContent = `${d}/${t}`;
        crew += size; done += d; planned += t;
      });
      layout.onDeck.textContent = `ON DECK ${crew}`;
      layout.tasks.textContent = `TASKS DONE ${done} / ${planned}`;
      layout.handoff.textContent = `NEXT HANDOFF ${shift.handoff}`;
    }

    function showShift(key) {
      if (key === shown) return;
      const first = shown === null;
      shown = key;
      arcs.forEach((a) => a.classList.toggle('is-on', a.dataset.arc === key));
      arcLabels.forEach((t) => t.classList.toggle('is-on', t.dataset.arcLabel === key));
      shiftOut.textContent = SHIFTS[key].name;
      if (first || reduceMotion) { fillBoard(key); return; }
      board.classList.add('is-swapping');
      setTimeout(() => { fillBoard(shown); board.classList.remove('is-swapping'); }, 160);
    }

    // 15 degrees per hour, 0000 at the top
    const shortest = (from, to) => ((((to - from) % 360) + 540) % 360) - 180;
    const minutesAt = (deg) => (Math.round(((((deg % 360) + 360) % 360) * 4) / 5) * 5) % 1440;
    const shiftAt = (m) => (m >= 360 && m < 870 ? 'day' : m >= 870 && m < 1380 ? 'swing' : 'night');
    let angle = 172.5;
    let target = angle;
    let steering = false;
    let visible = false;
    let last = performance.now();

    function show() {
      hand.setAttribute('transform', `rotate(${angle.toFixed(2)} ${CX} ${CY})`);
      const m = minutesAt(angle);
      timeOut.textContent = String(Math.floor(m / 60)).padStart(2, '0') + String(m % 60).padStart(2, '0');
      showShift(shiftAt(m));
    }

    const tick = animator(() => {
      const now = performance.now();
      const dt = Math.min(now - last, 100) / 1000;
      last = now;
      // Left alone, the clock runs a full day in about half a minute
      if (!steering && !reduceMotion && visible && svg.classList.contains('is-live')) target += dt * 12;
      const delta = shortest(angle, target);
      angle += steering ? delta * 0.2 : delta;
      show();
      return (visible && !reduceMotion) || Math.abs(delta) > 0.05;
    });

    svg.addEventListener('pointermove', (e) => {
      const p = toSvgPoint(svg, e);
      if (p.x > layout.x0 - 16) return;
      const cx = layout.compact ? 112 : CX;
      const pointed = (Math.atan2(p.x - cx, -(p.y - CY)) * 180) / Math.PI;
      target = angle + shortest(angle, pointed);
      steering = true;
      tick();
    });
    svg.addEventListener('pointerleave', () => { steering = false; target = angle; tick(); });

    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) { last = performance.now(); tick(); }
    }).observe(svg);

    narrow.addEventListener('change', () => { layout = buildBoard(); const key = shown; shown = null; showShift(key || 'day'); });
    layout = buildBoard();
    show();
  }

  // 04: each cable moves from routed to pulled, terminated and tested; the schedule keeps score
  function initSystemsArt(svg) {
    const CABLES = [
      { id: 'W-101', route: 'RACK 01 → WHIP', sheet: 'DWG SHT 01' },
      { id: 'W-102', route: 'RACK 02 → RADAR', sheet: 'DWG SHT 02' },
      { id: 'W-103', route: 'RACK 03 → DISH', sheet: 'DWG SHT 03' },
      { id: 'W-104', route: 'RACK 01 → RACK 03', sheet: 'DWG SHT 04' },
    ];
    const RACKS_OF = [[0], [1], [2], [0, 2]];
    const STAGES = ['ROUTED', 'PULLED', 'TERMINATED', 'TESTED'];
    const NEXT_STEP = ['PULL', 'TERMINATE', 'TEST'];
    const RUN_CLASS = ['is-routed', 'is-pulled', 'is-terminated', 'is-tested'];
    const START = [3, 2, 1, 0];
    const stage = START.slice();
    const drawing = $('[data-drawing]', svg);
    const panel = $('[data-panel]', svg);
    const live = $('[data-live]', svg.parentElement);
    const runs = $$('[data-run]', svg);
    const traces = $$('[data-trace]', svg);
    const ends = $$('[data-ends]', svg);
    const racks = $$('[data-rack]', svg);
    let active = -1;
    let ui;

    function buildPanel() {
      const compact = narrow.matches;
      svg.setAttribute('viewBox', compact ? '0 0 520 330' : '0 0 800 330');
      svg.classList.toggle('is-compact', compact);
      if (compact) drawing.setAttribute('transform', 'translate(2 76) scale(0.52)');
      else drawing.removeAttribute('transform');
      panel.replaceChildren();
      const add = (parent, tag, attrs, text) => {
        const el = svgEl(tag, attrs);
        if (text !== undefined) el.textContent = text;
        parent.appendChild(el);
        return el;
      };
      const x0 = compact ? 262 : 510;
      const right = compact ? 512 : 780;
      const out = { rows: [] };
      add(panel, 'text', { class: 't-brass', x: x0, y: 40 }, compact ? 'CABLES' : 'CABLE SCHEDULE');
      out.score = add(panel, 'text', { class: 't-white', x: right, y: 40, 'text-anchor': 'end' });
      add(panel, 'path', { class: 'ln-dim', d: `M${x0} 52H${right}` });
      CABLES.forEach((cable, i) => {
        const y = compact ? 86 + i * 54 : 84 + i * 50;
        const row = add(panel, 'g', {
          class: 'c5i-row', tabindex: 0, role: 'button',
          'aria-label': `Cable ${cable.id}, ${cable.route.replace('→', 'to')}. Activate to move it to the next stage.`,
        });
        add(row, 'rect', { class: 'c5i-hit', x: x0 - 8, y: y - 6, width: right - x0 + 12, height: compact ? 50 : 46, rx: 6 });
        add(row, 'text', { class: 'c5i-id', x: x0, y: y + 14 }, cable.id);
        const status = add(row, 'text', { class: 'c5i-status', x: right, y: y + 14, 'text-anchor': 'end' });
        if (compact) {
          add(row, 'text', { class: 'c5i-route', x: x0, y: y + 34 }, cable.route);
        } else {
          add(row, 'text', { class: 'c5i-route', x: x0 + 58, y: y + 14 }, cable.route);
          add(row, 'text', { class: 'c5i-dwg', x: x0 + 58, y: y + 31 }, cable.sheet);
        }
        const pips = STAGES.map((_, k) => add(row, 'rect', { class: 'c5i-pip', x: right - 52 + k * 13 + 2, y: y + (compact ? 28 : 25), width: 10, height: 4, rx: 2 }));
        if (i < CABLES.length - 1) add(panel, 'path', { class: 'ln-dim', d: `M${x0} ${y + (compact ? 46 : 42)}H${right}` });
        row.addEventListener('click', () => userAdvance(i));
        row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); userAdvance(i); } });
        out.rows.push({ row, status, pips });
      });
      out.next = add(panel, 'text', { class: 't-brass', x: x0, y: compact ? 316 : 300 });
      return out;
    }

    function paint() {
      CABLES.forEach((cable, i) => {
        const s = stage[i];
        runs[i].setAttribute('class', `cable ${RUN_CLASS[s]}${i === active ? ' is-active' : ''}`);
        $$('.cable-end', ends[i]).forEach((c) => c.classList.toggle('is-on', s >= 2));
        const r = ui.rows[i];
        r.status.textContent = STAGES[s];
        r.status.setAttribute('class', `c5i-status s-${s}`);
        r.pips.forEach((p, k) => p.classList.toggle('is-on', k <= s));
        r.row.classList.toggle('is-active', i === active);
      });
      racks.forEach((rack, k) => rack.classList.toggle('is-on', active >= 0 && RACKS_OF[active].includes(k)));
      ui.score.textContent = `TESTED ${stage.filter((s) => s === 3).length} / ${CABLES.length}`;
      const n = stage.findIndex((s) => s < 3);
      ui.next.textContent = n < 0 ? 'ALL CABLES TESTED · RECORDS COMPLETE' : `NEXT · ${NEXT_STEP[stage[n]]} ${CABLES[n].id}`;
    }

    // Pulling draws the cable through its run; testing sends a signal out to the far end
    function animate(i, cls, ms) {
      if (reduceMotion) return;
      const t = traces[i];
      t.classList.remove('is-pulling', 'is-testing');
      void t.getBoundingClientRect();
      t.classList.add(cls);
      setTimeout(() => t.classList.remove(cls), ms);
    }

    async function advance(i, alive, announce) {
      active = i;
      paint();
      await wait(reduceMotion ? 0 : 450);
      if (!alive()) return;
      if (stage[i] < 3) stage[i]++;
      if (stage[i] === 1) animate(i, 'is-pulling', 1200);
      if (stage[i] === 3) animate(i, 'is-testing', 1900);
      paint();
      if (announce) live.textContent = `${CABLES[i].id} ${STAGES[stage[i]].toLowerCase()}`;
    }

    const story = storyteller(async (alive) => {
      while (alive()) {
        if (!ready(svg)) { await wait(500); continue; }
        const n = stage.findIndex((s) => s < 3);
        if (n < 0) {
          active = -1;
          paint();
          await wait(3000);
          if (alive()) { START.forEach((s, i) => { stage[i] = s; }); paint(); }
          await wait(1000);
          continue;
        }
        await advance(n, alive, false);
        await wait(stage[n] === 3 ? 2300 : 1500);
      }
    });

    function userAdvance(i) {
      const alive = story.interrupt();
      if (stage[i] === 3) {
        active = i;
        paint();
        animate(i, 'is-testing', 1900);
        return;
      }
      advance(i, alive, true);
    }

    racks.forEach((rack, k) => {
      rack.setAttribute('tabindex', '0');
      rack.setAttribute('role', 'button');
      rack.setAttribute('aria-label', `Rack 0${k + 1}: move cable ${CABLES[k].id} to the next stage`);
      rack.addEventListener('click', () => userAdvance(k));
      rack.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); userAdvance(k); } });
    });

    narrow.addEventListener('change', () => { ui = buildPanel(); paint(); });
    ui = buildPanel();
    paint();
    if (!reduceMotion) story.start();
  }

  /* ---------- Capability index: floating drawing preview ---------- */
  if (finePointer && !reduceMotion && indexLinks.length) {
    const preview = document.createElement('div');
    preview.className = 'list-preview';
    preview.setAttribute('aria-hidden', 'true');
    const inner = document.createElement('div');
    inner.className = 'list-preview-inner';
    preview.appendChild(inner);
    document.body.appendChild(preview);

    let px = 0, py = 0, cx = 0, cy = 0;
    const follow = animator(() => {
      cx = lerp(cx, px, 0.16);
      cy = lerp(cy, py, 0.16);
      preview.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
      return Math.abs(px - cx) > 0.2 || Math.abs(py - cy) > 0.2;
    });

    indexLinks.forEach((link) => {
      link.addEventListener('pointerenter', (e) => {
        const anchor = document.getElementById(link.hash.slice(1));
        const art = anchor && anchor.nextElementSibling && $('.art', anchor.nextElementSibling);
        if (!art) return;
        const copy = art.cloneNode(true);
        copy.removeAttribute('role');
        copy.removeAttribute('aria-labelledby');
        copy.querySelectorAll('[id], title, [tabindex]').forEach((el) => {
          if (el.tagName === 'title') el.remove();
          el.removeAttribute('id');
          el.removeAttribute('tabindex');
        });
        copy.setAttribute('class', 'art is-drawn');
        inner.replaceChildren(copy);
        if (!preview.classList.contains('is-on')) { cx = px = e.clientX + 200; cy = py = e.clientY; }
        preview.classList.add('is-on');
      });
      link.addEventListener('pointerleave', () => preview.classList.remove('is-on'));
      link.addEventListener('pointermove', (e) => { px = e.clientX + 200; py = e.clientY; follow(); });
    });
  }

  /* ---------- Company: compass instrument ---------- */
  const instrument = $('.instrument');
  if (instrument) initInstrument(instrument);

  function initInstrument(el) {
    const dial = $('.instrument-dial', el);
    const card = $('.dial-card', el);
    const core = $('.instrument-core', el);
    const brg = $('[data-brg]', el);
    const hint = $('[data-instrument-hint]', el);
    if (hint && finePointer) hint.textContent = 'The compass tracks your cursor. Click it to ping.';

    // Compass card: ticks every 5 degrees, labels every 30
    for (let deg = 0; deg < 360; deg += 5) {
      const major = deg % 30 === 0;
      const len = major ? 14 : deg % 10 === 0 ? 9 : 5;
      card.appendChild(svgEl('line', {
        class: major ? 'tick tick--major' : 'tick',
        x1: 200, y1: 24, x2: 200, y2: 24 + len,
        transform: `rotate(${deg} 200 200)`,
      }));
      if (major) {
        const cardinal = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' }[deg];
        const text = svgEl('text', {
          class: cardinal ? `dial-label dial-label--cardinal${deg === 0 ? ' dial-label--north' : ''}` : 'dial-label',
          x: 200, y: cardinal ? 60 : 57, 'text-anchor': 'middle',
          transform: `rotate(${deg} 200 200)`,
        });
        text.textContent = cardinal || String(deg).padStart(3, '0');
        card.appendChild(text);
      }
    }

    let heading = 0;
    let target = 0;
    let tiltX = 0, tiltY = 0, aimX = 0, aimY = 0;
    let tracking = false;
    let visible = false;
    const shortest = (from, to) => ((((to - from) % 360) + 540) % 360) - 180;

    function aimAt(clientX, clientY) {
      const r = dial.getBoundingClientRect();
      const dx = clientX - (r.left + r.width / 2);
      const dy = clientY - (r.top + r.height / 2);
      target = ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
      aimY = clamp(dx / 500, -1, 1) * 14;
      aimX = clamp(-dy / 500, -1, 1) * 14;
    }

    const tick = animator(() => {
      // Without a mouse, the card sways gently like it's afloat
      if (!tracking) target = Math.sin(performance.now() / 2600) * 24;
      heading += shortest(heading, target) * 0.1;
      tiltX = lerp(tiltX, aimX, 0.1);
      tiltY = lerp(tiltY, aimY, 0.1);
      card.style.transform = `rotate(${(-heading).toFixed(2)}deg)`;
      core.style.transform = `rotateX(${tiltX.toFixed(2)}deg) rotateY(${tiltY.toFixed(2)}deg)`;
      brg.textContent = String(Math.round((((heading % 360) + 360) % 360)) % 360).padStart(3, '0') + '°';
      return visible;
    });

    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      if (visible) tick();
    }).observe(el);

    if (!reduceMotion && finePointer) {
      window.addEventListener('pointermove', (e) => {
        if (!visible) return;
        tracking = true;
        aimAt(e.clientX, e.clientY);
      }, { passive: true });
    }

    dial.addEventListener('pointerdown', (e) => {
      tracking = true;
      aimAt(e.clientX, e.clientY);
      tick();
      if (reduceMotion) return;
      const ring = document.createElement('span');
      ring.className = 'ping ping--click';
      ring.setAttribute('aria-hidden', 'true');
      ring.addEventListener('animationend', () => ring.remove());
      dial.appendChild(ring);
    });
  }

  /* ---------- Contact form ---------- */
  const contactForm = $('#contact-form');
  if (contactForm) initContactForm(contactForm);

  function initContactForm(form) {
    const card = form.parentElement;
    const success = $('.form-success', card);
    const endpoint = (form.dataset.endpoint || '').trim();
    const button = $('.btn-send', form);
    const buttonLabel = $('[data-send-label]', form);
    const formError = $('.form-error', form);
    const routeOut = $('[data-route]', form);
    const routeNote = $('[data-route-note]', form);
    const message = $('#f-message', form);
    const counter = $('[data-count-for="f-message"]', form);
    const required = $$('[required]', form);
    const CONTRACTS = 'contracts@weavermaritimetechnologies.com';
    const INFO = 'info@weavermaritimetechnologies.com';
    const MESSAGES = {
      name: 'Please enter your name.',
      email: 'Please enter your email address.',
      message: 'Please add a short message.',
    };

    const topic = () => (form.querySelector('[name="topic"]:checked') || {}).value || 'General';
    const inboxFor = (t) => (t === 'General' ? INFO : CONTRACTS);

    function updateRoute() {
      const inbox = inboxFor(topic());
      routeOut.textContent = inbox;
      form.setAttribute('action', `mailto:${inbox}`);
    }
    if (endpoint) routeNote.textContent = 'Delivered straight to our team.';
    form.addEventListener('change', (e) => { if (e.target.name === 'topic') updateRoute(); });
    updateRoute();

    function setError(input, text) {
      const field = input.closest('.field');
      const out = field && $('.field-error', field);
      field.classList.toggle('is-invalid', !!text);
      input.setAttribute('aria-invalid', text ? 'true' : 'false');
      if (out) out.textContent = text;
    }

    function validate(input) {
      let text = '';
      if (input.validity.valueMissing || !input.value.trim()) text = MESSAGES[input.name];
      else if (input.validity.typeMismatch) text = 'That email address doesn’t look right.';
      setError(input, text);
      return !text;
    }

    required.forEach((input) => {
      input.addEventListener('blur', () => { if (input.value) validate(input); });
      input.addEventListener('input', () => { if (input.closest('.field').classList.contains('is-invalid')) validate(input); });
    });

    const updateCount = () => { counter.textContent = `${message.value.length} / ${message.maxLength}`; };
    message.addEventListener('input', updateCount);
    updateCount();

    // The reset event fires before the fields clear, so refresh on the next tick
    form.addEventListener('reset', () => setTimeout(() => {
      required.forEach((input) => setError(input, ''));
      formError.hidden = true;
      updateRoute();
      updateCount();
    }));

    function buildMailto(data) {
      const inbox = inboxFor(data.topic);
      const subject = `${data.topic} inquiry from ${data.name}${data.company ? `, ${data.company}` : ''}`;
      const lines = [`Topic: ${data.topic}`, `Name: ${data.name}`];
      if (data.company) lines.push(`Company: ${data.company}`);
      lines.push(`Email: ${data.email}`);
      if (data.phone) lines.push(`Phone: ${data.phone}`);
      lines.push('', data.message);
      return `mailto:${inbox}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(lines.join('\n'))}`;
    }

    function showSuccess(mode, data) {
      const inbox = inboxFor(data.topic);
      const first = data.name.trim().split(/\s+/)[0];
      const title = $('[data-success-title]', success);
      const text = $('[data-success-text]', success);
      const link = document.createElement('a');
      link.href = `mailto:${inbox}`;
      link.textContent = inbox;
      if (mode === 'sent') {
        title.textContent = 'Message received';
        text.replaceChildren(`Thanks, ${first}. Your message is with our team, and we’ll reply to ${data.email}.`);
      } else {
        title.textContent = 'Almost there';
        text.replaceChildren(`Your email app should now be open with your message to ${inbox}. Press send there to finish. If nothing opened, write to us directly at `, link, '.');
      }
      form.hidden = true;
      success.hidden = false;
      success.focus();
    }

    function setSending(on) {
      button.classList.toggle('is-sending', on);
      button.disabled = on;
      buttonLabel.textContent = on ? 'Transmitting…' : 'Send message';
    }

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      formError.hidden = true;
      if (form.elements._gotcha.value) return;

      const invalid = required.filter((input) => !validate(input));
      if (invalid.length) { invalid[0].focus(); return; }

      const data = Object.fromEntries(new FormData(form));
      data.topic = topic();
      form.elements._subject.value = `${data.topic} inquiry from ${data.name}`;

      setSending(true);
      await wait(reduceMotion ? 0 : 900);

      if (!endpoint) {
        window.location.href = buildMailto(data);
        setSending(false);
        showSuccess('mailto', data);
        return;
      }

      try {
        const res = await fetch(endpoint, { method: 'POST', body: new FormData(form), headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        showSuccess('sent', data);
        form.reset();
      } catch (err) {
        const inbox = inboxFor(data.topic);
        const link = document.createElement('a');
        link.href = buildMailto(data);
        link.textContent = inbox;
        formError.replaceChildren('We couldn’t send that just now. Please email us at ', link, '.');
        formError.hidden = false;
      } finally {
        setSending(false);
      }
    });

    $('[data-form-reset]', success).addEventListener('click', () => {
      form.reset();
      success.hidden = true;
      form.hidden = false;
      form.querySelector('[name="topic"]:checked').focus();
    });
  }

  /* ---------- Cursor ring (mouse only) ---------- */
  const cursor = $('.cursor');
  if (cursor && !reduceMotion && finePointer) {
    let x = -100, y = -100, cx = -100, cy = -100;
    const follow = animator(() => {
      cx = lerp(cx, x, 0.2);
      cy = lerp(cy, y, 0.2);
      cursor.style.transform = `translate3d(${cx.toFixed(1)}px, ${cy.toFixed(1)}px, 0)`;
      return Math.abs(x - cx) > 0.1 || Math.abs(y - cy) > 0.1;
    });
    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      x = e.clientX; y = e.clientY;
      cursor.classList.add('is-active');
      follow();
    }, { passive: true });
    document.addEventListener('pointerover', (e) => {
      cursor.classList.toggle('is-hover', !!e.target.closest('a, button, .chip, .instrument-dial, [role="button"], [role="slider"]'));
    });
    document.documentElement.addEventListener('mouseleave', () => cursor.classList.remove('is-active'));
  }

  /* ---------- Footer year ---------- */
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
})();
