function startResultsPagePoller() {
  let pollTimer = null;
  let _allPagesLoaded = false;
  let _loadingChunks = false;
  let _pageCount = 1;
  const PAGE_SIZE = 50;

  async function loadPage(pageNum) {
    try {
      const { data, error } = await supabaseClient.rpc('cbt_get_results_page', {
        p_page: pageNum,
        p_per_page: PAGE_SIZE
      });
      if (error) throw error;
      if (!data) return [];
      _pageCount = Math.ceil((data.total || 0) / PAGE_SIZE) || 1;
      const rows = data.data || [];
      return typeof normalizeJawabanRow === 'function'
        ? rows.map(r => normalizeJawabanRow(r, r.id))
        : rows;
    } catch (e) {
      console.warn('loadResultsPage failed:', e);
      return [];
    }
  }

  async function pollResults() {
    if (_allPagesLoaded && !_loadingChunks) {
      const rows = await loadPage(1);
      if (rows.length === 0) return;
      const page1Ids = new Set(rows.map(r => r.id));
      const prevPage1 = ALL_RESULTS.filter(r => page1Ids.has(r.id));
      const nonPage1 = ALL_RESULTS.filter(r => !page1Ids.has(r.id));
      const mergedPage1 = rows.map((r) => {
        const prev = ALL_RESULTS.find((p) => p.id === r.id);
        if (!prev) return r;
        const keepJawaban = prev.jawaban && typeof prev.jawaban === 'object'
          && (!r.jawaban || (typeof r.jawaban === 'object' && Object.keys(r.jawaban).length === 0));
        return keepJawaban ? { ...prev, ...r, jawaban: prev.jawaban } : { ...prev, ...r };
      });
      const sig = (list) => list.map((r) =>
        `${r.id}|${r.status}|${r.nilai}|${r.waktu_kirim}|${r.jumlah_benar}|${r.jumlah_salah}|${r.penjelasan}`
      ).join(';');
      if (sig(mergedPage1) !== sig(prevPage1) || mergedPage1.length !== prevPage1.length) {
        ALL_RESULTS = [...mergedPage1, ...nonPage1];
        applyPostResultsCallbacks();
      }
      return;
    }

    const rows = await loadPage(1);
    if (rows.length === 0) return;

    const page1Ids = new Set(rows.map(r => r.id));
    const nonPage1 = ALL_RESULTS.filter(r => !page1Ids.has(r.id));
    const mergedPage1 = rows.map((r) => {
      const prev = ALL_RESULTS.find((p) => p.id === r.id);
      if (!prev) return r;
      const keepJawaban = prev.jawaban && typeof prev.jawaban === 'object'
        && (!r.jawaban || (typeof r.jawaban === 'object' && Object.keys(r.jawaban).length === 0));
      return keepJawaban ? { ...prev, ...r, jawaban: prev.jawaban } : { ...prev, ...r };
    });
    ALL_RESULTS = [...mergedPage1, ...nonPage1];
    applyPostResultsCallbacks();

    if (!_loadingChunks) {
      _loadingChunks = true;
      (async () => {
        for (let p = 2; p <= _pageCount; p++) {
          const chunk = await loadPage(p);
          if (chunk.length === 0) break;
          ALL_RESULTS = ALL_RESULTS.filter(r => !chunk.some(c => c.id === r.id));
          ALL_RESULTS = [...ALL_RESULTS, ...chunk];
        }
        _allPagesLoaded = true;
        _loadingChunks = false;
        applyPostResultsCallbacks();
      })();
    }
  }

  function applyPostResultsCallbacks() {
    maybeCleanupCompletedExamSessions(ALL_RESULTS).then((cleanedCount) => {
      if (cleanedCount > 0) {
        ACTIVE_MONITOR_DATA = ACTIVE_MONITOR_DATA.filter((session) => {
          return !ALL_RESULTS.some((result) => result.id === session.id && isExamResultSaved(result));
        });
        renderIfViewActive('admin-monitor', renderActiveMonitorList);
        runAdminRealtimeDomUpdate(() => refreshCachedDashboardStats());
      }
    });
    renderResultsViewLive();
    runAdminRealtimeDomUpdate(() => refreshResultMapelDropdown());
    renderIfViewActive('admin-monitor', renderActiveMonitorList);
    runAdminRealtimeDomUpdate(() => refreshCachedDashboardStats());
  }

  pollResults();
  pollTimer = setInterval(pollResults, RESULTS_POLL_MS);
  return () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
}

