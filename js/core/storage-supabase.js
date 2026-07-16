var getSafeStorage = (storageType) => {
  try {
    const storage = window[storageType];
    const testKey = '__google_sites_test__';
    storage.setItem(testKey, testKey);
    storage.removeItem(testKey);
    return storage;
  } catch (e) {
    console.warn(`[ARCBT-SECURITY] ${storageType} diblokir. Menggunakan memori sementara.`);
    const memoryStore = {};
    return {
      getItem: (key) => memoryStore[key] || null,
      setItem: (key, val) => { memoryStore[key] = String(val); },
      removeItem: (key) => { delete memoryStore[key]; },
      clear: () => { for (let k in memoryStore) delete memoryStore[k]; }
    };
  }
};

var myLocalStorage = getSafeStorage('localStorage');
var mySessionStorage = getSafeStorage('sessionStorage');

var { supabaseUrl, supabaseKey } = window.__ARCBT_CONFIG__ || {};
var supabaseClient = (window.supabase || supabase).createClient(supabaseUrl, supabaseKey);
window.supabaseUrl = supabaseUrl;
window.supabaseKey = supabaseKey;

function getPrimaryKeyColumn(table) {
  if (table === 'Admin') return 'username';
  if (table === 'Siswa') return 'nis';
  if (table === 'Bank Soal') return 'id_paket';
  return 'id';
}

function getPublicCollection(collectionName, selectColumns = '*') {
  return { collectionName, selectColumns };
}

function getPublicDoc(collectionName, docId, selectColumns = '*') {
  if (!collectionName || !docId) {
    throw new Error(`Invalid document reference: collectionName="${collectionName}" docId="${docId}"`);
  }
  return { collectionName, docId, selectColumns };
}

function extractMissingSelectColumn(error) {
  const msg = String(error?.message || error?.details || error || '');
  let m = msg.match(/Could not find the '([^']+)' column/i);
  if (m) return m[1];
  m = msg.match(/column ["']([^"']+)["'] of relation/i);
  if (m) return m[1];
  m = msg.match(/column ([a-zA-Z_][\w]*) does not exist/i);
  if (m) return m[1];
  return null;
}

function removeSelectColumn(selectCols, columnName) {
  if (!selectCols || selectCols === '*' || !columnName) return selectCols;
  return selectCols
    .split(',')
    .map((c) => c.trim())
    .filter((c) => c && c !== columnName && !c.startsWith(`${columnName}(`))
    .join(',') || '*';
}

async function selectTableRows(tableName, selectCols) {
  let cols = selectCols || '*';
  const pageSize = 1000;
  const pk = getPrimaryKeyColumn(tableName);

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const allRows = [];
      let from = 0;
      for (;;) {
        const { data, error } = await supabaseClient
          .from(tableName)
          .select(cols)
          .order(pk, { ascending: true })
          .range(from, from + pageSize - 1);
        if (error) throw error;
        const rows = data || [];
        allRows.push(...rows);
        if (rows.length < pageSize) break;
        from += pageSize;
      }
      return { data: allRows, selectColumns: cols };
    } catch (error) {
      const missing = extractMissingSelectColumn(error);
      if (!missing || cols === '*') throw error;
      const nextCols = removeSelectColumn(cols, missing);
      console.warn(`select ${tableName}: kolom "${missing}" tidak ada, retry tanpa kolom itu`);
      cols = nextCols || '*';
    }
  }
  throw new Error(`Gagal select ${tableName}`);
}

async function getDoc(ref) {
  const pk = getPrimaryKeyColumn(ref.collectionName);
  let cols = ref.selectColumns || '*';
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data, error } = await supabaseClient
        .from(ref.collectionName)
        .select(cols)
        .eq(pk, ref.docId)
        .maybeSingle();
      if (!error) {
        return {
          exists: () => data !== null,
          data: () => data
        };
      }
      const missing = extractMissingSelectColumn(error);
      if (!missing || cols === '*') throw error;
      console.warn(`getDoc: kolom "${missing}" tidak ada, retry tanpa kolom itu`);
      cols = removeSelectColumn(cols, missing) || '*';
    }
    throw new Error(`Gagal getDoc ${ref.collectionName}`);
  } catch (error) {
    console.error("getDoc error:", error);
    throw error;
  }
}

async function getDocs(collectionRef) {
  try {
    const { data } = await selectTableRows(
      collectionRef.collectionName,
      collectionRef.selectColumns || '*'
    );
    return {
      docs: data.map(row => ({
        id: row[getPrimaryKeyColumn(collectionRef.collectionName)],
        data: () => row
      }))
    };
  } catch (error) {
    console.error("getDocs error:", error);
    throw error;
  }
}

