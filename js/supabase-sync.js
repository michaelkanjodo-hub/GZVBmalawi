/* =========================================================
   Gen Z Volleyball Malawi — Supabase Sync (Simplified)
   Cross-device real-time sync. Just paste your URL + key.
   ========================================================= */

const SYNC = {
  client: null,
  ready: false,
  config: {
    // 👇 PASTE YOUR CREDENTIALS HERE
    url: 'https://pttzavzoarznsmskcnxc.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InB0dHphdnpvYXJ6bnNtc2tjbnhjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc2NTEzMTIsImV4cCI6MjEwMzIyNzMxMn0.A-xRb6dheszcrwIAsxZQqSBB1tNieL7knodQEzHMtV8',
  },

  isConfigured() {
    // Key can come from the config object OR from localStorage (saved via setup page)
    const key = this.config.anonKey || localStorage.getItem('gzvm_anon_key');
    return !!(this.config.url && key);
  },

  getKey() {
    return this.config.anonKey || localStorage.getItem('gzvm_anon_key');
  },

  async init() {
    if (this._inited) return;
    this._inited = true;
    
    if (!this.isConfigured()) {
      console.info('[SYNC] No anon key yet. Running in localStorage-only mode.');
      return;
    }
    
    try {
      // Load Supabase library if not already loaded
      if (!window.supabase) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      
      // Create client
      this.client = window.supabase.createClient(this.config.url, this.getKey());
      this.ready = true;
      console.info('[SYNC] ✅ Connected to Supabase');
      
      // Show sync status indicator
      this.showSyncStatus(true);

      // Pull all existing data on startup
      await this.pullAll();

      // Subscribe to changes with automatic reconnection
      this.subscribeToChanges();

      // Hook APP.save() to auto-sync
      this.installSaveHook();

      // Refresh UI
      window.dispatchEvent(new CustomEvent('gzvm:refresh'));
      
      // Periodic sync check every 30 seconds
      setInterval(() => {
        if (this.ready) {
          this.pullAll();
        }
      }, 30000);
      
    } catch (err) {
      console.error('[SYNC] Failed to connect:', err);
      this.showSyncStatus(false);
      
      // Retry connection after 10 seconds
      setTimeout(() => {
        this._inited = false;
        this.init();
      }, 10000);
    }
  },

  // Show sync status indicator
  showSyncStatus(connected) {
    let indicator = document.getElementById('sync-status');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.id = 'sync-status';
      indicator.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 20px;
        z-index: 1000;
        padding: 6px 12px;
        border-radius: 20px;
        font-size: 0.75rem;
        font-weight: 600;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: all 0.3s;
        cursor: pointer;
      `;
      indicator.title = 'Click to force sync';
      indicator.addEventListener('click', () => {
        this.pullAll();
        this.pushAll(APP.data);
        APP.toast('Sync refreshed!', 'success');
      });
      document.body.appendChild(indicator);
    }
    
    if (connected) {
      indicator.innerHTML = '🟢 SYNC ON';
      indicator.style.background = 'rgba(25, 210, 124, 0.2)';
      indicator.style.color = '#19d27c';
      indicator.style.border = '1px solid rgba(25, 210, 124, 0.3)';
    } else {
      indicator.innerHTML = '🔴 SYNC OFF';
      indicator.style.background = 'rgba(255, 77, 77, 0.2)';
      indicator.style.color = '#ff4d4d';
      indicator.style.border = '1px solid rgba(255, 77, 77, 0.3)';
    }
  },

  // Subscribe to realtime changes with reconnection
  subscribeToChanges() {
    if (!this.client) return;
    
    try {
      this.client
        .channel('gzvm-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'gzvm_sync' },
          payload => {
            console.log('[SYNC] Realtime update received:', payload.eventType);
            this.handleChange(payload);
          })
        .subscribe((status) => {
          console.log('[SYNC] Subscription status:', status);
          if (status === 'SUBSCRIBED') {
            console.log('[SYNC] ✅ Realtime subscription active');
            this.showSyncStatus(true);
          } else if (status === 'CHANNEL_ERROR') {
            console.warn('[SYNC] Subscription error, reconnecting...');
            this.showSyncStatus(false);
            setTimeout(() => this.subscribeToChanges(), 5000);
          }
        });
    } catch (e) {
      console.warn('[SYNC] Subscription failed:', e);
    }
  },

  // ---------- PULL ALL DATA ON STARTUP ----------
  async pullAll() {
    if (!this.ready || !this.client) return;
    try {
      const { data, error } = await this.client.from('gzvm_sync').select('*');
      if (error) throw error;
      if (!data || !data.length) return;

      // Group by entity_type and merge into APP.data
      let changed = false;
      data.forEach(row => {
        const type = row.entity_type;
        if (!APP.data[type]) return;
        if (Array.isArray(APP.data[type])) {
          // Replace if exists, otherwise add
          const idx = APP.data[type].findIndex(x => x.id === row.entity_id);
          if (idx >= 0) {
            // Only update if newer
            const existing = APP.data[type][idx];
            if (!existing.updated_at || new Date(row.updated_at) > new Date(existing.updated_at)) {
              APP.data[type][idx] = { ...row.data, updated_at: row.updated_at };
              changed = true;
            }
          } else {
            APP.data[type].push({ ...row.data, updated_at: row.updated_at });
            changed = true;
          }
        } else {
          APP.data[type] = row.data;
          changed = true;
        }
      });
      
      if (changed) {
        APP.save();
        window.dispatchEvent(new CustomEvent('gzvm:refresh'));
        console.info(`[SYNC] Pulled ${data.length} entities from Supabase`);
      }
    } catch (e) { 
      console.warn('[SYNC] pull failed:', e.message);
    }
  },

  // ---------- PUSH ----------
  async push(entityType, entity) {
    if (!this.ready || !this.client || !entity || !entity.id) return;
    try {
      const { error } = await this.client.from('gzvm_sync').upsert({
        entity_type: entityType,
        entity_id: entity.id,
        data: { ...entity, updated_at: new Date().toISOString() },
        updated_at: new Date().toISOString()
      }, { onConflict: 'entity_type,entity_id' });
      if (error) throw error;
    } catch (e) { 
      console.warn('[SYNC] push failed:', e.message);
    }
  },

  async pushAll(data) {
    if (!this.ready || !this.client) return;
    const rows = [];
    for (const [type, list] of Object.entries(data)) {
      if (!Array.isArray(list)) continue;
      list.forEach(entity => {
        if (entity && entity.id) {
          rows.push({
            entity_type: type,
            entity_id: entity.id,
            data: { ...entity, updated_at: new Date().toISOString() },
            updated_at: new Date().toISOString()
          });
        }
      });
    }
    if (!rows.length) return;
    try {
      // Push in batches of 100
      for (let i = 0; i < rows.length; i += 100) {
        const batch = rows.slice(i, i + 100);
        const { error } = await this.client.from('gzvm_sync').upsert(batch, { onConflict: 'entity_type,entity_id' });
        if (error) throw error;
      }
      console.info(`[SYNC] Pushed ${rows.length} entities to Supabase`);
    } catch (e) { 
      console.warn('[SYNC] pushAll failed:', e.message);
    }
  },

  // ---------- FILE UPLOADS ----------
  async uploadFile(bucket, file, pathPrefix = '') {
    if (!this.ready || !this.client || !file) return null;
    try {
      const ext = file.name.split('.').pop();
      const path = `${pathPrefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await this.client.storage.from(bucket).upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = this.client.storage.from(bucket).getPublicUrl(path);
      return urlData.publicUrl;
    } catch (e) { 
      console.warn('[SYNC] upload failed:', e.message);
      return null;
    }
  },

  // ---------- REALTIME ----------
  handleChange(payload) {
    const { eventType, new: newRow, old: oldRow } = payload;
    const row = newRow || oldRow;
    if (!row) return;

    const { entity_type, entity_id, data } = row;
    if (!APP.data[entity_type]) return;

    const list = APP.data[entity_type];
    const idx = list.findIndex(x => x.id === entity_id);

    if (eventType === 'DELETE') {
      if (idx >= 0) list.splice(idx, 1);
    } else if (idx >= 0) {
      list[idx] = { ...list[idx], ...data };
    } else {
      list.push(data);
    }
    
    // Save locally without triggering another sync push
    try {
      localStorage.setItem(APP.storageKey, JSON.stringify(APP.data));
    } catch (e) {
      console.warn('[SYNC] Local save failed:', e);
    }
    
    // Dispatch events to update UI
    window.dispatchEvent(new CustomEvent('gzvm:sync', { detail: { type: entity_type, eventType } }));
    window.dispatchEvent(new CustomEvent('gzvm:refresh'));
  },

  installSaveHook() {
    if (APP.__syncHooked) return;
    APP.__syncHooked = true;
    const originalSave = APP.save.bind(APP);
    APP.save = function () {
      originalSave();
      clearTimeout(APP.__syncTimer);
      APP.__syncTimer = setTimeout(() => {
        if (SYNC.ready) {
          SYNC.pushAll(APP.data);
        }
      }, 500); // debounce - faster sync
    };
    console.info('[SYNC] Save hook installed - sync will happen automatically');
  }
};

window.SYNC = SYNC;
