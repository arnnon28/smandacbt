function estimateDataUrlBytes(dataUrl) {
  const base64 = String(dataUrl).split(',')[1] || '';
  return Math.ceil(base64.length * 0.75);
}

function compressImageToTargetSize(b64, maxKB = 50) {
  return new Promise((res) => {
    const maxBytes = Math.max(4, Number(maxKB) || 50) * 1024;
    const img = new Image();
    img.decoding = 'async';

    img.onload = () => {
      const srcW = Math.max(1, img.naturalWidth || img.width || 1);
      const srcH = Math.max(1, img.naturalHeight || img.height || 1);

      const encode = (width, height, quality) => {
        const cvs = document.createElement('canvas');
        cvs.width = width;
        cvs.height = height;
        const ctx = cvs.getContext('2d');
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        return cvs.toDataURL('image/jpeg', Math.min(0.95, Math.max(0.35, quality)));
      };

      const fit = (maxDim) => {
        const long = Math.max(srcW, srcH);
        if (long <= maxDim) return { w: srcW, h: srcH };
        const scale = maxDim / long;
        return {
          w: Math.max(1, Math.round(srcW * scale)),
          h: Math.max(1, Math.round(srcH * scale))
        };
      };

      const bestAtSize = (w, h) => {
        let candidate = encode(w, h, 0.9);
        if (estimateDataUrlBytes(candidate) <= maxBytes) return candidate;

        let lo = 0.42;
        let hi = 0.9;
        let best = null;
        for (let i = 0; i < 9; i++) {
          const mid = (lo + hi) / 2;
          candidate = encode(w, h, mid);
          if (estimateDataUrlBytes(candidate) <= maxBytes) {
            best = candidate;
            lo = mid;
          } else {
            hi = mid;
          }
        }
        return best;
      };

      const startDim = maxKB <= 50 ? 960 : 1280;
      const dimLadder = [];
      for (let d = startDim; d >= 140; d = Math.floor(d * 0.82)) {
        if (!dimLadder.length || dimLadder[dimLadder.length - 1] !== d) dimLadder.push(d);
      }

      let best = null;
      let bestW = 0;
      let bestH = 0;
      for (const maxDim of dimLadder) {
        const { w, h } = fit(maxDim);
        const candidate = bestAtSize(w, h);
        if (candidate) {
          best = candidate;
          bestW = w;
          bestH = h;
          break;
        }
      }

      if (!best) {
        const { w, h } = fit(120);
        bestW = w;
        bestH = h;
        best = encode(w, h, 0.4);
      }

      let guard = 0;
      while (estimateDataUrlBytes(best) > maxBytes && bestW > 48 && bestH > 48 && guard < 14) {
        bestW = Math.max(48, Math.round(bestW * 0.88));
        bestH = Math.max(48, Math.round(bestH * 0.88));
        best = encode(bestW, bestH, 0.45);
        guard += 1;
      }

      res(best);
    };

    img.onerror = () => res(b64);
    img.src = b64;
  });
}

async function ensureImageUnderMaxKb(dataUrl, maxKB = 50) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image')) {
    return dataUrl;
  }
  const limit = Math.max(4, Number(maxKB) || 50) * 1024;
  if (/^data:image\/jpeg/i.test(dataUrl) && estimateDataUrlBytes(dataUrl) <= limit) {
    return dataUrl;
  }
  return compressImageToTargetSize(dataUrl, maxKB);
}

async function compressDataUrlsInHtml(html, maxKB = 50) {
  if (!html || typeof html !== 'string' || !html.includes('data:image')) return html || '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div id="__cbt_img_root">${html}</div>`, 'text/html');
  const root = doc.getElementById('__cbt_img_root');
  if (!root) return html;
  const imgs = Array.from(root.querySelectorAll('img'));
  for (const el of imgs) {
    const src = el.getAttribute('src') || '';
    if (!src.startsWith('data:image')) continue;
    el.setAttribute('src', await ensureImageUnderMaxKb(src, maxKB));
  }
  return root.innerHTML;
}

