/* =========================================================
   Live streaming — PeerJS (watch via link) + YouTube/Twitch
   Viewers open a link. No offer/answer codes.
   ========================================================= */

const LIVE = {
  state: 'idle',
  localStream: null,
  currentRoom: null,
  hostPeer: null,
  viewerPeer: null,
  peers: new Map(),
  rooms: [],

  init() {
    this.loadRooms();
    this.renderBroadcastButton();
    this.autoJoinFromUrl();
  },

  async ensurePeer() {
    if (window.Peer) return;
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://unpkg.com/peerjs@1.5.4/dist/peerjs.min.js';
      s.onload = resolve;
      s.onerror = () => reject(new Error('Could not load the live-video library'));
      document.head.appendChild(s);
    });
  },

  iceConfig() {
    return {
      config: {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' }
        ]
      }
    };
  },

  loadRooms() {
    let local = [];
    try { local = JSON.parse(localStorage.getItem('gzvm_rooms') || '[]'); } catch { local = []; }
    const synced = (window.APP && Array.isArray(APP.data.liveRooms)) ? APP.data.liveRooms : [];
    const byId = new Map();
    [...local, ...synced].forEach(r => { if (r && r.id) byId.set(r.id, r); });
    this.rooms = [...byId.values()];
  },
  saveRooms() {
    try { localStorage.setItem('gzvm_rooms', JSON.stringify(this.rooms)); } catch {}
    if (window.APP) {
      APP.data.liveRooms = this.rooms;
      APP.save();
    }
  },
  createRoom(hostName, title, description, type = 'p2p') {
    const room = {
      id: 'room_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      host: hostName,
      title: title || 'Live stream',
      description: description || '',
      type,
      peerId: null,
      externalUrl: null,
      startedAt: new Date().toISOString(),
      viewers: 0,
      active: true
    };
    this.rooms = this.rooms.filter(r => r.id !== room.id);
    this.rooms.push(room);
    this.saveRooms();
    return room;
  },
  endRoom(roomId) {
    const r = this.rooms.find(x => x.id === roomId);
    if (r) { r.active = false; r.endedAt = new Date().toISOString(); }
    this.saveRooms();
  },
  getActiveRooms() {
    this.loadRooms();
    return this.rooms.filter(r => r.active);
  },
  listenToRooms(callback) {
    window.addEventListener('storage', e => {
      if (e.key === 'gzvm_rooms') { this.loadRooms(); callback(); }
    });
    window.addEventListener('gzvm:refresh', () => { this.loadRooms(); callback(); });
    setInterval(() => {
      const before = JSON.stringify(this.rooms);
      this.loadRooms();
      if (JSON.stringify(this.rooms) !== before) callback();
    }, 3000);
  },

  async getCamera(optional = false) {
    if (this.localStream) return this.localStream;
    if (!navigator.mediaDevices?.getUserMedia) {
      if (optional) return null;
      throw new Error('Camera needs HTTPS or localhost.');
    }
    try {
      this.localStream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
        audio: { echoCancellation: true, noiseSuppression: true }
      });
      return this.localStream;
    } catch (err) {
      if (optional) return null;
      throw new Error('Camera/mic access denied: ' + err.message);
    }
  },
  stopCamera() {
    if (this.localStream) {
      this.localStream.getTracks().forEach(t => t.stop());
      this.localStream = null;
    }
    if (this.hostPeer) { try { this.hostPeer.destroy(); } catch {} this.hostPeer = null; }
    if (this.viewerPeer) { try { this.viewerPeer.destroy(); } catch {} this.viewerPeer = null; }
    this.peers.forEach(c => { try { c.close(); } catch {} });
    this.peers.clear();
  },

  watchUrl(room) {
    const u = new URL('live.html', location.href);
    if (room.peerId) u.searchParams.set('peer', room.peerId);
    u.searchParams.set('room', room.id);
    return u.href;
  },

  async startCameraBroadcast(title) {
    await this.ensurePeer();
    const stream = await this.getCamera();
    this.hostPeer = new window.Peer(this.iceConfig());
    const peerId = await new Promise((resolve, reject) => {
      this.hostPeer.on('open', id => resolve(id));
      this.hostPeer.on('error', err => reject(err));
      setTimeout(() => reject(new Error('Live connection timed out')), 12000);
    });
    this.hostPeer.on('connection', conn => {
      const call = this.hostPeer.call(conn.peer, stream);
      this.peers.set(conn.peer, call);
      if (this.currentRoom) {
        this.currentRoom.viewers = this.peers.size;
        this.saveRooms();
      }
    });
    this.hostPeer.on('call', call => call.answer(stream));
    const me = window.APP && APP.currentUser();
    this.currentRoom = this.createRoom(me?.name || 'Broadcaster', title, '', 'p2p');
    this.currentRoom.peerId = peerId;
    this.saveRooms();
    this.state = 'broadcasting';
    const fab = document.getElementById('live-fab');
    if (fab) fab.classList.add('active');
    return this.currentRoom;
  },

  async watchPeer(peerId, videoEl) {
    await this.ensurePeer();
    this.viewerPeer = new window.Peer(this.iceConfig());
    await new Promise((resolve, reject) => {
      this.viewerPeer.on('open', () => resolve());
      this.viewerPeer.on('error', reject);
      setTimeout(() => reject(new Error('Could not reach the live server')), 12000);
    });
    this.viewerPeer.on('call', call => {
      call.answer();
      call.on('stream', remote => {
        if (videoEl) {
          videoEl.srcObject = remote;
          videoEl.play?.().catch(() => {});
        }
      });
    });
    this.viewerPeer.connect(peerId);
    this.state = 'viewing';
  },

  autoJoinFromUrl() {
    const params = new URLSearchParams(location.search);
    const peer = params.get('peer');
    if (!peer || !location.pathname.endsWith('live.html')) return;
    // live.html script also handles this; keep a late fallback
    window.addEventListener('gzvm:join-peer', () => {});
  },

  renderBroadcastButton() {
    if (document.getElementById('live-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'live-fab';
    fab.className = 'live-fab';
    fab.innerHTML = '📡';
    fab.title = 'Start a live stream';
    fab.setAttribute('aria-label', 'Start a live stream');
    document.body.appendChild(fab);
    fab.addEventListener('click', () => this.openStreamModal());
    if (!document.getElementById('live-fab-styles')) {
      const style = document.createElement('style');
      style.id = 'live-fab-styles';
      style.textContent = `
        .live-fab {
          position: fixed; bottom: 24px; right: 100px;
          width: 60px; height: 60px; border-radius: 50%;
          background: linear-gradient(135deg, #ff3b6b 0%, #ffd400 100%);
          color: #0b1426; border: none; font-size: 1.6rem; cursor: pointer;
          box-shadow: 0 12px 0 0 rgba(0,0,0,0.35), 0 0 30px rgba(255,59,107,0.6);
          z-index: 90;
        }
        .live-fab.active { animation: livePulse 1.5s infinite; }
        @keyframes livePulse {
          0%,100% { box-shadow: 0 12px 0 0 rgba(0,0,0,0.35), 0 0 30px rgba(255,59,107,0.6); }
          50% { box-shadow: 0 12px 0 0 rgba(0,0,0,0.35), 0 0 50px rgba(255,59,107,1); }
        }
        .stream-modal-grid { display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-top:1rem; }
        @media (max-width:700px){ .stream-modal-grid{grid-template-columns:1fr} }
        .stream-choice { background:var(--c-deeper); border:2px solid rgba(255,255,255,0.1); border-radius:12px; padding:1.2rem; cursor:pointer; text-align:center; }
        .stream-choice:hover { border-color:var(--c-primary); }
        .stream-choice .icon { font-size:2.5rem; }
        .video-preview { width:100%; background:#000; border-radius:8px; aspect-ratio:16/9; object-fit:cover; }
        .live-room-card { position:relative; background:var(--c-card); border:2px solid var(--c-danger); border-radius:12px; padding:1rem; margin-bottom:.8rem; }
        .live-room-card .live-pill { position:absolute; top:10px; right:10px; background:var(--c-danger); color:#fff; padding:.2rem .6rem; border-radius:4px; font-size:.7rem; font-weight:800; }
        .share-link { width:100%; padding:.6rem; border-radius:8px; background:#000; color:#00ff88; border:1px solid rgba(255,255,255,.1); font-size:.8rem; }
      `;
      document.head.appendChild(style);
    }
  },

  async openStreamModal(mode = null) {
    const existing = document.getElementById('stream-modal');
    if (existing) existing.remove();
    const modal = document.createElement('div');
    modal.id = 'stream-modal';
    modal.className = 'modal-backdrop open';
    modal.innerHTML = `
      <div class="modal" style="max-width:720px">
        <div class="modal-header"><h3>📡 Go Live</h3><button class="modal-close" data-close>✕</button></div>
        <p class="muted" style="font-size:.9rem">Start a camera stream — viewers just open your link. Or paste a YouTube / Twitch URL.</p>
        <div class="stream-modal-grid">
          <div class="stream-choice" id="choose-p2p"><div class="icon">🏐</div><h4>Stream from my camera</h4><p>Anyone with the watch link can join.</p></div>
          <div class="stream-choice" id="choose-external"><div class="icon">📺</div><h4>YouTube / Twitch / Facebook</h4><p>Paste a public watch URL.</p></div>
        </div>
        <div id="p2p-panel" style="display:none;margin-top:1.2rem">
          <div class="form-group"><label>Stream title</label><input id="p2p-title" class="form-control" placeholder="e.g. Lilongwe practice"></div>
          <button class="btn btn-primary" id="start-camera-live">📹 Go Live from camera</button>
          <video id="local-preview" class="video-preview" autoplay muted playsinline style="margin-top:.8rem;display:none"></video>
          <div id="share-wrap" style="display:none;margin-top:.8rem">
            <label class="muted" style="font-size:.8rem">SHARE THIS WATCH LINK</label>
            <input id="share-link" class="share-link" readonly>
            <button class="btn btn-accent btn-sm" id="copy-share" style="margin-top:.4rem">📋 Copy watch link</button>
            <p class="muted" style="font-size:.8rem;margin-top:.4rem">Send it in chat, WhatsApp or SMS. The other person taps it and the stream plays.</p>
          </div>
          <button class="btn btn-ghost btn-sm" id="end-broadcast" style="margin-top:1rem;display:none">⏹ End Broadcast</button>
        </div>
        <div id="external-panel" style="display:none;margin-top:1.2rem">
          <div class="form-group"><label>Title</label><input id="ext-title" class="form-control"></div>
          <div class="form-group"><label>Service</label>
            <select id="ext-service" class="form-control"><option>YouTube Live</option><option>Twitch</option><option>Facebook Live</option><option>Other</option></select>
          </div>
          <div class="form-group"><label>Watch URL</label><input id="ext-url" class="form-control" type="url" placeholder="https://www.youtube.com/watch?v=..."></div>
          <button class="btn btn-primary" id="start-external">🚀 Go Live</button>
        </div>
        <div style="margin-top:1.5rem;padding-top:1rem;border-top:1px solid rgba(255,255,255,.1)">
          <h4>📡 Currently Live</h4>
          <div id="active-rooms"></div>
          <p id="no-rooms" class="text-center muted" style="padding:1rem">No active streams right now.</p>
        </div>
      </div>`;
    document.body.appendChild(modal);
    const close = () => modal.remove();
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', close));
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.getElementById('choose-p2p').onclick = () => {
      document.getElementById('p2p-panel').style.display = 'block';
      document.getElementById('external-panel').style.display = 'none';
    };
    document.getElementById('choose-external').onclick = () => {
      document.getElementById('p2p-panel').style.display = 'none';
      document.getElementById('external-panel').style.display = 'block';
    };
    if (mode === 'p2p') document.getElementById('choose-p2p').click();
    if (mode === 'external') document.getElementById('choose-external').click();

    document.getElementById('start-camera-live').addEventListener('click', async () => {
      try {
        const title = document.getElementById('p2p-title').value.trim() || 'Live stream';
        document.getElementById('start-camera-live').disabled = true;
        document.getElementById('start-camera-live').textContent = 'Connecting…';
        const room = await this.startCameraBroadcast(title);
        const preview = document.getElementById('local-preview');
        preview.srcObject = this.localStream;
        preview.style.display = 'block';
        const link = this.watchUrl(room);
        document.getElementById('share-link').value = link;
        document.getElementById('share-wrap').style.display = 'block';
        document.getElementById('end-broadcast').style.display = 'inline-flex';
        APP.toast('You are live — copy the watch link', 'success');
        this.renderActiveRooms();
      } catch (e) {
        document.getElementById('start-camera-live').disabled = false;
        document.getElementById('start-camera-live').textContent = '📹 Go Live from camera';
        APP.toast(e.message || 'Could not go live', 'error');
      }
    });
    document.getElementById('copy-share').addEventListener('click', () => {
      const v = document.getElementById('share-link').value;
      navigator.clipboard.writeText(v).then(() => APP.toast('Watch link copied', 'success'));
    });
    document.getElementById('end-broadcast').addEventListener('click', () => { this.endBroadcast(); modal.remove(); });
    document.getElementById('start-external').addEventListener('click', () => {
      const title = document.getElementById('ext-title').value.trim() || 'Live Stream';
      const url = document.getElementById('ext-url').value.trim();
      if (!url) return APP.toast('Paste your stream URL', 'error');
      const me = APP.currentUser();
      this.currentRoom = this.createRoom(me?.name || 'Broadcaster', title, url, 'external');
      this.currentRoom.externalUrl = url;
      this.currentRoom.service = document.getElementById('ext-service').value;
      this.saveRooms();
      this.state = 'broadcasting';
      document.getElementById('live-fab')?.classList.add('active');
      APP.toast('You are live', 'success');
      modal.remove();
    });
    this.renderActiveRooms();
  },

  endBroadcast() {
    if (this.currentRoom) { this.endRoom(this.currentRoom.id); this.currentRoom = null; }
    this.stopCamera();
    this.state = 'idle';
    document.getElementById('live-fab')?.classList.remove('active');
    APP.toast('Stream ended', 'info');
  },
  cleanup() { this.stopCamera(); },

  renderActiveRooms() {
    const wrap = document.getElementById('active-rooms');
    const empty = document.getElementById('no-rooms');
    if (!wrap) return;
    const active = this.getActiveRooms();
    if (!active.length) { wrap.innerHTML = ''; if (empty) empty.style.display = 'block'; return; }
    if (empty) empty.style.display = 'none';
    wrap.innerHTML = active.map(r => {
      const href = r.peerId ? `live.html?peer=${encodeURIComponent(r.peerId)}&room=${r.id}` : `live.html?room=${r.id}`;
      return `<div class="live-room-card">
        <div class="live-pill">LIVE</div>
        <h4>${APP.escapeHtml(r.title)}</h4>
        <p class="muted" style="font-size:.85rem">🎤 ${APP.escapeHtml(r.host)} · ${APP.escapeHtml(r.type === 'external' ? (r.service || 'External') : 'Camera')}</p>
        <div style="display:flex;gap:.4rem;margin-top:.6rem;flex-wrap:wrap">
          <a class="btn btn-primary btn-sm" href="${href}">▶ Watch</a>
          <button class="btn btn-ghost btn-sm" data-copy-link="${href}">📋 Copy link</button>
          ${this.currentRoom && this.currentRoom.id === r.id ? `<button class="btn btn-ghost btn-sm" onclick="LIVE.endBroadcast()">⏹ End</button>` : ''}
        </div>
      </div>`;
    }).join('');
    wrap.querySelectorAll('[data-copy-link]').forEach(b => {
      b.addEventListener('click', () => {
        const abs = new URL(b.getAttribute('data-copy-link'), location.href).href;
        navigator.clipboard.writeText(abs).then(() => APP.toast('Copied', 'success'));
      });
    });
  },

  toEmbedUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      if (u.hostname.includes('youtube.com')) {
        const v = u.searchParams.get('v');
        if (v) return `https://www.youtube.com/embed/${v}?autoplay=1&rel=0`;
        if (u.pathname.startsWith('/live/')) return `https://www.youtube.com/embed${u.pathname}?autoplay=1`;
      }
      if (u.hostname === 'youtu.be') return `https://www.youtube.com/embed/${u.pathname.slice(1)}?autoplay=1`;
      if (u.hostname.includes('twitch.tv')) {
        const path = u.pathname.replace(/^\//, '').split('/')[0];
        if (path) return `https://player.twitch.tv/?channel=${path}&parent=${location.hostname}&autoplay=true`;
      }
      if (u.hostname.includes('facebook.com') || u.hostname.includes('fb.watch')) {
        return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&autoplay=true`;
      }
      if (u.hostname.includes('vimeo.com')) {
        const id = u.pathname.split('/').filter(Boolean).pop();
        return `https://player.vimeo.com/video/${id}?autoplay=1`;
      }
      return url;
    } catch { return url; }
  }
};

LIVE.loadRooms();
window.LIVE = LIVE;
