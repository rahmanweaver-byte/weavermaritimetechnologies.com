// Guided tour for the portal demo: follows one compartment from the technician's
// tablet to the customer's desk. Replaces each demo page's banner with a tour bar
// and highlights the part of the screen the step is about.
(() => {
  'use strict';

  const STEPS = [
    {
      page: 'field.html',
      title: 'In the space',
      text: "A Weaver Maritime Technologies technician scans the QR code posted in compartment 2-126-1-L. The tablet shows today's work for that space, and every status change and photo posts to your portal.",
      spot: 'Ready for QA',
    },
    {
      page: 'portal-demo.html',
      title: 'At your desk',
      text: 'Your team signs in with its own company accounts and sees only the projects it is assigned to. Every sign-in and view is logged.',
      spot: 'Sign in with your company account',
    },
    {
      page: 'dashboard.html',
      title: 'The availability at a glance',
      text: "The technician's update is already here: 126-1-L sits in final inspection on the closeout map and tops the live feed, beside schedule and open-item counts.",
      spot: '126-1-L',
    },
    {
      page: 'compartment.html',
      title: 'One space, start to finish',
      text: 'Each compartment carries its checklist, quality evidence and history. When Weaver Maritime Technologies QA passes it, you schedule your walkthrough and sign off here.',
      spot: 'Schedule your walkthrough',
    },
    {
      page: 'open-items.html',
      title: 'Decisions in one click',
      text: 'When the crew finds a problem, it arrives with a sketch and a proposed fix. Approve it or ask a question, and the work keeps moving.',
      spot: 'Approve the proposed fix',
    },
    {
      page: 'reports.html',
      title: 'The weekly roll-up',
      text: "Every Monday at 06:00 a status report is ready: alteration progress, closeouts, open items and next week's plan, to download or receive by email.",
      spot: 'Week of October 26',
    },
  ];

  const banner = document.querySelector('.demo-bar');
  if (!banner) return;

  const file = location.pathname.split('/').pop() || 'index.html';
  const index = STEPS.findIndex((s) => s.page === file);
  const step = STEPS[index];

  const style = document.createElement('style');
  style.textContent = `
    .tour{position:relative;z-index:50;background:#DDA868;color:#0B2136;font-family:'Archivo',system-ui,sans-serif;box-shadow:0 6px 18px rgba(11,33,54,.18)}
    .tour-row{display:flex;flex-wrap:wrap;align-items:center;gap:10px 28px;max-width:1240px;margin:0 auto;padding:12px clamp(16px,4vw,40px)}
    .tour-progress{display:flex;align-items:center;gap:12px;flex:none}
    .tour-count{font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap}
    .tour-dots{display:flex;gap:6px;margin:0;padding:0;list-style:none}
    .tour-dots a{display:block;width:22px;height:6px;border-radius:3px;background:rgba(11,33,54,.22)}
    .tour-dots a.is-done{background:rgba(11,33,54,.55)}
    .tour-dots a[aria-current]{background:#0B2136}
    .tour-copy{flex:1 1 380px;margin:0;font-size:15px;line-height:1.45}
    .tour-copy strong{font-weight:700}
    .tour-nav{display:flex;gap:8px;flex:none;margin-left:auto}
    .tour-btn{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border:1.5px solid #0B2136;border-radius:999px;background:#0B2136;color:#fff;font-size:14px;font-weight:700;text-decoration:none;white-space:nowrap}
    .tour-btn:hover{background:#13324F;border-color:#13324F;color:#fff}
    .tour-btn--ghost{background:transparent;color:#0B2136}
    .tour-btn--ghost:hover{background:rgba(11,33,54,.08);color:#0B2136}
    .tour-foot{display:flex;flex-wrap:wrap;justify-content:space-between;gap:4px 16px;max-width:1240px;margin:0 auto;padding:0 clamp(16px,4vw,40px) 10px;font-size:12.5px}
    .tour-foot a{color:#0B2136;font-weight:600}
    .tour-spot{outline:3px solid #C88B45 !important;outline-offset:3px;animation:tour-pulse 1.8s ease-out infinite}
    @keyframes tour-pulse{0%{box-shadow:0 0 0 0 rgba(200,139,69,.55)}100%{box-shadow:0 0 0 14px rgba(200,139,69,0)}}
    @media (min-width:700px){.tour{position:sticky;top:0}}
    @media (max-width:640px){.tour-dots{display:none}.tour-copy{font-size:14px}.tour-nav{width:100%}.tour-nav .tour-btn{flex:1;justify-content:center}}
    @media (prefers-reduced-motion:reduce){.tour-spot{animation:none}}
  `;
  document.head.appendChild(style);

  const el = (tag, attrs = {}, text) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const bar = el('div', { class: 'tour', role: 'region', 'aria-label': 'Guided tour of the portal demo' });
  const row = el('div', { class: 'tour-row' });
  const foot = el('div', { class: 'tour-foot' });
  foot.append(el('span', {}, 'Portal demo with sample data. Nothing you click is saved.'));

  if (step) {
    const progress = el('div', { class: 'tour-progress' });
    progress.append(el('span', { class: 'tour-count' }, `Step ${index + 1} of ${STEPS.length}`));
    const dots = el('ol', { class: 'tour-dots' });
    STEPS.forEach((s, i) => {
      const a = el('a', { href: s.page, 'aria-label': `Step ${i + 1}: ${s.title}` });
      if (i < index) a.className = 'is-done';
      if (i === index) a.setAttribute('aria-current', 'step');
      const li = el('li');
      li.append(a);
      dots.append(li);
    });
    progress.append(dots);

    const copy = el('p', { class: 'tour-copy' });
    copy.append(el('strong', {}, `${step.title}. `), step.text);

    const nav = el('div', { class: 'tour-nav' });
    const prev = STEPS[index - 1];
    const next = STEPS[index + 1];
    if (prev) nav.append(el('a', { class: 'tour-btn tour-btn--ghost', href: prev.page, 'data-tour': 'prev' }, 'Back'));
    if (next) {
      nav.append(el('a', { class: 'tour-btn', href: next.page, 'data-tour': 'next' }, `Next: ${next.title} →`));
    } else {
      nav.append(el('a', { class: 'tour-btn tour-btn--ghost', href: './#contact-form' }, 'Ask for a walkthrough'));
      nav.append(el('a', { class: 'tour-btn', href: './#portal', 'data-tour': 'next' }, 'Finish the tour'));
    }
    row.append(progress, copy, nav);
    foot.append(el('a', { href: './' }, 'Exit the demo'));
  } else {
    // Screens outside the tour (such as the alteration schedule) offer a way in
    const copy = el('p', { class: 'tour-copy' });
    copy.append(el('strong', {}, 'Portal demo. '), 'Follow one compartment from the deckplate to your desk in six short steps.');
    const nav = el('div', { class: 'tour-nav' });
    nav.append(el('a', { class: 'tour-btn', href: STEPS[0].page }, 'Start the guided tour →'));
    row.append(copy, nav);
    foot.append(el('a', { href: './' }, 'Back to weavermaritimetechnologies.com'));
  }

  bar.append(row, foot);
  banner.replaceWith(bar);

  // Highlight the part of the screen this step talks about
  if (step && step.spot) {
    const exact = [...document.body.querySelectorAll('*')].filter((node) => {
      if (node.closest('.tour') || node.textContent.trim() !== step.spot) return false;
      return ![...node.children].some((child) => child.textContent.trim() === step.spot);
    });
    const targets = [...new Set(exact.map((node) => node.closest('a, button') || node))];
    targets.forEach((node) => node.classList.add('tour-spot'));
    const first = targets[0];
    if (first) {
      // Scroll only as far as needed, so the surrounding context stays in view
      requestAnimationFrame(() => {
        const r = first.getBoundingClientRect();
        if (r.bottom > window.innerHeight - 24) {
          window.scrollTo({ top: window.scrollY + r.bottom - window.innerHeight + 80, behavior: 'smooth' });
        }
      });
    }
  }

  // Arrow keys step through the tour
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || /input|textarea|select/i.test(e.target.tagName)) return;
    const target = { ArrowRight: 'next', ArrowLeft: 'prev' }[e.key];
    const link = target && bar.querySelector(`[data-tour="${target}"]`);
    if (link) location.href = link.href;
  });
})();