var BANK_SOAL_IMAGE_MAX_KB = 50;
var LOGO_MAX_KB = 50;

var LOGO_ASSET_PREFIX = 'cbt_logo_asset_';
var LOGO_STORAGE_BUCKET = 'cbt-logos';
var PACKET_STORAGE_BUCKET = 'cbt-packets';
var PACKET_STORAGE_CACHE_CONTROL = '120';
var LOGO_ASSET_ID_LENGTH = 10;

function generateLogoAssetId(length = LOGO_ASSET_ID_LENGTH) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

function isLogoAssetRef(value) {
  if (!value || typeof value !== 'string') return false;
  const ref = value.trim();
  if (/^https?:\/\//.test(ref)) return false;
  return /^[A-Za-z0-9]{1,10}$/.test(ref);
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Gagal membaca berkas gambar.'));
    reader.readAsDataURL(file);
  });
}

function dataUrlToBlob(dataUrl) {
  const [header, base64] = String(dataUrl).split(',');
  const mime = header.match(/:(.*?);/)?.[1] || 'image/jpeg';
  const binary = atob(base64);
  const arr = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function getLogoStoragePublicUrl(logoId) {
  const base = supabaseUrl;
  if (!base || !logoId) return null;
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${LOGO_STORAGE_BUCKET}/${logoId}.jpg`;
}

function resolveSchoolLogoUrl(logoRef) {
  const ref = String(logoRef || '').trim();
  if (!ref) return DEFAULT_APP_SETTINGS.schoolLogo;
  if (/^https?:\/\//.test(ref)) return ref;
  if (isLogoAssetRef(ref)) {
    const cached = myLocalStorage.getItem(`${LOGO_ASSET_PREFIX}${ref}`);
    if (cached) return cached;
    return getLogoStoragePublicUrl(ref) || DEFAULT_APP_SETTINGS.schoolLogo;
  }
  return ref;
}

async function tryUploadLogoToStorage(logoId, blob) {
  try {
    const path = `${logoId}.jpg`;
    const { error } = await supabaseClient.storage.from(LOGO_STORAGE_BUCKET).upload(path, blob, {
      upsert: true,
      contentType: 'image/jpeg',
      cacheControl: '3600'
    });
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn('Logo storage upload failed, using local cache', e);
    return false;
  }
}

async function uploadSchoolLogoFromFile(file) {
  if (!file?.type?.startsWith('image/')) {
    throw new Error('File harus berupa gambar (PNG, JPG, WEBP, dll).');
  }
  if (file.size > 2 * 1024 * 1024) {
    throw new Error('Ukuran file terlalu besar! Maksimal 2MB.');
  }

  const rawDataUrl = await readFileAsDataUrl(file);
  const compressed = await compressImageToTargetSize(rawDataUrl, LOGO_MAX_KB);
  const logoId = generateLogoAssetId(LOGO_ASSET_ID_LENGTH);
  const blob = dataUrlToBlob(compressed);

  myLocalStorage.setItem(`${LOGO_ASSET_PREFIX}${logoId}`, compressed);
  await tryUploadLogoToStorage(logoId, blob);

  const current = readAppSettingsFromLocal();
  const payload = {
    schoolName: current.schoolName,
    examTitle: current.examTitle,
    schoolLogo: logoId,
    footerText: current.footerText
  };
  await saveAppSettingsToCloud(payload);
  appSettingsToLocalKeys(payload);
  window.tempUploadedLogo = null;
  return logoId;
}

function hasActiveTextSelectionIn(rootSelector = '#main-system-view') {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
  const root = document.querySelector(rootSelector);
  if (!root) return false;
  const anchor = sel.anchorNode;
  return !!(anchor && root.contains(anchor));
}

function isSelectionInsideElement(el) {
  if (!el) return false;
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return false;
  const nodeInEl = (node) => {
    if (!node) return false;
    const target = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
    return !!(target && el.contains(target));
  };
  return nodeInEl(sel.anchorNode) || nodeInEl(sel.focusNode);
}

function hasActiveTokenSelection() {
  const tokenBar = document.getElementById('admin-active-session-bar');
  if (tokenBar && isSelectionInsideElement(tokenBar)) return true;
  return ['token-display-x', 'token-display-xi', 'token-display-xii'].some((id) => {
    const el = document.getElementById(id);
    return el && isSelectionInsideElement(el);
  });
}

function setElementTextPreservingSelection(el, text) {
  if (!el) return false;
  if (isSelectionInsideElement(el)) return false;
  const next = String(text ?? '');
  if (el.textContent === next) return true;
  el.textContent = next;
  return true;
}

var STANDARD_FOOTER_TEXT = '© 2026 Computer Based Test | Developed By arnnon';

var DEFAULT_APP_SETTINGS = {
  schoolName: 'SMA Negeri 2 Kuningan',
  examTitle: 'Asesmen Sumatif Akhir Tahun',
  schoolLogo: 'https://iili.io/KSdduPR.png',
  footerText: STANDARD_FOOTER_TEXT
};

var APP_SETTINGS_LOCAL_KEYS = {
  schoolName: 'er_sh_name',
  examTitle: 'er_ex_title',
  schoolLogo: 'er_sh_logo',
  footerText: 'er_footer_text',
  supabaseUrl: 'er_sb_url',
  supabaseKey: 'er_sb_key'
};

var serverTimeOffsetMs = 0;
var serverTimeSyncedAt = 0;

function applyServerTimeFromIso(iso) {
  if (!iso) return serverTimeOffsetMs;
  const serverMs = new Date(iso).getTime();
  if (Number.isNaN(serverMs)) return serverTimeOffsetMs;
  serverTimeOffsetMs = serverMs - Date.now();
  serverTimeSyncedAt = Date.now();
  return serverTimeOffsetMs;
}

async function syncServerTimeOffset(force = false) {
  const staleMs = 300 * 1000;
  if (!force && serverTimeSyncedAt && Date.now() - serverTimeSyncedAt < staleMs) {
    return serverTimeOffsetMs;
  }
  const t0 = Date.now();
  const { data, error } = await supabaseClient.rpc('cbt_server_now');
  if (error) {
    console.warn('syncServerTimeOffset failed', error);
    return serverTimeOffsetMs;
  }
  const serverMs = new Date(data).getTime();
  const t1 = Date.now();
  serverTimeOffsetMs = serverMs - Math.round((t0 + t1) / 2);
  serverTimeSyncedAt = Date.now();
  return serverTimeOffsetMs;
}

function getServerNowMs() {
  return Date.now() + serverTimeOffsetMs;
}

function getExamScheduleStartMs(schedule) {
  if (!schedule?.mulai) return null;
  return new Date(schedule.mulai).getTime();
}

function getExamScheduleEndMs(schedule) {
  if (schedule?.selesai) {
    const endMs = new Date(schedule.selesai).getTime();
    if (!Number.isNaN(endMs)) return endMs;
  }
  const startMs = getExamScheduleStartMs(schedule);
  if (startMs == null) return null;
  const durMs = (schedule.durasi || 60) * 60 * 1000;
  return startMs + durMs;
}

function formatDatetimeLocalValue(value) {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function computeScheduleDurationMinutes(mulai, selesai) {
  const startMs = new Date(mulai).getTime();
  const endMs = new Date(selesai).getTime();
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return null;
  return Math.round((endMs - startMs) / 60000);
}

function resolveScheduleEndDatetime(mulai, selesai, durasiMinutes) {
  const startMs = new Date(mulai).getTime();
  if (Number.isNaN(startMs)) throw new Error('Waktu mulai tidak valid.');

  if (selesai) {
    const endMs = new Date(selesai).getTime();
    if (Number.isNaN(endMs) || endMs <= startMs) {
      throw new Error('Waktu selesai harus setelah waktu mulai.');
    }
    return {
      mulai: new Date(startMs).toISOString(),
      selesai: new Date(endMs).toISOString(),
      durasi: computeScheduleDurationMinutes(mulai, selesai) || durasiMinutes || 60
    };
  }

  const dur = Number(durasiMinutes) || 60;
  const endIso = new Date(startMs + dur * 60000).toISOString();
  return {
    mulai: new Date(startMs).toISOString(),
    selesai: endIso,
    durasi: dur
  };
}

function getScheduleSelesaiForForm(schedule) {
  if (schedule?.selesai) return formatDatetimeLocalValue(schedule.selesai);
  if (schedule?.mulai && schedule?.durasi) {
    const endMs = new Date(schedule.mulai).getTime() + (Number(schedule.durasi) || 0) * 60000;
    return formatDatetimeLocalValue(new Date(endMs).toISOString());
  }
  return '';
}

function validateExamWindow(schedule, nowMs = getServerNowMs()) {
  const startMs = getExamScheduleStartMs(schedule);
  const endMs = getExamScheduleEndMs(schedule);
  if (startMs == null || endMs == null) {
    throw new Error('Jadwal ujian belum valid (waktu mulai belum diatur).');
  }
  if (nowMs < startMs) throw new Error('Ujian belum dimulai.');
  if (nowMs > endMs) throw new Error('Ujian telah selesai.');
  return {
    startMs,
    endMs,
    remainingSec: Math.max(0, Math.floor((endMs - nowMs) / 1000))
  };
}

function computeExamTimeRemainingSeconds(schedule, nowMs = getServerNowMs()) {
  const endMs = getExamScheduleEndMs(schedule);
  if (endMs == null) return 0;
  return Math.max(0, Math.floor((endMs - nowMs) / 1000));
}

function assertExamSubmissionAllowed(schedule, reason, nowMs = getServerNowMs(), graceSec = 20) {
  const endMs = getExamScheduleEndMs(schedule);
  if (endMs == null) return true;
  const autoReasons = [
    'Durasi Habis',
    'Keluar Layar/Tab',
    'Keluar Mode Layar Penuh',
    'Belah Layar',
    'Refresh Halaman',
    'Curang Terdeteksi'
  ];
  const reasonText = String(reason || '');
  if (autoReasons.some((r) => reasonText.includes(r))) {

    return true;
  }
  if (nowMs > endMs + graceSec * 1000) {
    throw new Error('Waktu ujian telah berakhir (validasi server).');
  }
  return true;
}

function readAppSettingsFromLocal() {
  return {
    schoolName: myLocalStorage.getItem(APP_SETTINGS_LOCAL_KEYS.schoolName) || DEFAULT_APP_SETTINGS.schoolName,
    examTitle: myLocalStorage.getItem(APP_SETTINGS_LOCAL_KEYS.examTitle) || DEFAULT_APP_SETTINGS.examTitle,
    schoolLogo: myLocalStorage.getItem(APP_SETTINGS_LOCAL_KEYS.schoolLogo) || DEFAULT_APP_SETTINGS.schoolLogo,
    footerText: myLocalStorage.getItem(APP_SETTINGS_LOCAL_KEYS.footerText) || DEFAULT_APP_SETTINGS.footerText,
    supabaseUrl: myLocalStorage.getItem(APP_SETTINGS_LOCAL_KEYS.supabaseUrl) || '',
    supabaseKey: myLocalStorage.getItem(APP_SETTINGS_LOCAL_KEYS.supabaseKey) || ''
  };
}

function appSettingsToLocalKeys(settings) {
  const s = settings || DEFAULT_APP_SETTINGS;
  myLocalStorage.setItem(APP_SETTINGS_LOCAL_KEYS.schoolName, s.schoolName || DEFAULT_APP_SETTINGS.schoolName);
  myLocalStorage.setItem(APP_SETTINGS_LOCAL_KEYS.examTitle, s.examTitle || DEFAULT_APP_SETTINGS.examTitle);
  myLocalStorage.setItem(APP_SETTINGS_LOCAL_KEYS.schoolLogo, s.schoolLogo || DEFAULT_APP_SETTINGS.schoolLogo);
  myLocalStorage.setItem(APP_SETTINGS_LOCAL_KEYS.footerText, s.footerText || DEFAULT_APP_SETTINGS.footerText);
  myLocalStorage.setItem(APP_SETTINGS_LOCAL_KEYS.supabaseUrl, s.supabaseUrl || '');
  myLocalStorage.setItem(APP_SETTINGS_LOCAL_KEYS.supabaseKey, s.supabaseKey || '');
}

function rowToAppSettings(row) {
  if (!row) return null;
  return {
    schoolName: row.nama_sekolah || DEFAULT_APP_SETTINGS.schoolName,
    examTitle: row.judul_ujian || DEFAULT_APP_SETTINGS.examTitle,
    schoolLogo: row.logo_url || DEFAULT_APP_SETTINGS.schoolLogo,
    footerText: row.footer_text || DEFAULT_APP_SETTINGS.footerText,
    supabaseUrl: row.supabase_url || '',
    supabaseKey: row.supabase_key || ''
  };
}

function appSettingsToRow(settings) {
  const s = settings || DEFAULT_APP_SETTINGS;
  return {
    id: 'app',
    nama_sekolah: s.schoolName || DEFAULT_APP_SETTINGS.schoolName,
    judul_ujian: s.examTitle || DEFAULT_APP_SETTINGS.examTitle,
    logo_url: s.schoolLogo || DEFAULT_APP_SETTINGS.schoolLogo,
    footer_text: s.footerText || DEFAULT_APP_SETTINGS.footerText,
    supabase_url: s.supabaseUrl || null,
    supabase_key: s.supabaseKey || null,
    updated_at: new Date().toISOString()
  };
}

async function loadAppSettingsFromCloud() {
  const snap = await getDoc(getPublicDoc('Pengaturan', 'app'));
  if (!snap.exists()) return null;
  return rowToAppSettings(snap.data());
}

async function saveAppSettingsToCloud(settings) {
  await setDoc(getPublicDoc('Pengaturan', 'app'), appSettingsToRow(settings), { merge: true });
}

async function initAppSettings(options = {}) {
  const { migrateLocal = true } = options;
  const legacyFooters = new Set([
    '',
    'Computer Based Test | by arnnon',
    '© 2026 Developer by arnnon'
  ]);
  try {
    let cloud = await loadAppSettingsFromCloud();
    if (!cloud && migrateLocal) {
      const hasLocal = myLocalStorage.getItem(APP_SETTINGS_LOCAL_KEYS.schoolName)
        || myLocalStorage.getItem(APP_SETTINGS_LOCAL_KEYS.examTitle)
        || myLocalStorage.getItem(APP_SETTINGS_LOCAL_KEYS.schoolLogo);
      if (hasLocal) {
        const local = readAppSettingsFromLocal();
        await saveAppSettingsToCloud(local);
        cloud = local;
      }
    }
    if (cloud && cloud.supabaseUrl && cloud.supabaseKey) {
      if (cloud.supabaseUrl !== supabaseUrl || cloud.supabaseKey !== supabaseKey) {
        console.warn('Database configuration changed in cloud settings. Reconnecting...');
        supabaseUrl = cloud.supabaseUrl;
        supabaseKey = cloud.supabaseKey;
        window.supabaseUrl = supabaseUrl;
        window.supabaseKey = supabaseKey;
        supabaseClient = (window.supabase || supabase).createClient(supabaseUrl, supabaseKey);
        window.supabaseClient = supabaseClient;
        cloud = await loadAppSettingsFromCloud();
      }
    }
    if (cloud) {
      if (legacyFooters.has(String(cloud.footerText || '').trim())) {
        cloud.footerText = STANDARD_FOOTER_TEXT;
      }
      appSettingsToLocalKeys(cloud);
    } else {
      appSettingsToLocalKeys(DEFAULT_APP_SETTINGS);
    }
    const storedFooter = myLocalStorage.getItem(APP_SETTINGS_LOCAL_KEYS.footerText);
    if (legacyFooters.has(String(storedFooter || '').trim())) {
      myLocalStorage.setItem(APP_SETTINGS_LOCAL_KEYS.footerText, STANDARD_FOOTER_TEXT);
    }
  } catch (e) {
    console.warn('initAppSettings failed, using local cache', e);
  }
  return readAppSettingsFromLocal();
}