async function fetchAllSessionsViaRpc() {
  const pageSize = 500;
  const all = [];
  let page = 1;
  let total = null;
  while (true) {
    const { data, error } = await supabaseClient.rpc('cbt_get_sessions_page', {
      p_page: page,
      p_per_page: pageSize
    });
    if (error) throw error;
    const rows = data?.data || [];
    if (page === 1) {
      const t = Number(data?.total);
      total = Number.isFinite(t) && t >= 0 ? t : null;
    }
    all.push(...rows);
    if (!rows.length || rows.length < pageSize) break;
    if (total != null && all.length >= total) break;
    page += 1;
    if (page > 50) break;
  }
  return all;
}

function startSessionsPagePoller() {
  let pollTimer = null;
  let inFlight = false;

  async function pollSessions() {
    if (inFlight) return;
    inFlight = true;
    try {
      let rows;
      try {
        rows = await fetchAllSessionsViaRpc();
      } catch (rpcErr) {
        console.warn('cbt_get_sessions_page unavailable, fallback select:', rpcErr);
        const snap = await getDocs(getPublicCollection('Session Ujian', SESSION_UJIAN_COLS));
        rows = (snap.docs || []).map((d) => (typeof d?.data === 'function' ? d.data() : d));
      }
      ACTIVE_MONITOR_DATA = (rows || []).filter((session) =>
        !session?.force_finished
        && !session?.force_reset
        && !ALL_RESULTS.some((result) => result.id === session.id && isExamResultSaved(result))
      );
      maybeCleanupCompletedExamSessions(ALL_RESULTS).then((cleanedCount) => {
        if (cleanedCount > 0) {
          ACTIVE_MONITOR_DATA = ACTIVE_MONITOR_DATA.filter((session) => {
            return !ALL_RESULTS.some((result) => result.id === session.id && isExamResultSaved(result));
          });
          renderIfViewActive('admin-monitor', renderActiveMonitorList);
          runAdminRealtimeDomUpdate(() => refreshCachedDashboardStats());
        }
      });
      renderIfViewActive('admin-monitor', renderActiveMonitorList);
      runAdminRealtimeDomUpdate(() => refreshCachedDashboardStats());
    } catch (e) {
      console.warn('pollSessions failed:', e);
    } finally {
      inFlight = false;
    }
  }

  pollSessions();
  pollTimer = setInterval(pollSessions, 120000);
  return () => { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } };
}

async function maybeCleanupCompletedExamSessions(results = []) {
  const ids = (results || [])
    .filter((r) => typeof isExamResultSaved === 'function' ? isExamResultSaved(r) : r?.status === 'Selesai')
    .map((r) => r.id)
    .filter(Boolean)
    .sort();
  const sig = ids.join('|');
  const now = Date.now();
  if (sig === window.__cleanupSessionsSig) return 0;
  if (now - (window.__cleanupSessionsAt || 0) < 60000) return 0;
  window.__cleanupSessionsAt = now;
  const cleaned = await cleanupCompletedExamSessions(results);
  window.__cleanupSessionsSig = sig;
  return cleaned || 0;
}

