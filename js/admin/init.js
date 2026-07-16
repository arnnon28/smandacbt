function setupInteractiveListeners() {
  const safeAdd = (id, event, callback) => { const el = document.getElementById(id); if (el) el.addEventListener(event, callback); };

  safeAdd('btn-collapse-sidebar', 'click', () => {
    sidebarCollapsed = !sidebarCollapsed;
    const sb = document.getElementById('system-sidebar');
    if (sb) {
      sb.classList.toggle('collapsed', sidebarCollapsed);
    }
  });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    const viewId = btn.getAttribute('data-nav');
    if (viewId) btn.addEventListener('click', () => switchView(viewId));
  });

  safeAdd('btn-sidebar-logout', 'click', handleLogout);
  safeAdd('excel-import-file', 'change', handleExcelImportSiswa); safeAdd('docx-import-file', 'change', handleDOCXImportSoal); safeAdd('import-database-file', 'change', handleImportDatabase);
  safeAdd('btn-download-template', 'click', downloadSiswaTemplate); safeAdd('btn-download-word-template', 'click', downloadWordTemplate); safeAdd('btn-add-student-manual', 'click', handleAddStudentManual); safeAdd('btn-delete-all-students', 'click', handleDeleteAllStudents);
  safeAdd('btn-download-kartu-ujian', 'click', handleDownloadKartuUjian);
  safeAdd('btn-add-admin', 'click', handleAddAdminManual);
  safeAdd('btn-add-schedule', 'click', handleAddSchedule); safeAdd('btn-export-database', 'click', handleExportDatabase);
  safeAdd('btn-delete-all-questions', 'click', handleDeleteAllQuestions); safeAdd('btn-delete-all-schedules', 'click', handleDeleteAllSchedules); safeAdd('btn-delete-exam-answers', 'click', handleDeleteExamAnswers);
  safeAdd('btn-purge-database', 'click', askPurgeDatabaseTotal);
  safeAdd('btn-generate-all-tokens', 'click', handleGenerateAllTokens);
  safeAdd('btn-refresh-database', 'click', askRefreshDatabase);
  safeAdd('btn-refresh-monitor', 'click', askRefreshDatabase);
  safeAdd('btn-admin-portrait-refresh', 'click', handleAdminPortraitRefresh);
  safeAdd('btn-save-manual-question', 'click', (e) => { e.preventDefault(); handleSaveManualQuestion(); });
  safeAdd('btn-clear-manual-question', 'click', (e) => { e.preventDefault(); clearManualQuestionTextarea(); });
  safeAdd('tab-banksoal-create', 'click', () => setBankSoalTab('create'));
  safeAdd('tab-banksoal-packets', 'click', () => setBankSoalTab('packets'));
  safeAdd('tab-banksoal-view', 'click', () => setBankSoalTab('view'));
  safeAdd('btn-global-monitor-chat', 'click', triggerGlobalMonitorChat);
  safeAdd('btn-reset-all-sessions', 'click', handleResetAllSessions); safeAdd('btn-export-results-report', 'click', handleExportResultsReport);
  safeAdd('btn-export-item-analysis-report', 'click', handleExportItemAnalysisReport);

  const debouncedRenderStudents = debounce(() => runAdminFilterRender('students', renderStudentsCards));
  const debouncedRenderMonitor = debounce(() => runAdminFilterRender('monitor', renderActiveMonitorList));
  const debouncedRenderResults = debounce(() => runAdminFilterRender('results', renderResultsCards));
  const debouncedRenderBankSoal = debounce(() => runAdminFilterRender('banksoal', renderBankSoalQuestionList));
  const debouncedRenderDashboard = debounce(() => runAdminFilterRender('dashboard', renderDashboardActiveExamsTable));

  const ss = document.getElementById('search-student'); if (ss) ss.addEventListener('input', debouncedRenderStudents);
  const fs = document.getElementById('filter-student-class'); if (fs) fs.addEventListener('change', () => { preserveScrollWhile(() => { resetPageNumber('students'); renderStudentsCards(); }); });
  const sps = document.getElementById('students-page-size'); if (sps) sps.addEventListener('change', () => { preserveScrollWhile(() => { resetPageNumber('students'); renderStudentsCards(); }); });
  const ms = document.getElementById('filter-monitor-search'); if (ms) ms.addEventListener('input', debouncedRenderMonitor);
  const mk = document.getElementById('filter-monitor-kelas'); if (mk) mk.addEventListener('change', () => { preserveScrollWhile(() => { resetPageNumber('monitor'); renderActiveMonitorList(); }); });
  const mt = document.getElementById('filter-monitor-status'); if (mt) mt.addEventListener('change', () => { preserveScrollWhile(() => { resetPageNumber('monitor'); renderActiveMonitorList(); }); });
  const mps = document.getElementById('monitor-page-size'); if (mps) mps.addEventListener('change', () => { preserveScrollWhile(() => { resetPageNumber('monitor'); renderActiveMonitorList(); }); });
  const rs = document.getElementById('filter-result-search'); if (rs) rs.addEventListener('input', debouncedRenderResults);
  const rk = document.getElementById('filter-result-kelas'); if (rk) rk.addEventListener('change', () => { preserveScrollWhile(() => { resetPageNumber('results'); renderResultsCards(); }); });
  const rm = document.getElementById('filter-result-mapel'); if (rm) rm.addEventListener('change', () => { preserveScrollWhile(() => { resetPageNumber('results'); renderResultsCards(); }); });
  const rsort = document.getElementById('filter-result-sort'); if (rsort) rsort.addEventListener('change', () => { preserveScrollWhile(() => { resetPageNumber('results'); renderResultsCards(); }); });
  const rp = document.getElementById('result-page-size'); if (rp) rp.addEventListener('change', () => { preserveScrollWhile(() => { resetPageNumber('results'); renderResultsCards(); }); });
  const fb = document.getElementById('filter-banksoal-packet'); if (fb) fb.addEventListener('change', () => { preserveScrollWhile(() => { resetPageNumber('banksoal'); renderBankSoalQuestionList(); }); });
  const sq = document.getElementById('search-banksoal-question'); if (sq) sq.addEventListener('input', debouncedRenderBankSoal);
  const bps = document.getElementById('banksoal-page-size'); if (bps) bps.addEventListener('change', () => { preserveScrollWhile(() => { resetPageNumber('banksoal'); renderBankSoalQuestionList(); }); });

  const sdm = document.getElementById('search-dashboard-mapel'); if (sdm) sdm.addEventListener('input', debouncedRenderDashboard);

  const fdk = document.getElementById('filter-dashboard-kelas'); if (fdk) fdk.addEventListener('change', () => { preserveScrollWhile(() => { resetPageNumber('dashboard'); renderDashboardActiveExamsTable(); }); });
  const dps = document.getElementById('dashboard-page-size'); if (dps) dps.addEventListener('change', () => { preserveScrollWhile(() => { resetPageNumber('dashboard'); renderDashboardActiveExamsTable(); }); });

  safeAdd('btn-header-profile', 'click', (e) => {
    e.stopPropagation();
    const dd = document.getElementById('header-profile-dropdown');
    if (dd) dd.classList.toggle('hidden');
  });
  document.addEventListener('click', () => {
    const dd = document.getElementById('header-profile-dropdown');
    if (dd) dd.classList.add('hidden');
  });
  safeAdd('btn-profile-change-password', 'click', () => {
    if (CURRENT_USER && CURRENT_USER.role === 'admin') {
      triggerEditAdmin(CURRENT_USER.username);
    }
  });
  safeAdd('btn-profile-logout', 'click', handleLogout);
}

