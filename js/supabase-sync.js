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
      if (!window.supabase) {
        await new Promise((resolve, reject) => {
          const s = document.createElement('script');
          s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';
          s.onload = resolve;
          s.onerror = reject;
          document.head.appendChild(s);
        });
      }
      this.client = window.supabase.createClient(this.config.url, this.getKey());
      this.ready = true;
      console.info('[SYNC] ✅ Connected to Supabase');

      // Pull all existing data on startup
      await this.pullAll();

      // Subscribe to changes
      this.client
        .channel('gzvm-changes')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'gzvm_sync' },
          payload => this.handleChange(payload))
        .subscribe();

      // Hook APP.save() to auto-sync
      this.installSaveHook();

      // Refresh UI
      window.dispatchEvent(new CustomEvent('gzvm:refresh'));
    } catch (err) {
      console.error('[SYNC] Failed to connect:', err);
    }
  },

  // ---------- PULL ALL DATA ON STARTUP ----------
  async pullAll() {
    if (!this.ready) return;
    try {
      const { data, error } = await this.client.from('gzvm_sync').select('*');
      if (error) throw error;
      if (!data) return;

      // Group by entity_type and merge into APP.data
      data.forEach(row => {
        const type = row.entity_type;
        if (!APP.data[type]) return;
        if (Array.isArray(APP.data[type])) {
          // Replace if exists, otherwise add
          const idx = APP.data[type].findIndex(x => x.id === row.entity_id);
          if (idx >= 0) APP.data[type][idx] = row.data;
          else APP.data[type].push(row.data);
        } else {
          APP.data[type] = row.data;
        }
      });
      APP.save();
      console.info(`[SYNC] Pulled ${data.length} entities from Supabase`);
    } catch (e) { console.warn('[SYNC] pull failed', e); }
  },

  // ---------- PUSH ----------
  async push(entityType, entity) {
    if (!this.ready || !entity || !entity.id) return;
    try {
      await this.client.from('gzvm_sync').upsert({
        entity_type: entityType,
        entity_id: entity.id,
        data: entity,
        updated_at: new Date().toISOString()
      }, { onConflict: 'entity_type,entity_id' });
    } catch (e) { console.warn('[SYNC] push failed', e); }
  },

  async pushAll(data) {
    if (!this.ready) return;
    const rows = [];
    for (const [type, list] of Object.entries(data)) {
      if (!Array.isArray(list)) continue;
      list.forEach(entity => {
        if (entity && entity.id) {
          rows.push({
            entity_type: type,
            entity_id: entity.id,
            data: entity,
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
    } catch (e) { console.warn('[SYNC] pushAll failed', e); }
  },

  // ---------- FILE UPLOADS ----------
  async uploadFile(bucket, file, pathPrefix = '') {
    if (!this.ready || !file) return null;
    try {
      const ext = file.name.split('.').pop();
      const path = `${pathPrefix}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await this.client.storage.from(bucket).upload(path, file, { upsert: true });
      if (error) throw error;
      const { data: urlData } = this.client.storage.from(bucket).getPublicUrl(path);
      return urlData.publicUrl;
    } catch (e) { console.warn('[SYNC] upload failed', e); return null; }
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
    APP.save();
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
        SYNC.pushAll(APP.data);
      }, 1000); // debounce
    };
  }
};

window.SYNC = SYNC;