async function setDoc(ref, payload, options = {}) {
  const pk = getPrimaryKeyColumn(ref.collectionName);
  let dataToSave = { [pk]: ref.docId, ...payload };
  if (options.merge) {
    try {
      const existing = await getDoc(ref);
      if (existing.exists()) {
        dataToSave = { ...existing.data(), ...dataToSave };
      }
    } catch (e) {
      console.warn('setDoc merge read failed, continuing with partial payload', e);
    }
  }
  const { error } = await supabaseClient
    .from(ref.collectionName)
    .upsert(dataToSave, { onConflict: pk });
  if (error) {
    console.error("setDoc error:", error);
    throw error;
  }
}

async function updateDoc(ref, payload) {
  const pk = getPrimaryKeyColumn(ref.collectionName);
  const { error } = await supabaseClient
    .from(ref.collectionName)
    .update(payload)
    .eq(pk, ref.docId);
  if (error) {
    console.error('updateDoc error:', error);
    throw error;
  }
}

async function deleteDoc(ref) {
  const pk = getPrimaryKeyColumn(ref.collectionName);
  const { error } = await supabaseClient
    .from(ref.collectionName)
    .delete()
    .eq(pk, ref.docId);
  if (error) {
    console.error("deleteDoc error:", error);
    throw error;
  }
}

function writeBatch() {
  const sets = {};
  const deletes = {};
  return {
    set: (ref, payload) => {
      const table = ref.collectionName;
      const pk = getPrimaryKeyColumn(table);
      if (!sets[table]) sets[table] = [];
      sets[table].push({ [pk]: ref.docId, ...payload });
    },
    update: (ref, payload) => {
      const table = ref.collectionName;
      const pk = getPrimaryKeyColumn(table);
      if (!sets[table]) sets[table] = [];
      sets[table].push({ [pk]: ref.docId, ...payload });
    },
    delete: (ref) => {
      const table = ref.collectionName;
      if (!deletes[table]) deletes[table] = [];
      deletes[table].push(ref.docId);
    },
    commit: async () => {
      const promises = [];
      for (const [table, rows] of Object.entries(sets)) {
        if (rows.length === 0) continue;
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          promises.push(
            supabaseClient.from(table).upsert(chunk).then(({ error }) => {
              if (error) throw error;
            })
          );
        }
      }
      for (const [table, ids] of Object.entries(deletes)) {
        if (ids.length === 0) continue;
        const pk = getPrimaryKeyColumn(table);
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          promises.push(
            supabaseClient.from(table).delete().in(pk, chunk).then(({ error }) => {
              if (error) throw error;
            })
          );
        }
      }
      await Promise.all(promises);
    }
  };
}

var REALTIME_COLLECTION_POLL_MS = 600000;
var REST_ALERT_POLL_MS = 120000;
var SESSION_ALERT_COLS = 'admin_alert_active,admin_alert_message,admin_alert_id,admin_alert_by,force_finished,force_finished_by,force_reset,force_reset_reason,force_reset_at';
var RATE_LIMIT_CONCURRENCY = 5;
var rateLimitQueue = [];
var rateLimitActive = 0;

function rateLimited(fn) {
  return new Promise((resolve, reject) => {
    const run = async () => {
      rateLimitActive++;
      try {
        const result = await fn();
        resolve(result);
      } catch (e) { reject(e); }
      finally {
        rateLimitActive--;
        processRateLimitQueue();
      }
    };
    rateLimitQueue.push(run);
    processRateLimitQueue();
  });
}

function processRateLimitQueue() {
  while (rateLimitActive < RATE_LIMIT_CONCURRENCY && rateLimitQueue.length > 0) {
    const next = rateLimitQueue.shift();
    if (next) next();
  }
}

function staggeredDelay(rangeMs = 15000) {
  return new Promise((resolve) => setTimeout(resolve, Math.random() * rangeMs));
}

