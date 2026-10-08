(() => {
  'use strict';

  const root = document.documentElement;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
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

  /* ---------- Hero title: split letters so they can rise in one by one ---------- */
  $$('.hero-title .word').forEach((word) => {
    const text = word.textContent;
    word.textContent = '';
    for (const ch of text) {
      const span = document.createElement('span');
      span.className = 'ch';
      span.textContent = ch;
      span.style.setProperty('--d', (Math.random() * 0.75).toFixed(2) + 's');
      word.appendChild(span);
    }
  });

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
  // The horizon sits just under the giant title, so the letters stand on the water
  // at every screen size. offsetTop ignores the scroll parallax transform.
  const hero = $('.hero');
  const heroTitle = $('.hero-title');
  const letters = $$('.hero-title .ch');
  let letterCenters = [];

  function placeHorizon() {
    if (!hero || !heroTitle) return;
    const fontSize = parseFloat(getComputedStyle(heroTitle).fontSize);
    const bottom = heroTitle.offsetTop + heroTitle.offsetHeight + fontSize * 0.12;
    hero.style.setProperty('--horizon', ((bottom / hero.clientHeight) * 100).toFixed(2) + '%');
  }

  function measureLetters() {
    letterCenters = letters.map((ch) => {
      let x = ch.offsetWidth / 2;
      let y = ch.offsetHeight / 2;
      for (let el = ch; el && el !== heroContent; el = el.offsetParent) { x += el.offsetLeft; y += el.offsetTop; }
      return { x, y };
    });
  }

  const canvas = $('.hero-sea');
  const sea = canvas && canvas.getContext ? initSea(canvas) : null;
  const layoutHero = () => { placeHorizon(); if (sea) sea.resize(); measureLetters(); };
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

      // Letters near the cursor lift and warm to brass
      if (finePointer && heroContent) {
        const local = heroContent.getBoundingClientRect();
        const px = e.clientX - local.left;
        const py = e.clientY - local.top;
        const fs = parseFloat(getComputedStyle(heroTitle).fontSize);
        letters.forEach((ch, i) => {
          const c = letterCenters[i];
          if (!c) return;
          const d = Math.hypot((c.x - px) / (fs * 0.45), (c.y - py) / (fs * 0.7));
          ch.style.setProperty('--heat', clamp(1 - d, 0, 1).toFixed(3));
        });
      }
    }, { passive: true });

    hero.addEventListener('pointerleave', () => {
      hero.style.setProperty('--mx', '0');
      letters.forEach((ch) => ch.style.setProperty('--heat', '0'));
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

  /* ---------- Capability drawings ---------- */
  const planArt = $('.art-plan');
  const closeoutArt = $('.art-closeout');
  const scheduleArt = $('.art-schedule');
  const systemsArt = $('.art-systems');
  if (planArt) initPlanArt(planArt);
  if (closeoutArt) initCloseoutArt(closeoutArt);
  if (scheduleArt) initScheduleArt(scheduleArt);
  if (systemsArt) initSystemsArt(systemsArt);

  // 01: slide the install zone along the hull; frame numbers follow
  function initPlanArt(svg) {
    const zone = $('[data-zone]', svg);
    const dim = $('[data-zone-dim]', svg);
    const label = $('[data-zone-label]', svg);
    const WIDTH = 66;
    const BOW = 728;
    const PX_PER_FRAME = 2.75;
    const HOME = 420;
    let x = HOME;
    let target = HOME;

    const snap = (v) => clamp(BOW - Math.round((BOW - v) / PX_PER_FRAME) * PX_PER_FRAME, 80, BOW - WIDTH);
    const render = () => {
      zone.setAttribute('x', x.toFixed(1));
      dim.setAttribute('d', `M${x.toFixed(1)} 22H${(x + WIDTH).toFixed(1)}M${x.toFixed(1)} 16V28M${(x + WIDTH).toFixed(1)} 16V28`);
      const aft = Math.round((BOW - x) / PX_PER_FRAME);
      label.textContent = `INSTALL ZONE · FR ${aft - 24}–${aft}`;
      label.setAttribute('x', clamp(x + WIDTH / 2, 110, 690).toFixed(1));
    };
    const tick = animator(() => {
      x = lerp(x, target, 0.2);
      if (Math.abs(target - x) < 0.1) x = target;
      render();
      return x !== target;
    });

    svg.addEventListener('pointermove', (e) => { target = snap(toSvgPoint(svg, e).x - WIDTH / 2); tick(); });
    svg.addEventListener('pointerleave', () => { target = HOME; tick(); });

    // Walk through the planning sequence while the card is on screen
    const steps = $$('.step-g', svg);
    let current = steps.length - 1;
    if (!reduceMotion && steps.length) {
      setInterval(() => {
        if (!onScreen.has(svg) || !svg.classList.contains('is-live')) return;
        steps[current].classList.remove('is-on');
        current = (current + 1) % steps.length;
        steps[current].classList.add('is-on');
      }, 1500);
    }
  }

  // 02: compartments cycle open -> in QA -> closed out
  function initCloseoutArt(svg) {
    const art = svg.parentElement;
    const tip = $('.art-tip', art);
    const live = $('[data-live]', art);
    const counter = $('[data-count]', svg);
    const cmps = $$('.cmp', svg);
    const ORDER = ['is-o', 'is-q', 'is-c'];
    const LABEL = { 'is-o': 'Open', 'is-q': 'In QA', 'is-c': 'Closed out' };
    const statusOf = (g) => ORDER.find((c) => g.classList.contains(c)) || 'is-o';
    const nameOf = (g) => $('text', g).textContent;

    function count() {
      const closed = cmps.filter((g) => g.classList.contains('is-c')).length;
      counter.textContent = `${closed} / ${cmps.length} SPACES CLOSED`;
    }

    function showTip(g) {
      const box = $('.box', g).getBoundingClientRect();
      const host = art.getBoundingClientRect();
      tip.textContent = `${nameOf(g)} · ${LABEL[statusOf(g)]}`;
      tip.style.left = `${box.left + box.width / 2 - host.left}px`;
      tip.style.top = `${box.top - host.top}px`;
      tip.hidden = false;
    }
    const hideTip = () => { tip.hidden = true; };

    cmps.forEach((g) => {
      const box = $('.box', g);
      if (!$('.chk', g)) {
        const b = box.getBBox();
        const cx = b.x + b.width / 2;
        const cy = b.y + b.height / 2 + (box.tagName === 'path' ? 28 : 5);
        g.appendChild(svgEl('path', { class: 'chk', d: `M${cx - 9} ${cy}l6 6 12-14` }));
      }
      g.setAttribute('tabindex', '0');
      g.setAttribute('role', 'button');
      const describe = () => g.setAttribute('aria-label', `Compartment ${nameOf(g)}, ${LABEL[statusOf(g)]}. Activate to change status.`);
      describe();

      const cycle = () => {
        const now = statusOf(g);
        const next = ORDER[(ORDER.indexOf(now) + 1) % ORDER.length];
        g.classList.replace(now, next);
        svg.classList.add('is-live');
        describe();
        count();
        showTip(g);
        live.textContent = `${nameOf(g)} marked ${LABEL[next]}`;
      };
      g.addEventListener('click', cycle);
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); cycle(); }
      });
      g.addEventListener('pointerenter', () => showTip(g));
      g.addEventListener('pointerleave', hideTip);
      g.addEventListener('focus', () => showTip(g));
      g.addEventListener('blur', hideTip);
    });
    count();
  }

  // 03: scrub the today line; bars fill and the progress readout follows
  function initScheduleArt(svg) {
    const BARS = [[180, 120], [270, 120], [330, 270], [540, 120], [600, 150]];
    const TOTAL = BARS.reduce((sum, [, width]) => sum + width, 0);
    const MILESTONE = 756;
    const HOME = 480;
    const done = $$('[data-done]', svg);
    const line = $('[data-today-line]', svg);
    const tag = $('[data-today-tag]', svg);
    const tagText = $('[data-today-text]', svg);
    const readout = $('[data-progress]', svg);
    const milestone = $('[data-milestone]', svg);
    let x = HOME;
    let target = HOME;

    const render = () => {
      let complete = 0;
      BARS.forEach(([bx, bw], i) => {
        const filled = clamp(x - bx, 0, bw);
        complete += filled;
        done[i].setAttribute('width', filled.toFixed(1));
      });
      line.setAttribute('d', `M${x.toFixed(1)} 30V306`);
      const tx = clamp(x, 212, 770);
      tag.setAttribute('x', (tx - 30).toFixed(1));
      tagText.setAttribute('x', tx.toFixed(1));
      readout.textContent = `PROGRESS ${Math.round((complete / TOTAL) * 100)}%`;
      milestone.classList.toggle('is-done', x >= MILESTONE);
    };
    const tick = animator(() => {
      x = lerp(x, target, 0.2);
      if (Math.abs(target - x) < 0.1) x = target;
      render();
      return x !== target;
    });

    svg.addEventListener('pointermove', (e) => { target = clamp(toSvgPoint(svg, e).x, 180, 780); tick(); });
    svg.addEventListener('pointerleave', () => { target = HOME; tick(); });
  }

  // 04: pick a rack and a signal runs along its cable to the mast
  function initSystemsArt(svg) {
    const racks = $$('[data-rack]', svg);
    const traces = $$('[data-trace]', svg);
    const readout = $('[data-c5i]', svg);
    let active = 0;
    let holding = false;

    const select = (i) => {
      active = i;
      racks.forEach((r, j) => r.classList.toggle('is-on', j === i));
      traces.forEach((t, j) => t.classList.toggle('is-on', j === i));
      readout.textContent = `W-10${i + 1} · RACK 0${i + 1} → MAST`;
    };

    racks.forEach((rack, i) => {
      rack.setAttribute('tabindex', '0');
      rack.setAttribute('role', 'button');
      rack.setAttribute('aria-label', `Trace cable W-10${i + 1} from rack 0${i + 1} to the mast`);
      rack.addEventListener('pointerenter', () => { holding = true; select(i); });
      rack.addEventListener('pointerleave', () => { holding = false; });
      rack.addEventListener('click', () => select(i));
      rack.addEventListener('focus', () => { holding = true; select(i); });
      rack.addEventListener('blur', () => { holding = false; });
    });
    select(0);

    if (!reduceMotion) {
      setInterval(() => {
        if (holding || !onScreen.has(svg)) return;
        select((active + 1) % racks.length);
      }, 2600);
    }
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
      cursor.classList.toggle('is-hover', !!e.target.closest('a, button, .cmp, .rack, .chip, .instrument-dial'));
    });
    document.documentElement.addEventListener('mouseleave', () => cursor.classList.remove('is-active'));
  }

  /* ---------- Footer year ---------- */
  $$('[data-year]').forEach((el) => { el.textContent = String(new Date().getFullYear()); });
})();