function startRealtimeAdminListeners() {
  if (!firebaseUser) return; toggleLoader(true, "SINKRONISASI...");
  unsubscribeStudents = onSnapshot(getPublicCollection("Siswa", SISWA_LIGHT_COLS), (s) => {
    const docs = normalizeRealtimeSnapshot(s);
    ALL_STUDENTS = docs.map(d => (typeof d?.data === 'function' ? d.data() : d));
    renderIfViewActive('admin-students', renderStudentsCards);
    runAdminRealtimeDomUpdate(() => updateClassSelectors());
    runAdminRealtimeDomUpdate(() => refreshCachedDashboardStats());
  }, { noRealtime: true });
  unsubscribeSchedules = onSnapshot(getPublicCollection("Jadwal Ujian", JADWAL_UJIAN_COLS), (s) => {
    const docs = normalizeRealtimeSnapshot(s);
    ALL_SCHEDULES = docs.map(d => (typeof d?.data === 'function' ? d.data() : d));
    renderIfViewActive('admin-schedule', renderSchedules);
    runAdminRealtimeDomUpdate(() => updateAdminTokenBars());
    runAdminRealtimeDomUpdate(() => refreshCachedDashboardStats());
    renderIfViewActive('admin-dashboard', renderDashboardActiveExamsTable);
  }, { noRealtime: true });
  unsubscribeMonitor = startSessionsPagePoller();
  unsubscribeResults = startResultsPagePoller();
  unsubscribeAdmins = onSnapshot(getPublicCollection("Admin", ADMIN_LIGHT_COLS), (s) => {
    const docs = normalizeRealtimeSnapshot(s);
    ALL_ADMINS = docs.map(d => (typeof d?.data === 'function' ? d.data() : d));
    renderIfViewActive('admin-admins', renderAdminsCards);
  }, { noRealtime: true });
  unsubscribePackets = onSnapshot(getPublicCollection("Bank Soal", BANK_SOAL_LIGHT_COLS), (s) => {
    const docs = normalizeRealtimeSnapshot(s);
    const incoming = docs.map(d => (typeof d?.data === 'function' ? d.data() : d));
    ALL_PACKETS = incoming.map((row) => {
      const prev = ALL_PACKETS.find((p) => p.id_paket === row.id_paket);
      if (prev?.daftar_soal && !row.daftar_soal) {
        return { ...row, daftar_soal: prev.daftar_soal };
      }
      return row;
    });
    renderIfViewActive('admin-banksoal', renderPacketsCards);
    runAdminRealtimeDomUpdate(() => refreshBankSoalDropdowns());
    runAdminRealtimeDomUpdate(() => refreshCachedDashboardStats());
    renderIfViewActive('admin-dashboard', renderDashboardActiveExamsTable);
    toggleLoader(false);
  }, { noRealtime: true });
}

function stopAdminRealtimeListeners() {
  if (unsubscribeStudents) unsubscribeStudents(); if (unsubscribeSchedules) unsubscribeSchedules(); if (unsubscribeMonitor) unsubscribeMonitor(); if (unsubscribeResults) unsubscribeResults(); if (unsubscribePackets) unsubscribePackets(); if (unsubscribeAdmins) unsubscribeAdmins();
  if (typeof stopAppSettingsListener === 'function') stopAppSettingsListener();
}

async function refreshCachedDashboardStats(force = false) {
  if (!force && isAdminPortraitMobile()) return;
  const textSelector = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
  const now = Date.now(); if (!force && (now - CACHE_AGGREGATIONS.timestamp < 120000)) { applyDashboardStatsUI(CACHE_AGGREGATIONS.data); updateDatabaseCapacityStats(); return; }
  const stats = { totalSiswa: ALL_STUDENTS.length, totalKelas: new Set(ALL_STUDENTS.map(s => s.kelas)).size, totalPaket: ALL_PACKETS.length, totalJadwal: ALL_SCHEDULES.length, sedangUjian: ACTIVE_MONITOR_DATA.length, sudahSubmit: ALL_RESULTS.filter(r => (typeof isExamResultRow === 'function' ? isExamResultRow(r) : r.status === 'Selesai')).length };
  CACHE_AGGREGATIONS.timestamp = now; CACHE_AGGREGATIONS.data = stats; applyDashboardStatsUI(stats);
  updateDatabaseCapacityStats();
}