function hashStringToInt(str) {
  const s = String(str || '');
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function computeStableJitterMs(seed, maxMs, jitterMs = 0) {
  const capped = Math.max(0, Math.floor(Number(maxMs) || 0));
  if (!capped) return 0;
  const base = hashStringToInt(seed) % capped;
  const jitter = Math.max(0, Math.floor(Number(jitterMs) || 0));
  const extra = jitter ? Math.floor(Math.random() * (jitter + 1)) : 0;
  return Math.min(capped + jitter, base + extra);
}

function computeLoginStaggerMs(nis) {
  return computeStableJitterMs(nis, 20000, 5000);
}

function computeExamEndSubmitStaggerMs(nis) {
  return computeStableJitterMs(nis, 45000, 15000);
}

async function retryWithBackoff(fn, options = {}) {
  const maxAttempts = Math.max(1, Number(options.maxAttempts) || 4);
  const baseMs = Math.max(100, Number(options.baseMs) || 800);
  const maxMs = Math.max(baseMs, Number(options.maxMs) || 12000);
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      if (typeof options.shouldRetry === 'function' && !options.shouldRetry(err, attempt)) {
        throw err;
      }
      if (attempt >= maxAttempts) break;
      const delay = Math.min(maxMs, baseMs * (2 ** (attempt - 1))) + Math.floor(Math.random() * 500);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

function onSnapshot(collectionRef, callback, options = {}) {
  const tableName = collectionRef.collectionName;
  const pk = getPrimaryKeyColumn(tableName);
  const pollMs = options.pollIntervalMs ?? REALTIME_COLLECTION_POLL_MS;
  let activeData = [];
  let isInitialLoaded = false;

  const loadData = async () => {
    try {
      const selectCols = collectionRef.selectColumns || '*';
      const { data } = await selectTableRows(tableName, selectCols);
      activeData = data || [];
      isInitialLoaded = true;
      triggerCallback();
    } catch (e) {
      console.error("onSnapshot load error:", e);
    }
  };

  const handleRealtimeChange = (payload) => {
    if (!isInitialLoaded) return;

    if (payload.eventType === 'INSERT') {
      const idx = activeData.findIndex(r => r[pk] === payload.new[pk]);
      if (idx === -1) activeData.push(payload.new);
      else activeData[idx] = payload.new;
    } else if (payload.eventType === 'UPDATE') {
      const idx = activeData.findIndex(r => r[pk] === payload.new[pk]);
      if (idx !== -1) activeData[idx] = payload.new;
      else activeData.push(payload.new);
    } else if (payload.eventType === 'DELETE') {
      activeData = activeData.filter(r => r[pk] !== payload.old[pk]);
    }
    triggerCallback();
  };

  const triggerCallback = () => {
    callback({
      forEach: (fn) => {
        activeData.forEach(row => {
          fn({
            id: row[pk],
            data: () => row
          });
        });
      }
    });
  };

  let channel = null;
  if (!options.noRealtime) {
    channel = supabaseClient
      .channel(`public:${tableName}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, handleRealtimeChange)
      .subscribe();
  }

  const pollInterval = setInterval(loadData, pollMs);
  loadData();

  return () => {
    clearInterval(pollInterval);
    if (channel) supabaseClient.removeChannel(channel);
  };
}

function restPollSessionById(sessionId, callback, onError, pollMsOrOpts) {
  let fallbackInterval = REST_ALERT_POLL_MS;
  let useRealtime = false;
  if (typeof pollMsOrOpts === 'number') {
    fallbackInterval = pollMsOrOpts;
  } else if (pollMsOrOpts && typeof pollMsOrOpts === 'object') {
    if (typeof pollMsOrOpts.pollIntervalMs === 'number') {
      fallbackInterval = pollMsOrOpts.pollIntervalMs;
    }
    useRealtime = pollMsOrOpts.useRealtime === true;
  }

  const healthyInterval = useRealtime ? Math.max(fallbackInterval, 300000) : fallbackInterval;
  const degradedInterval = Math.max(fallbackInterval, 60000);
  const downBackoffAfterMs = 120000;
  const cols = SESSION_ALERT_COLS;
  const table = 'Session Ujian';
  let destroyed = false;
  let pollTimer = null;
  let startTimer = null;
  let channel = null;
  let realtimeOk = false;
  let activeInterval = fallbackInterval;
  let lastEmitFp = '';
  let realtimeDownSince = null;

  const emit = (data) => {
    if (destroyed) return;

    const fp = data
      ? [
          data.admin_alert_active ? '1' : '0',
          data.admin_alert_id || '',
          data.force_finished ? '1' : '0',
          data.force_reset ? '1' : '0'
        ].join('|')
      : 'null';
    if (fp === lastEmitFp) return;
    lastEmitFp = fp;
    callback({
      exists: () => data !== null && data !== undefined,
      data: () => data || null
    });
  };

  const load = async () => {
    if (destroyed || !supabaseClient) return;
    try {
      const { data, error } = await supabaseClient
        .from(table)
        .select(cols)
        .eq('id', sessionId)
        .maybeSingle();
      if (destroyed) return;
      if (error) throw error;
      emit(data);
    } catch (e) {
      if (typeof onError === 'function') onError(e);
      else console.warn('restPollSessionById error:', e);
    }
  };

  const pollIntervalForRealtimeDown = () => {
    if (!realtimeDownSince) realtimeDownSince = Date.now();
    const downMs = Date.now() - realtimeDownSince;
    return downMs >= downBackoffAfterMs ? degradedInterval : fallbackInterval;
  };

  const restartPoll = (nextInterval) => {
    activeInterval = nextInterval;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (destroyed) return;
    pollTimer = setInterval(() => {
      if (destroyed) return;

      if (useRealtime && !realtimeOk) {
        const wanted = pollIntervalForRealtimeDown();
        if (wanted !== activeInterval) {
          restartPoll(wanted);
          return;
        }
      }
      load();
    }, activeInterval);
  };

  if (useRealtime) {
    try {
      if (supabaseClient?.channel) {

        channel = supabaseClient
          .channel(`session-alert:${sessionId}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table,
              filter: `id=eq.${sessionId}`
            },
            (payload) => {
              if (destroyed) return;
              if (payload.eventType === 'DELETE') {
                emit(null);
                return;
              }
              emit(payload.new || null);
            }
          )
          .subscribe((status) => {
            if (destroyed) return;
            if (status === 'SUBSCRIBED') {
              realtimeOk = true;
              realtimeDownSince = null;
              load();
              restartPoll(healthyInterval);
            } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
              realtimeOk = false;
              restartPoll(pollIntervalForRealtimeDown());
            }
          });
      }
    } catch (e) {
      console.warn('restPollSessionById realtime init failed:', e);
    }
  }

  const stagger = Math.random() * (useRealtime ? 8000 : Math.min(fallbackInterval, 8000));
  startTimer = setTimeout(() => {
    if (destroyed) return;
    startTimer = null;
    load();
    if (!pollTimer) {
      restartPoll(realtimeOk ? healthyInterval : fallbackInterval);
    }
  }, stagger);

  return () => {
    destroyed = true;
    if (startTimer) { clearTimeout(startTimer); startTimer = null; }
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
    if (channel && supabaseClient) {
      try { supabaseClient.removeChannel(channel); } catch (_) { }
      channel = null;
    }
  };
}

