/* =========================================================
   Gen Z Volleyball Malawi — Live Streaming Module
   WebRTC peer-to-peer + external RTMP service integration
   ========================================================= */

const LIVE = {
  state: 'idle', // 'idle' | 'previewing' | 'broadcasting' | 'viewing'
  localStream: null,
  currentRoom: null,
  peers: new Map(), // viewerId -> RTCPeerConnection
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' }
    ]
  },
  signaling: {
    // Manual signaling: broadcaster generates an "offer" code,
    // viewer pastes it back as an "answer" code.
    pendingOffer: null,
    pendingAnswer: null
  },
  // Active rooms catalog (in localStorage so other tabs can see them)
  rooms: [],

  init() {
    this.loadRooms();
    this.renderBroadcastButton();
  },

  // Unicode-safe SDP encoding (plain btoa() throws on non-Latin1)
  encodeSignal(obj) {
    return btoa(unescape(encodeURIComponent(JSON.stringify(obj))));
  },
  decodeSignal(code) {
    return JSON.parse(decodeURIComponent(escape(atob(String(code || '').trim()))));
  },

  // ---------- ROOMS CATALOG ----------
  // A list of currently live broadcasts. Other tabs / users can see them
  // (in this same browser, for now — the manual signaling is what enables
  // real cross-browser streaming).
  loadRooms() {
    try {
      const raw = localStorage.getItem('gzvm_rooms');
      this.rooms = raw ? JSON.parse(raw) : [];
    } catch { this.rooms = []; }
  },
  saveRooms() {
    try { localStorage.setItem('gzvm_rooms', JSON.stringify(this.rooms)); } catch {}
  },
  createRoom(hostName, title, description, type = 'p2p') {
    const room = {
      id: 'room_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
      host: hostName,
      title: title || 'Live stream',
      description: description || '',
      type, // 'p2p' | 'external'
      externalUrl: null, // for RTMP/Youtube/Twitch embeds
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
  removeRoom(roomId) {
    this.rooms = this.rooms.filter(r => r.id !== roomId);
    this.saveRooms();
  },
  getActiveRooms() {
    return this.rooms.filter(r => r.active);
  },
  listenToRooms(callback) {
    // Listen to changes from other tabs
    window.addEventListener('storage', e => {
      if (e.key === 'gzvm_rooms') {
        this.loadRooms();
        callback();
      }
    });
    // Also poll every 3s as a fallback (in case storage events miss)
    setInterval(() => {
      const before = JSON.stringify(this.rooms);
      this.loadRooms();
      if (JSON.stringify(this.rooms) !== before) callback();
    }, 3000);
  },

  // ---------- CAMERA ACCESS ----------
  async getCamera(optional = false) {
    if (this.localStream) return this.localStream;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      if (optional) return null;
      throw new Error('Camera API is not available in this browser. Use HTTPS or localhost.');
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
    this.peers.forEach(pc => pc.close());
    this.peers.clear();
  },

  // ---------- MANUAL SIGNALING (P2P) ----------
  // The broadcaster creates an SDP offer, encodes it as a string,
  // and shares it with viewers. Each viewer creates an SDP answer
  // and sends it back. Then they exchange ICE candidates the same way.
  //
  // This is the simplest way to do real WebRTC without a server.
  async createOffer(roomId) {
    const stream = await this.getCamera();
    const pc = new RTCPeerConnection(this.config);
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    // Wait for ICE gathering to complete
    await new Promise(resolve => {
      if (pc.iceGatheringState === 'complete') return resolve();
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') resolve();
      });
      // Safety timeout
      setTimeout(resolve, 3000);
    });

    const offerCode = btoa(JSON.stringify(pc.localDescription));
    this.signaling.pendingOffer = { roomId, pc, offerCode };
    return offerCode;
  },

  async acceptOffer(offerCode) {
    const stream = await this.getCamera();
    const pc = new RTCPeerConnection(this.config);
    stream.getTracks().forEach(t => pc.addTrack(t, stream));

    const offer = JSON.parse(atob(offerCode));
    await pc.setRemoteDescription(offer);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await new Promise(resolve => {
      if (pc.iceGatheringState === 'complete') return resolve();
      pc.addEventListener('icegatheringstatechange', () => {
        if (pc.iceGatheringState === 'complete') resolve();
      });
      setTimeout(resolve, 3000);
    });

    const answerCode = btoa(JSON.stringify(pc.localDescription));
    this.signaling.pendingAnswer = { pc, answerCode };
    return answerCode;
  },

  async completeConnection(answerCode) {
    const answer = JSON.parse(atob(answerCode));
    const offer = this.signaling.pendingOffer;
    if (!offer) throw new Error('No pending offer');
    await offer.pc.setRemoteDescription(answer);
    return offer.pc;
  },

  // ---------- UI ----------
  renderBroadcastButton() {
    // Floating "Go Live" button (similar to chat fab) — only added once
    if (document.getElementById('live-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'live-fab';
    fab.className = 'live-fab';
    fab.innerHTML = '📡';
    fab.title = 'Start a live stream';
    fab.setAttribute('aria-label', 'Start a live stream');
    document.body.appendChild(fab);
    fab.addEventListener('click', () => this.openStreamModal());

    // Add styles
    if (!document.getElementById('live-fab-styles')) {
      const style = document.createElement('style');
      style.id = 'live-fab-styles';
      style.textContent = `
        .live-fab {
          position: fixed; bottom: 24px; right: 100px;
          width: 60px; height: 60px;
          border-radius: 50%;
          background: linear-gradient(135deg, #ff3b6b 0%, #ffd400 100%);
          color: #0b1426;
          border: none;
          font-size: 1.6rem;
          cursor: pointer;
          box-shadow: 0 12px 0 0 rgba(0,0,0,0.35), 0 18px 40px rgba(0,0,0,0.4), 0 0 30px rgba(255,59,107,0.6);
          z-index: 90;
          transition: transform 0.2s;
        }
        .live-fab:hover { transform: scale(1.1) rotate(-8deg); }
        .live-fab.active { animation: livePulse 1.5s infinite; }
        @keyframes livePulse {
          0%, 100% { box-shadow: 0 12px 0 0 rgba(0,0,0,0.35), 0 18px 40px rgba(0,0,0,0.4), 0 0 30px rgba(255,59,107,0.6); }
          50% { box-shadow: 0 12px 0 0 rgba(0,0,0,0.35), 0 18px 40px rgba(0,0,0,0.4), 0 0 50px rgba(255,59,107,1); }
        }

        .stream-modal-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 1rem;
          margin-top: 1rem;
        }
        @media (max-width: 700px) {
          .stream-modal-grid { grid-template-columns: 1fr; }
        }
        .stream-choice {
          background: var(--c-deeper);
          border: 2px solid rgba(255,255,255,0.1);
          border-radius: 12px;
          padding: 1.2rem;
          cursor: pointer;
          transition: all 0.2s;
          text-align: center;
        }
        .stream-choice:hover {
          border-color: var(--c-primary);
          background: rgba(255,59,107,0.08);
          transform: translateY(-3px);
        }
        .stream-choice .icon { font-size: 2.5rem; margin-bottom: 0.5rem; }
        .stream-choice h4 { margin-bottom: 0.3rem; }
        .stream-choice p { color: var(--c-muted); font-size: 0.85rem; }

        .code-block {
          width: 100%;
          min-height: 100px;
          max-height: 200px;
          background: #000;
          color: #00ff88;
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: 0.6rem;
          font-family: 'Courier New', monospace;
          font-size: 0.75rem;
          word-break: break-all;
          resize: vertical;
        }
        .code-block:focus { outline: none; border-color: var(--c-accent); }

        .live-room-card {
          position: relative;
          background: linear-gradient(135deg, #1a0a0a 0%, var(--c-card) 100%);
          border: 2px solid var(--c-danger);
          border-radius: 12px;
          padding: 1rem;
          margin-bottom: 0.8rem;
        }
        .live-room-card h4 { color: var(--c-text); margin-bottom: 0.3rem; }
        .live-room-card .live-pill {
          position: absolute; top: 10px; right: 10px;
          background: var(--c-danger);
          color: white;
          padding: 0.2rem 0.6rem;
          border-radius: 4px;
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 1px;
          display: flex; align-items: center; gap: 0.4rem;
        }
        .live-room-card .live-pill .live-dot {
          width: 6px; height: 6px;
          background: white;
          border-radius: 50%;
          animation: pulse 1.5s infinite;
        }

        .video-preview {
          width: 100%;
          background: #000;
          border-radius: 8px;
          aspect-ratio: 16/9;
          object-fit: cover;
        }

        .device-bar {
          display: flex; gap: 0.4rem;
          flex-wrap: wrap;
          margin: 0.6rem 0;
        }
        .device-bar button { flex: 1; min-width: 80px; }
        .device-bar button.active { background: var(--gradient-1); color: var(--c-deep); }
      `;
      document.head.appendChild(style);
    }
  },

  // ---------- STREAM MODAL ----------
  async openStreamModal(mode = null) {
    // Remove existing modal
    const existing = document.getElementById('stream-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'stream-modal';
    modal.className = 'modal-backdrop open';
    modal.innerHTML = `
      <div class="modal" style="max-width: 720px;">
        <div class="modal-header">
          <h3>📡 Go Live</h3>
          <button class="modal-close" data-close>✕</button>
        </div>

        <p class="muted" style="font-size:0.9rem;">Pick how you want to stream. Everyone on the site will be able to watch.</p>

        <div class="stream-modal-grid">
          <div class="stream-choice" id="choose-p2p">
            <div class="icon">🏐</div>
            <h4>Stream from my camera</h4>
            <p>P2P WebRTC. Best for small audiences (5-20 viewers). No server needed.</p>
          </div>
          <div class="stream-choice" id="choose-external">
            <div class="icon">📺</div>
            <h4>Stream via YouTube / Twitch / Facebook</h4>
            <p>Use a streaming service for big audiences (50+). Just paste your stream URL.</p>
          </div>
        </div>

        <div id="p2p-panel" style="display:none; margin-top:1.5rem;">
          <h4>📹 Camera Broadcast</h4>
          <p class="muted" style="font-size:0.85rem;">Broadcasters create a share code. Viewers paste it to connect.</p>

          <div class="grid-2" style="margin-top:1rem;">
            <div>
              <h5 style="color: var(--c-accent);">📤 As Broadcaster</h5>
              <ol style="font-size:0.85rem; padding-left: 1.2rem; margin-top:0.5rem;">
                <li>Click "Start Camera"</li>
                <li>Click "Create Share Code"</li>
                <li>Copy the code and send it to your viewers (chat, SMS, etc.)</li>
                <li>Paste each viewer's answer code back here</li>
              </ol>
              <button class="btn btn-primary btn-sm" id="start-camera" style="margin-top:0.6rem;">📹 Start Camera</button>
              <button class="btn btn-accent btn-sm" id="create-offer" style="margin-top:0.4rem; display:none;">Create Share Code</button>
              <video id="local-preview" class="video-preview" autoplay muted playsinline style="margin-top:0.5rem; display:none;"></video>
              <div id="offer-code-wrap" style="display:none; margin-top:0.5rem;">
                <label style="font-size:0.8rem; color: var(--c-muted);">SHARE THIS CODE WITH YOUR VIEWERS:</label>
                <textarea id="offer-code" class="code-block" readonly></textarea>
                <button class="btn btn-ghost btn-sm" id="copy-offer" style="margin-top:0.3rem;">📋 Copy Code</button>
              </div>
              <div style="margin-top:0.5rem;">
                <label style="font-size:0.8rem; color: var(--c-muted);">PASTE VIEWER'S ANSWER CODE:</label>
                <textarea id="answer-input" class="code-block" placeholder="Paste answer code from viewer..."></textarea>
                <button class="btn btn-primary btn-sm" id="connect-viewer" style="margin-top:0.3rem;">🔗 Connect</button>
              </div>
            </div>

            <div>
              <h5 style="color: var(--c-accent);">📥 As Viewer</h5>
              <ol style="font-size:0.85rem; padding-left: 1.2rem; margin-top:0.5rem;">
                <li>Paste the broadcaster's offer code below</li>
                <li>Click "Generate Answer Code" (camera is optional)</li>
                <li>Send the answer code back to the broadcaster</li>
              </ol>
              <button class="btn btn-ghost btn-sm" id="start-camera-v" style="margin-top:0.6rem;">📹 Optional: share my camera</button>
              <button class="btn btn-accent btn-sm" id="accept-offer" style="margin-top:0.4rem;">Generate Answer Code</button>
              <video id="local-preview-v" class="video-preview" autoplay muted playsinline style="margin-top:0.5rem; display:none;"></video>
              <div id="offer-input-wrap" style="margin-top:0.5rem;">
                <label style="font-size:0.8rem; color: var(--c-muted);">PASTE BROADCASTER'S OFFER CODE:</label>
                <textarea id="offer-input" class="code-block" placeholder="Paste offer code..."></textarea>
              </div>
              <div id="answer-code-wrap" style="display:none; margin-top:0.5rem;">
                <label style="font-size:0.8rem; color: var(--c-muted);">SEND THIS CODE BACK TO BROADCASTER:</label>
                <textarea id="answer-code" class="code-block" readonly></textarea>
                <button class="btn btn-ghost btn-sm" id="copy-answer" style="margin-top:0.3rem;">📋 Copy Code</button>
              </div>
              <div id="remote-video-wrap" style="display:none; margin-top:0.5rem;">
                <label style="font-size:0.8rem; color: var(--c-accent);">✅ CONNECTED — BROADCAST PLAYING:</label>
                <video id="remote-video" class="video-preview" autoplay playsinline controls></video>
              </div>
            </div>
          </div>

          <button class="btn btn-ghost btn-sm" id="end-broadcast" style="margin-top:1rem; display:none;">⏹ End Broadcast</button>
        </div>

        <div id="external-panel" style="display:none; margin-top:1.5rem;">
          <h4>📺 External Service Stream</h4>
          <p class="muted" style="font-size:0.85rem;">For big audiences — broadcast via a streaming service, then paste your stream URL here so everyone on the site can watch it.</p>
          <div class="form-group" style="margin-top:1rem;">
            <label>Broadcast Title</label>
            <input type="text" id="ext-title" class="form-control" placeholder="e.g. Mzuzu Spikers vs Blantyre Blockers">
          </div>
          <div class="form-group">
            <label>Service</label>
            <select id="ext-service" class="form-control">
              <option>YouTube Live</option>
              <option>Twitch</option>
              <option>Facebook Live</option>
              <option>Other RTMP / HLS</option>
            </select>
          </div>
          <div class="form-group">
            <label>Stream URL (the watch link your viewers use)</label>
            <input type="url" id="ext-url" class="form-control" placeholder="https://www.youtube.com/watch?v=... or https://www.twitch.tv/yourchannel">
            <p class="muted" style="font-size:0.75rem; margin-top:0.3rem;">
              The site will automatically convert it to an embeddable URL.
            </p>
          </div>
          <button class="btn btn-primary" id="start-external">🚀 Go Live</button>
        </div>

        <div style="margin-top:1.5rem; padding-top:1rem; border-top:1px solid rgba(255,255,255,0.1);">
          <h4>📡 Currently Live on GZVM</h4>
          <div id="active-rooms"></div>
          <p id="no-rooms" class="text-center muted" style="font-size:0.9rem; padding:1rem;">No active streams right now. Be the first to go live!</p>
        </div>
      </div>
    `;
    document.body.appendChild(modal);

    // Bind close — do NOT tear down an active broadcast/view session
    const closeModal = () => modal.remove();
    modal.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', closeModal));
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });

    // Choose mode
    document.getElementById('choose-p2p').addEventListener('click', () => {
      document.getElementById('p2p-panel').style.display = 'block';
      document.getElementById('external-panel').style.display = 'none';
    });
    document.getElementById('choose-external').addEventListener('click', () => {
      document.getElementById('p2p-panel').style.display = 'none';
      document.getElementById('external-panel').style.display = 'block';
    });

    // Auto-select mode if passed
    if (mode === 'p2p') {
      document.getElementById('p2p-panel').style.display = 'block';
      document.getElementById('external-panel').style.display = 'none';
    } else if (mode === 'external') {
      document.getElementById('p2p-panel').style.display = 'none';
      document.getElementById('external-panel').style.display = 'block';
    }

    // P2P Broadcaster side
    document.getElementById('start-camera').addEventListener('click', async () => {
      try {
        const stream = await this.getCamera();
        document.getElementById('local-preview').srcObject = stream;
        document.getElementById('local-preview').style.display = 'block';
        document.getElementById('create-offer').style.display = 'inline-flex';
        document.getElementById('start-camera').textContent = '✓ Camera Ready';
        document.getElementById('start-camera').disabled = true;
      } catch (e) { APP.toast(e.message, 'error'); }
    });
    document.getElementById('create-offer').addEventListener('click', async () => {
      try {
        const me = APP.currentUser();
        const title = prompt('Stream title:', me?.name + ' — Live Practice') || 'Live Stream';
        const code = await this.createOffer();
        document.getElementById('offer-code').value = code;
        document.getElementById('offer-code-wrap').style.display = 'block';
        this.currentRoom = this.createRoom(me?.name || 'Broadcaster', title, '', 'p2p');
        document.getElementById('end-broadcast').style.display = 'inline-flex';
        this.state = 'broadcasting';
        document.getElementById('live-fab').classList.add('active');
        APP.toast('Broadcast started! Share the code with viewers.', 'success');
        this.renderActiveRooms();
      } catch (e) { APP.toast(e.message, 'error'); }
    });
    document.getElementById('copy-offer').addEventListener('click', () => {
      navigator.clipboard.writeText(document.getElementById('offer-code').value);
      APP.toast('Code copied! Send it to your viewers.', 'success');
    });
    document.getElementById('connect-viewer').addEventListener('click', async () => {
      const code = document.getElementById('answer-input').value.trim();
      if (!code) return APP.toast('Paste the viewer answer code first', 'warning');
      try {
        const pc = await this.completeConnection(code);
        // Attach our local stream to a hidden video for the broadcaster
        APP.toast('Viewer connected! 🎉', 'success');
        // Track this peer
        const peerId = 'peer_' + Date.now();
        this.peers.set(peerId, pc);
        // For demo: we just log that it's connected
        if (this.currentRoom) this.currentRoom.viewers = this.peers.size;
        document.getElementById('answer-input').value = '';
        this.saveRooms();
      } catch (e) { APP.toast(e.message, 'error'); }
    });

    // P2P Viewer side
    document.getElementById('start-camera-v').addEventListener('click', async () => {
      try {
        const stream = await this.getCamera();
        document.getElementById('local-preview-v').srcObject = stream;
        document.getElementById('local-preview-v').style.display = 'block';
        document.getElementById('accept-offer').style.display = 'inline-flex';
        document.getElementById('start-camera-v').textContent = '✓ Camera Ready';
        document.getElementById('start-camera-v').disabled = true;
      } catch (e) { APP.toast(e.message, 'error'); }
    });
    document.getElementById('accept-offer').addEventListener('click', async () => {
      const offerCode = document.getElementById('offer-input').value.trim();
      if (!offerCode) return APP.toast('Paste the broadcaster offer code first', 'warning');
      try {
        const answerCode = await this.acceptOffer(offerCode);
        // Hook up remote stream
        this.signaling.pendingAnswer.pc.addEventListener('track', e => {
          const remote = document.getElementById('remote-video');
          remote.srcObject = e.streams[0];
          document.getElementById('remote-video-wrap').style.display = 'block';
        });
        document.getElementById('answer-code').value = answerCode;
        document.getElementById('answer-code-wrap').style.display = 'block';
        this.state = 'viewing';
        APP.toast('Connected! Send the answer code back to the broadcaster.', 'success');
      } catch (e) { APP.toast(e.message, 'error'); }
    });
    document.getElementById('copy-answer').addEventListener('click', () => {
      navigator.clipboard.writeText(document.getElementById('answer-code').value);
      APP.toast('Code copied! Send it back to the broadcaster.', 'success');
    });

    // End broadcast
    document.getElementById('end-broadcast').addEventListener('click', () => {
      this.endBroadcast();
      modal.remove();
    });

    // External stream
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
      document.getElementById('live-fab').classList.add('active');
      APP.toast('You are live! 🎉', 'success');
      modal.remove();
    });

    this.renderActiveRooms();
  },

  endBroadcast() {
    if (this.currentRoom) {
      this.endRoom(this.currentRoom.id);
      this.currentRoom = null;
    }
    this.cleanup();
    this.state = 'idle';
    document.getElementById('live-fab').classList.remove('active');
    APP.toast('Stream ended', 'info');
  },

  cleanup() {
    this.stopCamera();
  },

  // ---------- ACTIVE ROOMS PANEL ----------
  renderActiveRooms() {
    const wrap = document.getElementById('active-rooms');
    const empty = document.getElementById('no-rooms');
    if (!wrap) return;
    const active = this.getActiveRooms();
    if (!active.length) {
      wrap.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';
    wrap.innerHTML = active.map(r => `
      <div class="live-room-card">
        <div class="live-pill"><span class="live-dot"></span> LIVE</div>
        <h4>${APP.escapeHtml(r.title)}</h4>
        <p class="muted" style="font-size:0.85rem;">🎤 ${APP.escapeHtml(r.host)} • ${APP.escapeHtml(r.type === 'external' ? r.service : 'P2P')} • Started ${APP.fmtDate(r.startedAt)} ${APP.fmtTime(r.startedAt)}</p>
        <div style="display:flex; gap:0.4rem; margin-top:0.6rem; flex-wrap:wrap;">
          <a href="live.html?room=${r.id}" class="btn btn-primary btn-sm">▶ Watch</a>
          ${r.type === 'p2p' ? `<button class="btn btn-ghost btn-sm" onclick="navigator.clipboard.writeText('${APP.escapeHtml(r.title)} on GZVM').then(()=>APP.toast('Copied','success'))">📋 Share</button>` : ''}
          ${this.currentRoom && this.currentRoom.id === r.id ? `<button class="btn btn-ghost btn-sm" onclick="LIVE.endBroadcast()">⏹ End</button>` : ''}
        </div>
      </div>
    `).join('');
  },

  // ---------- EXTERNAL URL CONVERTER ----------
  // Convert a YouTube/Twitch/Facebook watch URL into an embeddable iframe URL
  toEmbedUrl(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      // YouTube
      if (u.hostname.includes('youtube.com')) {
        const v = u.searchParams.get('v');
        if (v) return `https://www.youtube.com/embed/${v}?autoplay=1&rel=0`;
        if (u.pathname.startsWith('/live/')) return `https://www.youtube.com/embed${u.pathname}?autoplay=1`;
      }
      if (u.hostname === 'youtu.be') {
        const id = u.pathname.slice(1);
        return `https://www.youtube.com/embed/${id}?autoplay=1`;
      }
      // Twitch
      if (u.hostname.includes('twitch.tv')) {
        // Strip /directory or /videos/...
        const path = u.pathname.replace(/^\//, '').split('/')[0];
        if (path) return `https://player.twitch.tv/?channel=${path}&parent=${location.hostname}&autoplay=true`;
      }
      // Facebook
      if (u.hostname.includes('facebook.com') || u.hostname.includes('fb.watch')) {
        return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&autoplay=true`;
      }
      // Vimeo
      if (u.hostname.includes('vimeo.com')) {
        const id = u.pathname.split('/').filter(Boolean).pop();
        return `https://player.vimeo.com/video/${id}?autoplay=1`;
      }
      // HLS / .m3u8 — needs a player; for now just return the raw URL
      return url;
    } catch { return url; }
  }
};

// Rooms must be available before page scripts call getActiveRooms()
LIVE.loadRooms();
window.LIVE = LIVE;