function updateDatabaseCapacityStats() {
  try {

    const sizeInBytes = (ALL_ADMINS.length * 150) +
                        (ALL_STUDENTS.length * 200) +
                        (ALL_PACKETS.length * 35000) +
                        (ALL_SCHEDULES.length * 400) +
                        (ALL_RESULTS.length * 8000) +
                        (ACTIVE_MONITOR_DATA.length * 500);
    const sizeInMB = sizeInBytes / (1024 * 1024);
    const maxCapacityMB = 500;

    let sizeText = '';
    if (sizeInBytes < 1024) {
      sizeText = `${sizeInBytes.toFixed(2)} B`;
    } else if (sizeInBytes < 1024 * 1024) {
      sizeText = `${(sizeInBytes / 1024).toFixed(2)} KB`;
    } else {
      sizeText = `${sizeInMB.toFixed(2)} MB`;
    }

    const remainingMB = Math.max(0, maxCapacityMB - sizeInMB);
    const remainingText = `${remainingMB.toFixed(2)} MB`;

    const percentage = Math.min(100, (sizeInMB / maxCapacityMB) * 100);

    const usedEl = document.getElementById('db-used-text');
    const freeEl = document.getElementById('db-free-text');
    const progressEl = document.getElementById('db-progress-bar');

    if (usedEl) usedEl.innerText = sizeText;
    if (freeEl) freeEl.innerText = remainingText;
    if (progressEl) {
      progressEl.style.width = `${percentage.toFixed(2)}%`;
      if (percentage > 90) {
        progressEl.className = "bg-rose-600 h-2 rounded-full transition-all duration-500";
      } else if (percentage > 70) {
        progressEl.className = "bg-amber-500 h-2 rounded-full transition-all duration-500";
      } else {
        progressEl.className = "bg-primary h-2 rounded-full transition-all duration-500";
      }
    }
  } catch (e) {
    console.error("updateDatabaseCapacityStats error:", e);
  }
}

const getRefreshSnapshotDocs = (snapshot) => {
  if (!snapshot) return [];
  if (Array.isArray(snapshot)) return snapshot;
  if (Array.isArray(snapshot.docs)) return snapshot.docs;
  if (typeof snapshot.forEach === 'function') {
    const docs = [];
    snapshot.forEach((doc) => docs.push(doc));
    return docs;
  }
  return [];
};

function applyResultsRows(snapshot) {
  ALL_RESULTS = typeof mapJawabanSnapshotRows === 'function'
    ? mapJawabanSnapshotRows(snapshot)
    : getRefreshSnapshotDocs(snapshot).map((d) => (typeof d?.data === 'function' ? d.data() : d));
  return ALL_RESULTS;
}

function renderResultsViewLive() {
  if (CURRENT_ADMIN_VIEW !== 'admin-results') return;
  refreshResultMapelDropdown(true);
  renderResultsCards();
}

async function refreshResultsFromDatabase() {
  if (!firebaseUser) return;
  try {
    const resultsSnap = await getDocs(getPublicCollection('Jawaban Siswa', JAWABAN_SISWA_LIGHT_COLS));
    applyResultsRows(resultsSnap);
    await maybeCleanupCompletedExamSessions(ALL_RESULTS);
    ACTIVE_MONITOR_DATA = ACTIVE_MONITOR_DATA.filter((session) => {
      return !ALL_RESULTS.some((result) => result.id === session.id && isExamResultSaved(result));
    });
    renderResultsViewLive();
    runAdminRealtimeDomUpdate(() => refreshCachedDashboardStats(true));
  } catch (e) {
    console.warn('refreshResultsFromDatabase failed', e);
    renderResultsViewLive();
  }
}