function handleLogout() {
  mySessionStorage.removeItem('cbt-session');
  stopAdminRealtimeListeners();
  CURRENT_USER = null;
  window.location.href = 'index.html';
}

function initDatabaseConfigUI() {
  const urlInput = document.getElementById('db-supabase-url');
  const keyInput = document.getElementById('db-supabase-key');
  const statusSpan = document.getElementById('db-config-status');
  if (!urlInput || !keyInput) return;

  const activeUrl = window.supabaseUrl || '';
  const activeKey = window.supabaseKey || '';
  const defaultUrl = (window.__ARCBT_CONFIG__ || {}).supabaseUrl || '';
  const defaultKey = (window.__ARCBT_CONFIG__ || {}).supabaseKey || '';

  urlInput.value = activeUrl;
  keyInput.value = activeKey;

  if (activeUrl && activeKey && (activeUrl !== defaultUrl || activeKey !== defaultKey)) {
    statusSpan.className = 'text-amber-600 dark:text-amber-400 font-bold';
    statusSpan.textContent = 'Menggunakan konfigurasi kustom (tersimpan di database)';
  } else {
    statusSpan.className = 'text-emerald-600 dark:text-emerald-400 font-bold';
    statusSpan.textContent = 'Default bawaan aplikasi (tersimpan di database)';
  }
}

async function testDatabaseConnection() {
  const url = document.getElementById('db-supabase-url')?.value?.trim();
  const key = document.getElementById('db-supabase-key')?.value?.trim();
  if (!url || !key) {
    showNotification('Peringatan', 'URL dan Anon Key tidak boleh kosong!', 'warning');
    return;
  }

  toggleLoader(true, 'Menguji koneksi database...');
  try {
    const client = (window.supabase || supabase).createClient(url, key);
    const { data, error } = await client.from('Pengaturan').select('id').limit(1);
    if (error) throw error;
    showNotification('Sukses', 'Koneksi berhasil! Supabase terhubung dengan baik.', 'success');
  } catch (err) {
    showNotification('Gagal Koneksi', err.message || 'Gagal terhubung ke database.', 'danger');
  } finally {
    toggleLoader(false);
  }
}

