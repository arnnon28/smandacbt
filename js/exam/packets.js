var MEMORY_CACHE = {
  _store: {},
  get(key) { return this._store[key] ?? null; },
  set(key, val) { this._store[key] = val; }
};

function getCachedPacket(packetId) {
  if (!packetId) return null;
  const mem = MEMORY_CACHE.get(`packet_${packetId}`);
  if (mem) return mem;
  try {
    const raw = mySessionStorage.getItem(`cbt_packet_${packetId}`);
    if (raw) {
      const parsed = JSON.parse(raw);
      MEMORY_CACHE.set(`packet_${packetId}`, parsed);
      return parsed;
    }
  } catch (_) {}
  return null;
}

function setCachedPacket(packetId, data) {
  if (!packetId || !data) return;
  MEMORY_CACHE.set(`packet_${packetId}`, data);
  try {
    mySessionStorage.setItem(`cbt_packet_${packetId}`, JSON.stringify(data));
  } catch (_) {}
}

function getPacketStoragePublicUrl(packetId) {
  const id = String(packetId || '').trim();
  if (!id || !supabaseUrl) return null;
  const encoded = encodeURIComponent(id);
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/${PACKET_STORAGE_BUCKET}/${encoded}.json`;
}

async function fetchPacketStorageFingerprint(packetId) {
  const url = getPacketStoragePublicUrl(packetId);
  if (!url) return null;
  try {
    const res = await fetch(url, { method: 'HEAD', cache: 'no-cache' });
    if (!res.ok) return null;
    const etag = res.headers.get('etag') || '';
    const lastModified = res.headers.get('last-modified') || '';
    const contentLength = res.headers.get('content-length') || '';
    if (!etag && !lastModified && !contentLength) return null;
    return `head:${etag}|${lastModified}|${contentLength}`;
  } catch (_) {
    return null;
  }
}

async function peekBankSoalContentVersion(packetId) {
  if (!packetId) return null;
  try {
    const snap = await getDoc(getPublicDoc('Bank Soal', packetId, 'id_paket,konten_versi,jumlah_soal'));
    if (snap.exists()) {
      const data = snap.data() || {};
      if (data.konten_versi) return String(data.konten_versi);
      return `jumlah:${Number(data.jumlah_soal) || 0}`;
    }
  } catch (err) {
    const missing = typeof extractMissingSelectColumn === 'function'
      ? extractMissingSelectColumn(err)
      : null;
    if (missing === 'konten_versi') {
      try {
        const snap = await getDoc(getPublicDoc('Bank Soal', packetId, 'id_paket,jumlah_soal'));
        if (snap.exists()) {
          return `jumlah:${Number(snap.data()?.jumlah_soal) || 0}`;
        }
      } catch (_) { }
    }
  }
  return fetchPacketStorageFingerprint(packetId);
}

async function fetchPacketFromStorage(packetId, options = {}) {
  const url = getPacketStoragePublicUrl(packetId);
  if (!url) return null;
  try {
    const bust = options.cacheBust ? `?t=${Date.now()}` : '';
    const res = await fetch(`${url}${bust}`, {
      cache: options.cacheBust ? 'no-store' : 'default'
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data || !Array.isArray(data.daftar_soal)) return null;
    return {
      id_paket: data.id_paket || packetId,
      nama_paket: data.nama_paket || '',
      daftar_soal: data.daftar_soal,
      jumlah_soal: data.jumlah_soal,
      konten_versi: data.konten_versi || ''
    };
  } catch (e) {
    console.warn('fetchPacketFromStorage failed', packetId, e);
    return null;
  }
}

async function uploadPacketToStorage(packetId, packetData) {
  if (!packetId || !packetData || !supabaseClient) return false;
  try {
    const payload = {
      id_paket: packetData.id_paket || packetId,
      nama_paket: packetData.nama_paket || '',
      jumlah_soal: Number(packetData.jumlah_soal) || (Array.isArray(packetData.daftar_soal) ? packetData.daftar_soal.length : 0),
      konten_versi: packetData.konten_versi || '',
      daftar_soal: Array.isArray(packetData.daftar_soal) ? packetData.daftar_soal : []
    };
    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    const path = `${packetId}.json`;
    const { error } = await supabaseClient.storage.from(PACKET_STORAGE_BUCKET).upload(path, blob, {
      upsert: true,
      contentType: 'application/json',
      cacheControl: PACKET_STORAGE_CACHE_CONTROL
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('uploadPacketToStorage failed', packetId, e);
    return false;
  }
}

async function deletePacketFromStorage(packetId) {
  if (!packetId || !supabaseClient) return false;
  try {
    const { error } = await supabaseClient.storage.from(PACKET_STORAGE_BUCKET).remove([`${packetId}.json`]);
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('deletePacketFromStorage failed', packetId, e);
    return false;
  }
}

async function loadBankSoalPacket(packetId, options = {}) {
  if (!packetId) return null;
  const preferStorage = options.preferStorage !== false;
  const forceRefresh = options.forceRefresh === true;
  const cacheBust = options.cacheBust === true || (forceRefresh && options.cacheBust !== false && options.versionChanged === true);

  if (!forceRefresh) {
    const cached = getCachedPacket(packetId);
    if (cached?.daftar_soal) return cached;
  }

  if (preferStorage) {
    const fromStorage = await fetchPacketFromStorage(packetId, { cacheBust });
    if (fromStorage) {
      setCachedPacket(packetId, fromStorage);
      return fromStorage;
    }
  }

  try {
    const snap = await getDoc(getPublicDoc('Bank Soal', packetId, 'id_paket,nama_paket,daftar_soal,jumlah_soal,konten_versi'));
    if (!snap.exists()) return null;
    const data = snap.data();
    setCachedPacket(packetId, data);
    uploadPacketToStorage(packetId, data).catch(() => {});
    return data;
  } catch (e) {
    const missing = typeof extractMissingSelectColumn === 'function'
      ? extractMissingSelectColumn(e)
      : null;
    if (missing === 'konten_versi') {
      try {
        const snap = await getDoc(getPublicDoc('Bank Soal', packetId, 'id_paket,nama_paket,daftar_soal,jumlah_soal'));
        if (!snap.exists()) return null;
        const data = snap.data();
        setCachedPacket(packetId, data);
        uploadPacketToStorage(packetId, data).catch(() => {});
        return data;
      } catch (err2) {
        console.warn('loadBankSoalPacket failed', packetId, err2);
        return null;
      }
    }
    console.warn('loadBankSoalPacket failed', packetId, e);
    return null;
  }
}

async function syncBankSoalPacketToStorage(packetData) {
  if (!packetData?.id_paket) return false;
  return uploadPacketToStorage(packetData.id_paket, packetData);
}