async function handleRefreshDatabase() {
  if (!firebaseUser) return;
  if (window.__refreshDatabaseBusy) return;
  window.__refreshDatabaseBusy = true;
  toggleLoader(true, 'Memuat ulang semua data terbaru dari database...');
  try {
    let monitorRows = [];
    try {
      monitorRows = await fetchAllSessionsViaRpc();
    } catch (_) {
      const monitorSnap = await getDocs(getPublicCollection('Session Ujian', SESSION_UJIAN_COLS));
      monitorRows = (monitorSnap.docs || []).map((d) => d.data());
    }
    const [siswaSnap, jadwalSnap, resultsSnap, bankSoalSnap, adminSnap] = await Promise.all([
      getDocs(getPublicCollection('Siswa', SISWA_LIGHT_COLS)),
      getDocs(getPublicCollection('Jadwal Ujian', JADWAL_UJIAN_COLS)),
      getDocs(getPublicCollection('Jawaban Siswa', JAWABAN_SISWA_LIGHT_COLS)),
      getDocs(getPublicCollection('Bank Soal', BANK_SOAL_LIGHT_COLS)),
      getDocs(getPublicCollection('Admin', ADMIN_LIGHT_COLS))
    ]);
    const siswaDocs = getRefreshSnapshotDocs(siswaSnap);
    const jadwalDocs = getRefreshSnapshotDocs(jadwalSnap);
    const bankSoalDocs = getRefreshSnapshotDocs(bankSoalSnap);
    const adminDocs = getRefreshSnapshotDocs(adminSnap);

    ALL_STUDENTS = []; siswaDocs.forEach(d => ALL_STUDENTS.push(d.data()));
    ALL_SCHEDULES = []; jadwalDocs.forEach(d => ALL_SCHEDULES.push(d.data()));
    ACTIVE_MONITOR_DATA = Array.isArray(monitorRows) ? monitorRows.slice() : [];
    applyResultsRows(resultsSnap);
    const prevPackets = ALL_PACKETS.slice();
    ALL_PACKETS = [];
    bankSoalDocs.forEach((d) => {
      const row = d.data();
      const prev = prevPackets.find((p) => p.id_paket === row.id_paket);
      ALL_PACKETS.push(prev?.daftar_soal && !row.daftar_soal
        ? { ...row, daftar_soal: prev.daftar_soal }
        : row);
    });
    ALL_ADMINS = []; adminDocs.forEach(d => ALL_ADMINS.push(d.data()));
    await maybeCleanupCompletedExamSessions(ALL_RESULTS);
    ACTIVE_MONITOR_DATA = ACTIVE_MONITOR_DATA.filter((session) => {
      return !session?.force_finished
        && !session?.force_reset
        && !ALL_RESULTS.some((result) => result.id === session.id && isExamResultSaved(result));
    });
    renderStudentsCards(); updateClassSelectors(true); renderSchedules(); updateAdminTokenBars(true); renderActiveMonitorList(); refreshResultMapelDropdown(true); renderResultsCards(); renderPacketsCards(); refreshBankSoalDropdowns(true); refreshCachedDashboardStats(true); renderDashboardActiveExamsTable(); renderAdminsCards();
    await refreshAppSettingsFromCloud();
    showToast('Semua data terbaru berhasil dimuat.', 'success', 4000);
  } catch (err) {
    showToast(err.message || 'Gagal memuat data.', 'danger', 5000);
  } finally {
    toggleLoader(false);
    window.__refreshDatabaseBusy = false;
  }
}

function askRefreshDatabase() {
  if (!firebaseUser) return;
  refreshAppSettingsFromCloud();
  showToast('Memuat ulang data terbaru...', 'info', 3000);
  return handleRefreshDatabase();
}

function applyDashboardStatsUI(s) {
  const e = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
  e('stat-total-siswa', s.totalSiswa); e('stat-total-kelas', s.totalKelas); e('stat-total-paket', s.totalPaket); e('stat-total-jadwal', s.totalJadwal); e('stat-sedang-ujian', s.sedangUjian); e('stat-sudah-submit', s.sudahSubmit);
}

function updateClassSelectors(force = false) {
  if (!force && isAdminPortraitMobile()) return;
  const u = [...new Set(ALL_STUDENTS.map(s => s.kelas))].sort(sortClassStrings);
  const key = u.join('|');
  if (key === CACHED_CLASS_LIST) return;
  const classSelectIds = ['filter-monitor-kelas', 'filter-student-class', 'filter-result-kelas', 'filter-dashboard-kelas'];
  const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : (v) => String(v ?? '');
  classSelectIds.forEach(id => {
    const s = document.getElementById(id);
    if (!s || document.activeElement === s) return;
    const v = s.value;
    s.innerHTML = `<option value="">Semua Kelas</option>` + u.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    s.value = v;
  });
  const anyClassSelectFocused = classSelectIds.some(id => document.activeElement === document.getElementById(id));
  if (!anyClassSelectFocused) CACHED_CLASS_LIST = key;
  refreshBankSoalDropdowns(force, { refreshList: false });
}