function createMonitorAlertId(prefix = 'alert') {
  return `${prefix}_${Date.now()}`;
}

function buildMonitorAlertPayload(message, sentBy = 'admin', alertId = null) {
  return {
    admin_alert_active: true,
    admin_alert_message: String(message || '').trim(),
    admin_alert_id: alertId || createMonitorAlertId(),
    admin_alert_by: String(sentBy || 'admin').trim()
  };
}

function buildMonitorAlertDismissPayload() {
  return {
    admin_alert_active: false,
    admin_alert_message: '',
    admin_alert_id: '',
    admin_alert_by: ''
  };
}

function isSessionAdminAlertActive(sessionData) {
  return !!(sessionData && sessionData.admin_alert_active && String(sessionData.admin_alert_message || '').trim());
}

async function updateSessionAlertFields(sessionId, payload) {
  if (!sessionId) throw new Error('sessionId kosong');
  await updateDoc(getPublicDoc('Session Ujian', sessionId), payload);
}

async function updateSessionAlertFieldsMany(sessions, payload) {
  const ids = [...new Set(
    (sessions || [])
      .map((session) => (typeof session === 'string' ? session : session?.id))
      .filter(Boolean)
      .map(String)
  )];
  if (!ids.length) return;
  const table = 'Session Ujian';
  const chunkSize = 120;

  const chunks = [];
  for (let i = 0; i < ids.length; i += chunkSize) {
    chunks.push(ids.slice(i, i + chunkSize));
  }
  const parallel = 4;
  for (let i = 0; i < chunks.length; i += parallel) {
    const wave = chunks.slice(i, i + parallel);
    await Promise.all(wave.map(async (chunkIds) => {
      const { error } = await supabaseClient
        .from(table)
        .update(payload)
        .in('id', chunkIds);
      if (error) throw error;
    }));
  }
}

async function broadcastMonitorAlertToSessions(sessions, message, sentBy = 'admin') {
  const list = (sessions || []).filter((session) => session && session.id);
  if (!list.length) return null;
  const payload = buildMonitorAlertPayload(message, sentBy, createMonitorAlertId('alert_global'));
  await updateSessionAlertFieldsMany(list, payload);
  return payload;
}

async function dismissMonitorAlertsForSessions(sessions) {
  const list = (sessions || []).filter((session) => session && session.id);
  if (!list.length) return;
  const payload = buildMonitorAlertDismissPayload();
  await updateSessionAlertFieldsMany(list, payload);
}

async function forceResetSessionsMany(sessions, reason = 'proktor_all') {
  const list = (sessions || [])
    .map((session) => (typeof session === 'string' ? { id: session } : session))
    .filter((session) => session && session.id);
  if (!list.length) return 0;
  const resetPayload = {
    force_reset: true,
    force_reset_reason: String(reason || 'proktor_all'),
    force_reset_at: new Date().toISOString()
  };

  await updateSessionAlertFieldsMany(list, resetPayload);

  await new Promise((resolve) => setTimeout(resolve, 4500));
  const ids = list.map((s) => s.id);
  const chunkSize = 200;
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize);
    const { error } = await supabaseClient
      .from('Session Ujian')
      .delete()
      .in('id', chunk);
    if (error) throw error;
  }
  return list.length;
}

async function initAuth() {
  return { uid: "anonymous" };
}