async function resetDatabaseConfig() {
  showConfirmation('Reset Database', 'Apakah Anda yakin ingin mengembalikan konfigurasi database ke default bawaan aplikasi?', async () => {
    myLocalStorage.removeItem('cbt_supabase_url');
    myLocalStorage.removeItem('cbt_supabase_key');

    toggleLoader(true, 'Mereset konfigurasi database...');
    try {
      const currentSettings = readAppSettingsFromLocal();
      currentSettings.supabaseUrl = '';
      currentSettings.supabaseKey = '';
      await saveAppSettingsToCloud(currentSettings);
      appSettingsToLocalKeys(currentSettings);

      showNotification('Sukses', 'Konfigurasi database di-reset ke default. Halaman akan dimuat ulang...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      showNotification('Gagal', err.message || 'Gagal mereset pengaturan di cloud.', 'danger');
    } finally {
      toggleLoader(false);
    }
  }, 'refresh-cw');
}

async function saveDatabaseConfigToCloud() {
  const url = document.getElementById('db-supabase-url')?.value?.trim();
  const key = document.getElementById('db-supabase-key')?.value?.trim();
  if (!url || !key) {
    showNotification('Peringatan', 'URL dan Anon Key tidak boleh kosong!', 'warning');
    return;
  }

  showConfirmation('Simpan Konfigurasi', 'Apakah Anda yakin ingin menyimpan dan memperbarui konfigurasi database di cloud? Semua perangkat admin dan siswa akan menggunakan database baru ini.', async () => {
    toggleLoader(true, 'Menyimpan konfigurasi database...');
    try {

      const currentSettings = readAppSettingsFromLocal();
      currentSettings.supabaseUrl = url;
      currentSettings.supabaseKey = key;
      await saveAppSettingsToCloud(currentSettings);
      appSettingsToLocalKeys(currentSettings);

      myLocalStorage.removeItem('cbt_supabase_url');
      myLocalStorage.removeItem('cbt_supabase_key');

      showNotification('Sukses', 'Konfigurasi database berhasil diperbarui! Halaman akan dimuat ulang...', 'success');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err) {
      showNotification('Gagal', err.message || 'Gagal menyimpan konfigurasi.', 'danger');
    } finally {
      toggleLoader(false);
    }
  }, 'save');
}

window.testDatabaseConnection = testDatabaseConnection;
window.resetDatabaseConfig = resetDatabaseConfig;
window.saveDatabaseConfigToCloud = saveDatabaseConfigToCloud;

if (typeof renderResultsCards === 'function') window.renderResultsCards = renderResultsCards;
if (typeof renderActiveMonitorList === 'function') window.renderActiveMonitorList = renderActiveMonitorList;
if (typeof renderStudentsCards === 'function') window.renderStudentsCards = renderStudentsCards;
if (typeof renderSchedules === 'function') window.renderSchedules = renderSchedules;
if (typeof renderPacketsCards === 'function') window.renderPacketsCards = renderPacketsCards;
if (typeof renderBankSoalQuestionList === 'function') window.renderBankSoalQuestionList = renderBankSoalQuestionList;
if (typeof renderDashboardActiveExamsTable === 'function') window.renderDashboardActiveExamsTable = renderDashboardActiveExamsTable;
if (typeof renderAdminsCards === 'function') window.renderAdminsCards = renderAdminsCards;
if (typeof refreshCachedDashboardStats === 'function') window.refreshCachedDashboardStats = refreshCachedDashboardStats;
if (typeof updateAdminTokenBars === 'function') window.updateAdminTokenBars = updateAdminTokenBars;
if (typeof updateClassSelectors === 'function') window.updateClassSelectors = updateClassSelectors;
if (typeof refreshResultMapelDropdown === 'function') window.refreshResultMapelDropdown = refreshResultMapelDropdown;
if (typeof refreshBankSoalDropdowns === 'function') window.refreshBankSoalDropdowns = refreshBankSoalDropdowns;

window.addEventListener('DOMContentLoaded', async () => {
  if (typeof safeCreateIcons === 'function') safeCreateIcons();
  setupInteractiveListeners();

  if (typeof applyTheme === 'function') applyTheme();
  initAppSettingsElements();
  try {
    if (typeof initAppSettings === 'function') await initAppSettings();
  } catch (err) {
    console.warn('initAppSettings failed', err);
  }
  renderAppSettingsUI();
  initDatabaseConfigUI();
  refreshAppSettingsFromCloud();
  initAdminHeaderAutoFit();
  initAdminSelectionGuard();
  initAdminPortraitRenderGuard();
  startAppSettingsListener(debouncedRefreshAppSettingsFromCloud);
  window.addEventListener('storage', () => debouncedRefreshAppSettingsFromCloud());
  window.addEventListener('focus', () => {
    debouncedRefreshAppSettingsFromCloud();
    if (CURRENT_ADMIN_VIEW === 'admin-results') refreshResultsFromDatabase();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      debouncedRefreshAppSettingsFromCloud();
      if (CURRENT_ADMIN_VIEW === 'admin-results') refreshResultsFromDatabase();
    }
  });
  toggleLoader(true, 'MENGHUBUNGKAN...');
  try {
    firebaseUser = await initAuth();
    checkSavedSession();
  } catch (err) {
    showNotification('Koneksi Gagal', 'Gagal menghubungi server.', 'danger');
  } finally {
    toggleLoader(false);
  }
});
