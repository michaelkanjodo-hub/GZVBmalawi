/* =========================================================
   Extra site UX — theme, cookies, search, a11y, forms, FAQ
   ========================================================= */
const EXTRAS = {
  updated: '25 Aug 2026',
  pages: [
    { title: 'Home', href: 'index.html', keys: 'train play rise countdown score pad map highlights' },
    { title: 'Training', href: 'training.html', keys: 'serve spike pass set block fitness drills' },
    { title: 'Live', href: 'live.html', keys: 'stream watch highlights reel go live camera' },
    { title: 'Videos', href: 'videos.html', keys: 'upload video highlights training match replay community' },
    { title: 'Teams', href: 'teams.html', keys: 'roster city coach logo' },
    { title: 'Leaderboard', href: 'leaderboard.html', keys: 'rank points mvp players stats' },
    { title: 'Matches', href: 'matches.html', keys: 'book fixture schedule results practice' },
    { title: 'Register', href: 'register.html', keys: 'player team signup waiver medical' },
    { title: 'Donate', href: 'donate.html', keys: 'support money mwk fundraiser' },
    { title: 'Login', href: 'login.html', keys: 'account sign in coach' },
    { title: 'Locker', href: 'locker.html', keys: 'coach strategy feedback roster' }
  ],
  faqs: [
    { q: 'Who can join Gen Z Volleyball Malawi?', a: 'Players under 25. You must be 13+ to register, and 18+ (or have a guardian) to sign the waiver.' },
    { q: 'How do I watch a live stream?', a: 'Open Live, or tap a Watch link someone shared. Camera streams use a direct watch link — no codes to copy.' },
    { q: 'How do I book a match?', a: 'Log in, go to Matches, tap Book a Match, pick your team, venue and time.' },
    { q: 'Is my data private?', a: 'Profile photos and scores stay in your browser unless league sync is configured by an admin. Medical forms are only for coaches.' },
    { q: 'How do donations work?', a: 'Choose an amount in MWK and a payment method. You\'ll get an on-screen confirmation. Funds go to gear, transport and court hire.' }
  ],

  init() {
    this.captureUtm();
    this.skipLink();
    this.loader();
    this.themeToggle();
    this.search();
    this.backToTop();
    this.cookieBanner();
    this.passwordToggles();
    this.copyButtons();
    this.formHelpers();
    this.faq();
    this.floatingContact();
    this.lastUpdated();
    this.scoreProgress();
    this.markMain();
  },

  captureUtm() {
    const p = new URLSearchParams(location.search);
    const utm = {};
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'].forEach(k => {
      if (p.get(k)) utm[k] = p.get(k);
    });
    if (Object.keys(utm).length) {
      sessionStorage.setItem('gzvm_utm', JSON.stringify(utm));
    }
  },
  getUtm() {
    try { return JSON.parse(sessionStorage.getItem('gzvm_utm') || '{}'); } catch { return {}; }
  },

  skipLink() {
    if (document.querySelector('.skip-link')) return;
    const a = document.createElement('a');
    a.className = 'skip-link';
    a.href = '#main';
    a.textContent = 'Skip to content';
    document.body.prepend(a);
  },
  markMain() {
    const m = document.querySelector('main');
    if (m && !m.id) m.id = 'main';
  },

  loader() {
    if (document.getElementById('page-loader')) return;
    const bar = document.createElement('div');
    bar.id = 'top-progress';
    document.body.appendChild(bar);
    requestAnimationFrame(() => { bar.style.width = '70%'; });
    const el = document.createElement('div');
    el.id = 'page-loader';
    el.innerHTML = '<div class="loader-ball" aria-hidden="true"></div>';
    document.body.appendChild(el);
    window.addEventListener('load', () => {
      bar.style.width = '100%';
      el.classList.add('done');
      setTimeout(() => bar.remove(), 400);
    });
    setTimeout(() => { el.classList.add('done'); bar.style.width = '100%'; }, 1800);
  },

  themeToggle() {
    const saved = localStorage.getItem('gzvm_theme');
    if (saved) document.documentElement.setAttribute('data-theme', saved);
    const btn = document.createElement('button');
    btn.className = 'theme-toggle';
    btn.type = 'button';
    btn.title = 'Toggle light / dark';
    btn.setAttribute('aria-label', 'Toggle colour theme');
    const sync = () => {
      const light = document.documentElement.getAttribute('data-theme') === 'light';
      btn.textContent = light ? '☀️' : '🌙';
    };
    sync();
    btn.addEventListener('click', () => {
      const next = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('gzvm_theme', next);
      sync();
    });
    this.placeInNav(btn);
  },

  search() {
    const btn = document.createElement('button');
    btn.className = 'search-toggle';
    btn.type = 'button';
    btn.textContent = '⌕';
    btn.title = 'Search the site';
    btn.setAttribute('aria-label', 'Search');
    const overlay = document.createElement('div');
    overlay.id = 'search-overlay';
    overlay.innerHTML = `<div class="box">
      <input id="site-search-input" class="form-control" type="search" placeholder="Search pages, training, teams…" autofocus>
      <div id="search-results"></div>
      <p class="muted" style="font-size:0.8rem;margin-top:0.6rem">Esc to close</p>
    </div>`;
    document.body.appendChild(overlay);
    const render = (q) => {
      const needle = (q || '').toLowerCase().trim();
      const hits = this.pages.filter(p =>
        !needle || p.title.toLowerCase().includes(needle) || p.keys.includes(needle)
      );
      document.getElementById('search-results').innerHTML = hits.map(p =>
        `<a href="${p.href}"><strong>${p.title}</strong><div class="muted" style="font-size:0.8rem">${p.keys}</div></a>`
      ).join('') || '<p class="muted">No matches</p>';
    };
    const open = () => { overlay.classList.add('open'); const i = document.getElementById('site-search-input'); i.value = ''; render(''); setTimeout(() => i.focus(), 50); };
    const close = () => overlay.classList.remove('open');
    btn.addEventListener('click', open);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') close();
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') { e.preventDefault(); open(); }
    });
    overlay.addEventListener('input', e => { if (e.target.id === 'site-search-input') render(e.target.value); });
    this.placeInNav(btn);
  },

  placeInNav(el) {
    const tryPlace = () => {
      const inner = document.querySelector('.nav-inner');
      if (!inner) return false;
      const toggle = inner.querySelector('.nav-toggle');
      if (toggle) inner.insertBefore(el, toggle);
      else inner.appendChild(el);
      return true;
    };
    if (!tryPlace()) setTimeout(tryPlace, 300);
  },

  backToTop() {
    const b = document.createElement('button');
    b.id = 'to-top';
    b.type = 'button';
    b.textContent = '↑';
    b.title = 'Back to top';
    b.setAttribute('aria-label', 'Back to top');
    b.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
    document.body.appendChild(b);
    window.addEventListener('scroll', () => b.classList.toggle('show', window.scrollY > 400), { passive: true });
  },

  cookieBanner() {
    if (localStorage.getItem('gzvm_cookies')) return;
    const bar = document.createElement('div');
    bar.className = 'cookie-banner';
    bar.innerHTML = `<p>We use a few cookies to remember your theme and keep the site working. No ads.</p>
      <button class="btn btn-primary btn-sm" id="cookie-ok">OK</button>
      <button class="btn btn-ghost btn-sm" id="cookie-no">Decline</button>`;
    document.body.appendChild(bar);
    const done = (v) => { localStorage.setItem('gzvm_cookies', v); bar.remove(); };
    bar.querySelector('#cookie-ok').addEventListener('click', () => done('ok'));
    bar.querySelector('#cookie-no').addEventListener('click', () => done('no'));
  },

  passwordToggles() {
    document.querySelectorAll('input[type="password"]').forEach(input => {
      if (input.closest('.pw-wrap')) return;
      const wrap = document.createElement('div');
      wrap.className = 'pw-wrap';
      input.parentNode.insertBefore(wrap, input);
      wrap.appendChild(input);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pw-toggle';
      btn.textContent = 'Show';
      btn.addEventListener('click', () => {
        const show = input.type === 'password';
        input.type = show ? 'text' : 'password';
        btn.textContent = show ? 'Hide' : 'Show';
      });
      wrap.appendChild(btn);
    });
  },

  copyButtons() {
    document.querySelectorAll('code, [data-copy]').forEach(el => {
      if (el.dataset.copyBound) return;
      el.dataset.copyBound = '1';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'copy-btn-inline';
      btn.textContent = 'Copy';
      btn.addEventListener('click', () => {
        const text = el.getAttribute('data-copy') || el.textContent;
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = 'Copied';
          if (window.APP) APP.toast('Copied', 'success');
          setTimeout(() => btn.textContent = 'Copy', 1500);
        });
      });
      el.after(btn);
    });
  },

  formHelpers() {
    document.querySelectorAll('form').forEach(form => {
      if (form.dataset.extrasBound) return;
      form.dataset.extrasBound = '1';
      form.addEventListener('submit', () => {
        const utm = this.getUtm();
        if (Object.keys(utm).length) {
          let f = form.querySelector('input[name="utm"]');
          if (!f) { f = document.createElement('input'); f.type = 'hidden'; f.name = 'utm'; form.appendChild(f); }
          f.value = JSON.stringify(utm);
        }
      });
    });
  },

  confirm(message) {
    return new Promise(resolve => {
      const existing = document.getElementById('confirm-modal');
      if (existing) existing.remove();
      const m = document.createElement('div');
      m.id = 'confirm-modal';
      m.className = 'modal-backdrop open';
      m.innerHTML = `<div class="modal" style="max-width:420px">
        <h3>Please confirm</h3>
        <p class="muted">${message}</p>
        <div style="display:flex;gap:0.5rem;margin-top:1rem;justify-content:flex-end">
          <button class="btn btn-ghost btn-sm" data-no>Cancel</button>
          <button class="btn btn-primary btn-sm" data-yes>Confirm</button>
        </div>
      </div>`;
      document.body.appendChild(m);
      m.querySelector('[data-no]').addEventListener('click', () => { m.remove(); resolve(false); });
      m.querySelector('[data-yes]').addEventListener('click', () => { m.remove(); resolve(true); });
      m.addEventListener('click', e => { if (e.target === m) { m.remove(); resolve(false); } });
    });
  },

  showSuccess(form, title, body) {
    let box = form.parentNode.querySelector('.form-success');
    if (!box) {
      box = document.createElement('div');
      box.className = 'form-success';
      form.parentNode.appendChild(box);
    }
    box.innerHTML = `<div class="icon">✅</div><h3>${title}</h3><p class="muted">${body}</p>`;
    box.classList.add('show');
    form.style.display = 'none';
  },

  faq() {
    if (document.getElementById('site-faq')) return;
    const footer = document.querySelector('footer');
    if (!footer) return;
    const sec = document.createElement('section');
    sec.id = 'site-faq';
    sec.innerHTML = `<div class="container">
      <div class="section-title"><span class="badge">FAQ</span><h2>Questions</h2></div>
      <div class="faq-list">${this.faqs.map((f, i) =>
        `<div class="faq-item"><button type="button" aria-expanded="false">${f.q}</button><div class="faq-body">${f.a}</div></div>`
      ).join('')}</div>
    </div>`;
    footer.parentNode.insertBefore(sec, footer);
    sec.querySelectorAll('.faq-item button').forEach(btn => {
      btn.addEventListener('click', () => {
        const item = btn.parentElement;
        const open = item.classList.toggle('open');
        btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      });
    });
  },

  floatingContact() {
    if (document.getElementById('contact-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'contact-fab';
    fab.className = 'contact-fab';
    fab.type = 'button';
    fab.title = 'Contact us';
    fab.setAttribute('aria-label', 'Contact');
    fab.textContent = '✉️';
    const panel = document.createElement('div');
    panel.className = 'contact-panel';
    panel.innerHTML = `<h3>Contact</h3>
      <p class="muted" style="font-size:0.85rem">Blantyre · 0993139028 · Michaelkanjodo@gmail.com</p>
      <form id="contact-form">
        <div class="form-group"><label>Name</label><input class="form-control" name="name" required></div>
        <div class="form-group"><label>Email</label><input class="form-control" type="email" name="email" required></div>
        <div class="form-group"><label>Message</label><textarea class="form-control" name="msg" required></textarea></div>
        <button class="btn btn-primary btn-block btn-sm" type="submit">Send</button>
      </form>`;
    document.body.appendChild(fab);
    document.body.appendChild(panel);
    fab.addEventListener('click', () => panel.classList.toggle('open'));
    panel.querySelector('#contact-form').addEventListener('submit', e => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const body = encodeURIComponent(`${fd.get('msg')}\n\nFrom: ${fd.get('name')} <${fd.get('email')}>`);
      location.href = `mailto:Michaelkanjodo@gmail.com?subject=${encodeURIComponent('GZVM contact')}&body=${body}`;
      this.showSuccess(e.target, 'Ready to send', 'Your email app should open. We usually reply within 2 days.');
    });
  },

  lastUpdated() {
    const f = document.querySelector('.footer-bottom');
    if (!f || f.querySelector('.updated-stamp')) return;
    const s = document.createElement('div');
    s.className = 'updated-stamp';
    s.textContent = 'Last updated ' + this.updated;
    f.appendChild(s);
  },

  scoreProgress() {
    const home = document.getElementById('sp-home');
    const away = document.getElementById('sp-away');
    if (!home || !away) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="set-progress" title="Points toward 25"><span id="sp-bar-home"></span></div>
      <div class="set-progress" title="Points toward 25"><span id="sp-bar-away"></span></div>`;
    const sets = document.getElementById('sp-sets');
    if (sets) sets.parentNode.insertBefore(wrap, sets);
    const tick = () => {
      const h = Math.min(100, (parseInt(home.textContent) || 0) / 25 * 100);
      const a = Math.min(100, (parseInt(away.textContent) || 0) / 25 * 100);
      const bh = document.getElementById('sp-bar-home');
      const ba = document.getElementById('sp-bar-away');
      if (bh) bh.style.width = h + '%';
      if (ba) ba.style.width = a + '%';
    };
    new MutationObserver(tick).observe(home, { childList: true, characterData: true, subtree: true });
    new MutationObserver(tick).observe(away, { childList: true, characterData: true, subtree: true });
    tick();
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => EXTRAS.init());
} else {
  EXTRAS.init();
}
window.EXTRAS = EXTRAS;