function refreshResultMapelDropdown(force = false) {
  if (!force && isAdminPortraitMobile()) return;
  const resultMapelSelect = document.getElementById('filter-result-mapel');
  if (!resultMapelSelect) return;

  const mapelMap = new Map();
  ALL_RESULTS.forEach(r => {
    if (typeof isExamResultRow === 'function' && !isExamResultRow(r)) return;
    const raw = String(r.mapel || '');
    const cleaned = cleanMapelName(raw);
    if (!cleaned) return;
    const mapKey = cleaned.toLowerCase();
    if (!mapelMap.has(mapKey)) mapelMap.set(mapKey, cleaned);
  });
  const mapelOptions = Array.from(mapelMap.values()).sort((a, b) => a.localeCompare(b, 'id'));
  const key = mapelOptions.join('|');
  if (key === CACHED_RESULT_MAPEL) return;
  if (document.activeElement === resultMapelSelect) return;

  CACHED_RESULT_MAPEL = key;
  const currentMapel = (resultMapelSelect.value || '').trim();
  const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : (v) => String(v ?? '');
  resultMapelSelect.innerHTML = `<option value="">Semua Mapel</option>` + mapelOptions.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('');
  if (currentMapel) {
    const match = mapelOptions.find(m => m.toLowerCase() === currentMapel.toLowerCase());
    resultMapelSelect.value = match || '';
  } else {
    resultMapelSelect.value = '';
  }
}

function updateAdminTokenBars(force = false) {
  if (!force && isAdminPortraitMobile()) {
    window.__deferredUpdateAdminTokenBars = true;
    return;
  }
  const tokenIds = ['token-display-x', 'token-display-xi', 'token-display-xii'];
  const tokenEls = tokenIds.map((id) => document.getElementById(id)).filter(Boolean);
  const blockedBySelection = (typeof hasActiveTokenSelection === 'function' && hasActiveTokenSelection())
    || tokenEls.some((el) => typeof isSelectionInsideElement === 'function' && isSelectionInsideElement(el));
  if (blockedBySelection) {
    window.__deferredUpdateAdminTokenBars = true;
    return;
  }
  window.__deferredUpdateAdminTokenBars = false;

  const todayStr = new Date().toLocaleDateString('en-CA');
  const todaySchedules = ALL_SCHEDULES.filter(s => s.mulai && s.mulai.startsWith(todayStr));
  const targetSchedules = todaySchedules.length > 0 ? todaySchedules : ALL_SCHEDULES;

  const g = (regex) => targetSchedules.find(s => Array.isArray(s.kelas_terpilih) && s.kelas_terpilih.some(c => regex.test(c)));
  const x = g(/^(X\b|10\b)/i);
  const xi = g(/^(XI\b|11\b)/i);
  const xii = g(/^(XII\b|12\b)/i);

  const setTokenText = (id, value) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (typeof setElementTextPreservingSelection === 'function') {
      const updated = setElementTextPreservingSelection(el, value);
      if (!updated) window.__deferredUpdateAdminTokenBars = true;
      return;
    }
    el.textContent = value;
  };
  setTokenText('token-display-x', x ? x.token : '-----');
  setTokenText('token-display-xi', xi ? xi.token : '-----');
  setTokenText('token-display-xii', xii ? xii.token : '-----');

  const btn = document.getElementById('btn-generate-all-tokens');
  if (btn) {
    if (mySessionStorage.getItem('tokens_generated_session') === 'true') {
      btn.classList.add('opacity-50', 'cursor-not-allowed');
      btn.disabled = true;
    } else {
      btn.classList.remove('opacity-50', 'cursor-not-allowed');
      btn.disabled = false;
    }
  }
}
