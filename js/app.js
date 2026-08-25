/* =========================================================
   Gen Z Volleyball Malawi — Core App Logic
   Storage layer + utilities + shared UI
   ========================================================= */

const APP = {
  name: 'Gen Z Volleyball Malawi',
  short: 'GZVM',
  storageKey: 'gzvm_data_v2',

  // ---------- DATA LAYER ----------
  data: {
    users: [],          // {id, name, email, role, passwordHash}
    players: [],        // {id, name, team, position, age, stats:{serve,spike,set,block,pass,dig}, photo, dob, contact, medical, waiver}
    teams: [],          // {id, name, city, coach, contact, members[]}
    matches: [],        // {id, homeTeam, awayTeam, date, venue, status, score:{home,away}, sets:[[h,a],...]}
    bookings: [],       // {id, teamId, type:'match'|'practice', opponent, date, venue, status}
    highlights: [],     // {id, title, player, team, date, thumb, videoUrl, views}
    donations: [],      // {id, name, amount, message, date}
    chat: [],           // {id, user, text, time}
    feedback: [],       // {id, coach, player, videoTitle, text, date}
    strategy: [],       // {id, coach, title, description, videoUrl, date}
    notifications: [],
    scorePad: { home: 0, away: 0, sets: [] }
  },

  load() {
    try {
      const raw = localStorage.getItem(this.storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = { ...this.data, ...parsed };
      }
    } catch (e) { console.warn('Storage load failed', e); }
  },

  save() {
    try { localStorage.setItem(this.storageKey, JSON.stringify(this.data)); }
    catch (e) { console.warn('Storage save failed', e); }
  },

  // ---------- HELPERS ----------
  uid() { return 'id_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8); },

  hash(s) {
    // simple non-cryptographic hash for demo passwords only
    let h = 0;
    for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
    return 'h_' + Math.abs(h);
  },

  fmtDate(d) {
    if (!d) return 'TBD';
    const dt = new Date(d);
    return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  },

  fmtTime(d) {
    const dt = new Date(d);
    return dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  },

  countdown(target) {
    const t = new Date(target).getTime();
    const now = Date.now();
    const diff = Math.max(0, t - now);
    const d = Math.floor(diff / 86400000);
    const h = Math.floor((diff % 86400000) / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    return { d, h, m, s, total: diff };
  },

  // ---------- AUTH ----------
  currentUser() {
    const id = sessionStorage.getItem('gzvm_user');
    return this.data.users.find(u => u.id === id) || null;
  },

  login(email, password) {
    const u = this.data.users.find(x => x.email.toLowerCase() === email.toLowerCase());
    if (!u) throw new Error('No account with that email');
    if (u.passwordHash !== this.hash(password)) throw new Error('Wrong password');
    sessionStorage.setItem('gzvm_user', u.id);
    return u;
  },

  logout() { sessionStorage.removeItem('gzvm_user'); },

  register({ name, email, password, role }) {
    if (this.data.users.some(u => u.email.toLowerCase() === email.toLowerCase()))
      throw new Error('Email already registered');
    const user = {
      id: this.uid(),
      name, email, role: role || 'player',
      passwordHash: this.hash(password),
      createdAt: new Date().toISOString()
    };
    this.data.users.push(user);
    this.save();
    sessionStorage.setItem('gzvm_user', user.id);
    return user;
  },

  // ---------- UI HELPERS ----------
  toast(message, type = 'info') {
    let stack = document.querySelector('.toast-stack');
    if (!stack) {
      stack = document.createElement('div');
      stack.className = 'toast-stack';
      document.body.appendChild(stack);
    }
    const t = document.createElement('div');
    t.className = 'toast ' + type;
    t.textContent = message;
    stack.appendChild(t);
    setTimeout(() => {
      t.style.opacity = '0';
      t.style.transform = 'translateX(120%)';
      t.style.transition = 'all 0.3s';
      setTimeout(() => t.remove(), 300);
    }, 3500);
  },

  // ---------- NAVBAR ----------
  renderNavbar() {
    const nav = document.querySelector('.nav');
    if (!nav) return;
    const user = this.currentUser();
    const syncOn = window.SYNC && SYNC.ready;
    const links = [
      { href: 'index.html', label: 'Home' },
      { href: 'training.html', label: 'Training' },
      { href: 'live.html', label: 'Live' },
      { href: 'teams.html', label: 'Teams' },
      { href: 'leaderboard.html', label: 'Leaderboard' },
      { href: 'matches.html', label: 'Matches' },
      { href: 'register.html', label: 'Register' },
      { href: 'donate.html', label: 'Donate' },
    ];
    const currentPage = location.pathname.split('/').pop() || 'index.html';
    nav.innerHTML = `
      <div class="container nav-inner">
        <a class="brand" href="index.html">
          <div class="logo">🏐</div>
          <div>
            GEN Z <span class="gradient-text">VOLLEYBALL</span>
            <small>MALAWI</small>
          </div>
        </a>
        <button class="nav-toggle" aria-label="menu">☰</button>
        <ul class="nav-links">
          ${links.map(l => `<li><a href="${l.href}" class="${currentPage === l.href ? 'active' : ''}">${l.label}</a></li>`).join('')}
          ${user
            ? `<li><a href="locker.html" class="${currentPage === 'locker.html' ? 'active' : ''}">🔒 Locker</a></li>
               <li><a href="#" id="logout-btn">Logout</a></li>`
            : `<li><a href="login.html" class="${currentPage === 'login.html' ? 'active' : ''}">Login</a></li>`
          }
          <li title="${syncOn ? 'Cross-device sync active' : 'Click to enable cross-device sync'}" style="display:flex; align-items:center; padding:0 0.5rem;">
            <a href="sync-setup.html" style="font-size:0.7rem; font-weight:700; padding:0.2rem 0.6rem; border-radius:999px; background:${syncOn ? 'rgba(25,210,124,0.2)' : 'rgba(255,59,107,0.2)'}; color:${syncOn ? 'var(--c-success)' : 'var(--c-primary)'}; text-decoration:none;">
              ${syncOn ? '● SYNC' : '⚡ ENABLE SYNC'}
            </a>
          </li>
        </ul>
      </div>
    `;
    const toggle = nav.querySelector('.nav-toggle');
    const linksEl = nav.querySelector('.nav-links');
    if (toggle) toggle.addEventListener('click', () => linksEl.classList.toggle('open'));
    const lo = nav.querySelector('#logout-btn');
    if (lo) lo.addEventListener('click', e => { e.preventDefault(); this.logout(); this.toast('Logged out', 'success'); setTimeout(() => location.href = 'index.html', 500); });
  },

  // ---------- FOOTER ----------
  renderFooter() {
    const f = document.querySelector('.footer');
    if (!f) return;
    f.innerHTML = `
      <div class="container">
        <div class="footer-grid">
          <div>
            <h4>${this.name}</h4>
            <p class="muted" style="font-size:0.9rem">Empowering the next generation of Malawian volleyball athletes. Train hard. Play smart. Rise together.</p>
            <div style="margin-top:0.8rem; display:flex; gap:0.5rem;">
              <a href="#" aria-label="Facebook">📘</a>
              <a href="#" aria-label="Instagram">📸</a>
              <a href="#" aria-label="TikTok">🎵</a>
              <a href="#" aria-label="YouTube">▶️</a>
            </div>
          </div>
          <div>
            <h4>Quick Links</h4>
            <ul>
              <li><a href="training.html">Training Tips</a></li>
              <li><a href="teams.html">Teams</a></li>
              <li><a href="leaderboard.html">Leaderboard</a></li>
              <li><a href="matches.html">Book a Match</a></li>
              <li><a href="register.html">Player Registration</a></li>
              <li><a href="donate.html">Donate</a></li>
            </ul>
          </div>
          <div>
            <h4>For Teams</h4>
            <ul>
              <li><a href="locker.html">Coach Locker Room</a></li>
              <li><a href="register.html">Team Sign Up</a></li>
              <li><a href="matches.html">Match Booking</a></li>
              <li><a href="live.html">Live Streaming</a></li>
            </ul>
          </div>
          <div>
            <h4>Contact</h4>
            <ul>
              <li>📍 Blantyre, Malawi</li>
              <li>📞 +265 888 123 456</li>
              <li>✉️ hello@genzvolleyball.mw</li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          © ${new Date().getFullYear()} ${this.name}. All rights reserved. Built with 🏐 for the under-25 community.
        </div>
      </div>
    `;
  },

  // ---------- 3D BG ----------
  renderBackground() {
    if (document.querySelector('.scene-3d')) return;
    const scene = document.createElement('div');
    scene.className = 'scene-3d';
    document.body.prepend(scene);
    // Add 1-2 floating balls
    if (window.innerWidth > 600) {
      const ball = document.createElement('div');
      ball.className = 'ball-3d';
      document.body.appendChild(ball);
    }
  },

  // ---------- TICKER ----------
  renderTicker(containerSel = '.ticker-track') {
    const el = document.querySelector(containerSel);
    if (!el) return;
    const items = [];
    const recent = this.data.matches.filter(m => m.status === 'completed').slice(-6);
    recent.forEach(m => {
      const winner = m.score.home > m.score.away ? m.homeTeam : m.awayTeam;
      const cls = m.score.home > m.score.away ? 'win' : (m.score.home < m.score.away ? 'loss' : 'draw');
      items.push(`<span class="${cls}">🏐 ${m.homeTeam} ${m.score.home} - ${m.score.away} ${m.awayTeam} → ${winner} wins!</span>`);
    });
    if (items.length === 0) {
      el.innerHTML = '<span>🏐 No matches played yet — register a team to get the first result on the board!</span><span>🏐 No matches played yet — register a team to get the first result on the board!</span>';
    } else {
      el.innerHTML = items.join('') + items.join(''); // duplicate for seamless loop
    }
  },

  // ---------- CHAT ----------
  initChat() {
    const fab = document.createElement('button');
    fab.className = 'chat-fab';
    fab.innerHTML = '💬';
    fab.title = 'Open chat';
    fab.setAttribute('aria-label', 'Open chat');

    const panel = document.createElement('div');
    panel.className = 'chat-panel';
    panel.innerHTML = `
      <div class="chat-header">
        <span>🏐 Team Chat</span>
        <button aria-label="Close chat">✕</button>
      </div>
      <div class="chat-body"></div>
      <form class="chat-input">
        <input type="text" placeholder="Type a message..." maxlength="300" required>
        <button type="submit">Send</button>
      </form>
    `;
    document.body.appendChild(fab);
    document.body.appendChild(panel);

    const body = panel.querySelector('.chat-body');
    const input = panel.querySelector('input');
    const form = panel.querySelector('form');

    const render = () => {
      const me = this.currentUser();
      body.innerHTML = this.data.chat.slice(-50).map(m => {
        const isMe = me && m.userId === me.id;
        return `<div class="chat-msg ${isMe ? 'me' : ''}">
          <div class="who">${m.user}</div>
          <div>${this.escapeHtml(m.text)}</div>
        </div>`;
      }).join('');
      body.scrollTop = body.scrollHeight;
    };

    fab.addEventListener('click', () => {
      panel.classList.toggle('open');
      if (panel.classList.contains('open')) render();
    });
    panel.querySelector('.chat-header button').addEventListener('click', () => panel.classList.remove('open'));

    form.addEventListener('submit', e => {
      e.preventDefault();
      const me = this.currentUser();
      const name = me ? me.name : (localStorage.getItem('gzvm_chat_name') || ('Guest_' + Math.floor(Math.random() * 999)));
      if (!me) localStorage.setItem('gzvm_chat_name', name);
      const text = input.value.trim();
      if (!text) return;
      this.data.chat.push({ id: this.uid(), userId: me?.id, user: name, text, time: Date.now() });
      if (this.data.chat.length > 200) this.data.chat = this.data.chat.slice(-200);
      this.save();
      input.value = '';
      render();
    });
  },

  escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },

  // ---------- 3D TILT EFFECT ----------
  attachTilt(selector = '.card-3d') {
    document.querySelectorAll(selector).forEach(card => {
      card.addEventListener('mousemove', e => {
        const r = card.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        const rx = ((y / r.height) - 0.5) * -8;
        const ry = ((x / r.width) - 0.5) * 8;
        card.style.setProperty('--rx', rx + 'deg');
        card.style.setProperty('--ry', ry + 'deg');
      });
      card.addEventListener('mouseleave', () => {
        card.style.setProperty('--rx', '0deg');
        card.style.setProperty('--ry', '0deg');
      });
    });
  },

  // ---------- INIT ----------
  async init() {
    if (this.__booted) return;
    this.__booted = true;
    this.load();
    this.renderBackground();
    this.renderNavbar();
    this.renderFooter();
    this.initChat();
    if (window.LIVE) LIVE.init();
    if (window.SYNC) {
      await SYNC.init();
      SYNC.installSaveHook();
      // Listen for remote changes and re-render whatever is on screen
      window.addEventListener('gzvm:sync', () => {
        // Re-render ticker (scores change)
        this.renderTicker();
        // Custom event for pages to re-render their specific UI
        window.dispatchEvent(new CustomEvent('gzvm:refresh'));
      });
      // Navbar sync badge may change after SYNC connects
      this.renderNavbar();
    }
  },

  // ---------- PUBLIC HIGHLIGHTS POOL ----------
  // Curated set of well-known public volleyball highlight videos on YouTube.
  // Used by the Live page and the Home page when no real match is live.
  // All videos are embeddable and free to share. You can edit this list anytime.
  publicHighlights: [
    {
      id: 'ph1',
      title: 'Best Volleyball Spikes 2024',
      channel: 'Sports Arena',
      videoId: 'k3hAkv3Gf50',
      category: 'spikes',
      duration: '8:12'
    },
    {
      id: 'ph2',
      title: 'Incredible Volleyball Saves',
      channel: 'Volley Highlights',
      videoId: 'F6W-b3iAIkM',
      category: 'saves',
      duration: '6:45'
    },
    {
      id: 'ph3',
      title: 'Top 10 Volleyball Serves',
      channel: 'Volleyball World',
      videoId: 'l1cD9LMbcwE',
      category: 'serves',
      duration: '5:20'
    },
    {
      id: 'ph4',
      title: 'Monster Blocks Compilation',
      channel: 'Block Party',
      videoId: 'A8A5QxqDYzw',
      category: 'blocks',
      duration: '7:33'
    },
    {
      id: 'ph5',
      title: 'Volleyball Setting Masterclass',
      channel: 'Coach Insights',
      videoId: 'jS4nD5b3GCA',
      category: 'sets',
      duration: '9:15'
    },
    {
      id: 'ph6',
      title: 'African Volleyball Championship Highlights',
      channel: 'CAVB',
      videoId: 'M7lc1UVf-VE',
      category: 'matches',
      duration: '10:48'
    }
  ],

  embedUrl(videoId) {
    return `https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1`;
  },

  thumbUrl(videoId) {
    return `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`;
  }
};

// Load persisted data immediately so inline page scripts have it
// (APP.init() is deferred to DOMContentLoaded for navbar/footer).
APP.load();
window.APP = APP;

// Boot UI after the rest of the page scripts (LIVE / SYNC) have executed
(function () {
  const start = () => { APP.init(); };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();

