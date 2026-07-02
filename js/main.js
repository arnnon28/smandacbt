import { getFirestore, doc, setDoc, getDoc, getDocs, collection, query, where, writeBatch, deleteDoc, onSnapshot, orderBy } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { myLocalStorage, mySessionStorage, initAuth, initAdminAccount, getPublicCollection, getPublicDoc, db } from "./auth.js";
import { showNotification, showConfirmation, toggleLoader } from "./ui.js";

let firebaseUser = null, CURRENT_USER = null;
let ALL_STUDENTS = [], ALL_PACKETS = [], ALL_SCHEDULES = [], ALL_RESULTS = [], ACTIVE_MONITOR_DATA = [], ALL_ADMINS = [];
let EXAM_STATE = { packet: null, schedule: null, currentIndex: 0, answers: {}, doubts: {}, scrambledQuestions: [], scrambledOptions: {}, timeRemaining: 0, timerInterval: null, cheatTabCount: 0, cheatFocusCount: 0 };
let CACHE_AGGREGATIONS = { timestamp: 0, data: { totalSiswa: 0, totalKelas: 0, totalPaket: 0, totalJadwal: 0, sedangUjian: 0, sudahSubmit: 0 } };
let unsubscribeStudents = null, unsubscribeSchedules = null, unsubscribeMonitor = null, unsubscribeResults = null, unsubscribePackets = null, unsubscribeAdmins = null;
let sidebarCollapsed = false;
let PAGINATION_STATE = { students: 1, monitor: 1, banksoal: 1, results: 1, dashboard: 1 };

// Bind ke window untuk sistem pemicu sebaris
window.showNotification = showNotification; window.showConfirmation = showConfirmation;

    window.addEventListener('DOMContentLoaded', async () => {
      lucide.createIcons(); initRealtimeClock(); setupInteractiveListeners(); applyTheme();
      toggleLoader(true, "MENGHUBUNGKAN...");
      try { firebaseUser = await initAuth(); await initAdminAccount(); checkSavedSession(); } catch (err) { showNotification("Koneksi Gagal", "Gagal menghubungi server.", "danger"); } finally { toggleLoader(false); }
    });

    function initRealtimeClock() {
      setInterval(() => {
        const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const c1=document.getElementById('digital-clock-auth'), c2=document.getElementById('digital-clock-main');
        if(c1) c1.innerText = timeStr; if(c2) c2.innerText = timeStr;
      }, 1000);
    }

    // Mesin Pengubah Tema
    function applyTheme() { if (myLocalStorage.getItem('cbt-dark-mode') === 'true') document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark'); }
    function toggleTheme() { myLocalStorage.setItem('cbt-dark-mode', document.documentElement.classList.toggle('dark')); }

    window.switchView = function(viewId) {
      document.querySelectorAll('.page-view').forEach(view => view.classList.add('hidden'));
      const activePage = document.getElementById(`view-${viewId}`);
      if (activePage) activePage.classList.remove('hidden');

      document.querySelectorAll('.nav-btn').forEach(btn => {
        const isMobileNav = btn.closest('#mobile-admin-nav');
        if (btn.getAttribute('data-nav') === viewId) {
          if (isMobileNav) btn.className = "nav-btn p-1.5 flex flex-col items-center gap-0.5 text-accent font-bold shrink-0";
          else btn.className = `nav-btn w-full flex items-center gap-3 py-2.5 rounded-xl bg-white/10 text-white font-bold mx-auto ${sidebarCollapsed ? 'justify-center px-0' : 'px-4'}`;
        } else {
          if (isMobileNav) btn.className = "nav-btn p-1.5 flex flex-col items-center gap-0.5 text-slate-400 hover:text-white shrink-0";
          else btn.className = `nav-btn w-full flex items-center gap-3 py-2.5 rounded-xl hover:bg-white/5 text-slate-300 mx-auto ${sidebarCollapsed ? 'justify-center px-0' : 'px-4'}`;
        }
      });
      const safeViewId = viewId || '';
      const subtitle = document.getElementById('system-subtitle'); if (subtitle) subtitle.innerText = `PANEL UTAMA • ${safeViewId.toUpperCase().replace('ADMIN-', '')}`;
      toggleMobileSheet(false);
    }

    function toggleLoader(show, text = "MENGOLAH...") {
      const loader = document.getElementById('global-spinner');
      if (!loader) return;
      if (show) { 
         const txtEl = document.getElementById('global-spinner-text');
         if(txtEl) txtEl.innerText = text; 
         loader.classList.remove('hidden'); 
      } else { 
         loader.classList.add('hidden'); 
      }
    }

    function checkSavedSession() {
      const sessionStr = mySessionStorage.getItem('cbt-session');
      if (!sessionStr) {
        document.getElementById('auth-view').classList.remove('hidden');
        document.getElementById('main-system-view').classList.add('hidden');
        return;
      }

      try {
        setupSessionEnvironment(JSON.parse(sessionStr));
      } catch (err) {
        mySessionStorage.removeItem('cbt-session');
        document.getElementById('auth-view').classList.remove('hidden');
        document.getElementById('main-system-view').classList.add('hidden');
      }
    }

    function setupSessionEnvironment(user) {
      CURRENT_USER = user; document.getElementById('auth-view').classList.add('hidden'); document.getElementById('main-system-view').classList.remove('hidden');
      const studentNavBtn = document.getElementById('btn-mobile-nav');
      if (user.role === 'admin') {
        document.getElementById('admin-nav-links').classList.remove('hidden'); document.getElementById('student-nav-links').classList.add('hidden'); document.getElementById('admin-active-session-bar').classList.remove('hidden');
        const mobNav = document.getElementById('mobile-admin-nav'); if (mobNav) { mobNav.classList.remove('hidden'); mobNav.classList.add('flex', 'md:hidden'); }
        if (studentNavBtn) studentNavBtn.classList.add('hidden');
        switchView('admin-dashboard'); startRealtimeAdminListeners();
      } else {
        document.getElementById('admin-nav-links').classList.add('hidden'); document.getElementById('student-nav-links').classList.remove('hidden'); document.getElementById('admin-active-session-bar').classList.add('hidden');
        const mobNav = document.getElementById('mobile-admin-nav'); if (mobNav) mobNav.classList.add('hidden');
        if (studentNavBtn) studentNavBtn.classList.remove('hidden');
        initStudentExamView();
      }
    }

    function startAntiCheatEngines() {
      EXAM_STATE.cheatTabCount = 0; EXAM_STATE.cheatFocusCount = 0;
      document.addEventListener('contextmenu', blockEvent); document.addEventListener('keydown', blockInspections);
      window.onblur = () => {
        if (!CURRENT_USER || CURRENT_USER.role === 'admin') return;
        EXAM_STATE.cheatTabCount++; syncStudentActiveProgress();
        if (EXAM_STATE.cheatTabCount >= 3) { showNotification("Curang Terdeteksi", "Ujian otomatis dikirim.", "danger"); autoSubmitExam("Keluar Layar/Tab"); }
        else showNotification("Peringatan", `Jangan keluar halaman! (${EXAM_STATE.cheatTabCount}/3)`, "danger");
      };
      document.addEventListener('fullscreenchange', handleFullscreenChange);
    }
    function stopAntiCheatEngines() { document.removeEventListener('contextmenu', blockEvent); document.removeEventListener('keydown', blockInspections); window.onblur = null; document.removeEventListener('fullscreenchange', handleFullscreenChange); }
    function blockEvent(e) { e.preventDefault(); }
    function blockInspections(e) { if (e.keyCode === 123 || (e.ctrlKey && e.shiftKey && (e.keyCode === 73 || e.keyCode === 74)) || (e.ctrlKey && e.keyCode === 85)) { e.preventDefault(); return false; } }

    function handleFullscreenChange() {
      if (!document.fullscreenElement && CURRENT_USER && CURRENT_USER.role !== 'admin') {
        EXAM_STATE.cheatFocusCount++; syncStudentActiveProgress();
        if (EXAM_STATE.cheatFocusCount >= 3) autoSubmitExam("Keluar Mode Layar Penuh");
        else { showNotification("Fokus", `Wajib Fullscreen. (${EXAM_STATE.cheatFocusCount}/3)`, "danger"); requestFullscreenMode(); }
      }
    }
    function requestFullscreenMode() { try { const e = document.documentElement; if (e.requestFullscreen) e.requestFullscreen(); else if (e.webkitRequestFullscreen) e.webkitRequestFullscreen(); } catch (err) { console.warn('requestFullscreenMode failed', err); } }

    async function handleStudentLogin(e) {
      e.preventDefault(); if (!firebaseUser) return;
      const nisEl = document.getElementById('login-nis');
      const pwEl = document.getElementById('login-password');
      const tokenEl = document.getElementById('login-token');
      const eb = document.getElementById('auth-error-banner');
      const et = document.getElementById('auth-error-message');
      if (!nisEl || !pwEl || !tokenEl || !eb || !et) return;
      const nis = nisEl.value.trim();
      const password = pwEl.value;
      const token = tokenEl.value.trim().toUpperCase();
      if (!nis || !password || !token) {
        et.innerText = "NIS, password, dan token harus diisi.";
        eb.classList.remove('hidden');
        return;
      }
      eb.classList.add('hidden'); toggleLoader(true, "MEMVERIFIKASI...");
      try {
        const schSnap = await getDocs(getPublicCollection("Jadwal Ujian")); const schD = schSnap.docs.find(d => d.data().token === token);
        if (!schD) throw new Error("Token tidak valid.");
        const sch = schD.data(), stSnap = await getDoc(getPublicDoc("Siswa", nis));
        if (!stSnap.exists()) throw new Error("NIS tidak terdaftar.");
        const st = stSnap.data();
        if (st.password !== password) throw new Error("Password salah.");
        if (!sch.kelas_terpilih.includes(st.kelas)) throw new Error("Kelas tidak terdaftar di sesi ini.");
        const ans = await getDoc(getPublicDoc("Jawaban Siswa", `${schD.id}_${nis}`));
        if (ans.exists() && ans.data().status === 'Selesai') throw new Error("Ujian telah diselesaikan.");
        const ses = await getDoc(getPublicDoc("Session Ujian", `${schD.id}_${nis}`));
        if (ses.exists()) throw new Error("Sesi aktif di komputer lain. Minta proktor mereset sesi.");

        const pktDoc = await getDoc(getPublicDoc("Bank Soal", sch.id_paket));
        const totalSoal = pktDoc.exists() ? (pktDoc.data().daftar_soal?.length || 0) : 0;
        await setDoc(getPublicDoc("Session Ujian", `${schD.id}_${nis}`), {
          id: `${schD.id}_${nis}`,
          nis,
          token,
          mulai_ujian: new Date().toISOString(),
          progress_total: 0,
          total_soal: totalSoal
        });
        const userObj = { nis: st.nis, nama: st.nama, kelas: st.kelas, role: 'student', activeScheduleId: schD.id, activePacketId: sch.id_paket, token };
        mySessionStorage.setItem('cbt-session', JSON.stringify(userObj)); setupSessionEnvironment(userObj);
      } catch (err) { et.innerText = err.message; eb.classList.remove('hidden'); } finally { toggleLoader(false); }
    }

    async function handleAdminLogin(e) {
      e.preventDefault(); if (!firebaseUser) return;
      const userEl = document.getElementById('admin-username');
      const passEl = document.getElementById('admin-password');
      const eb = document.getElementById('admin-error-banner');
      const et = document.getElementById('admin-error-message');
      if (!userEl || !passEl || !eb || !et) return;
      const user = userEl.value.trim();
      const pass = passEl.value;
      if (!user || !pass) {
        et.innerText = "Username dan password admin harus diisi.";
        eb.classList.remove('hidden');
        return;
      }
      eb.classList.add('hidden'); toggleLoader(true, "AUTENTIKASI...");
      try {
        const as = await getDoc(getPublicDoc("Admin", user));
        if (as.exists() && as.data().password === pass) {
          const adminObj = { username: user, role: 'admin' };
          mySessionStorage.setItem('cbt-session', JSON.stringify(adminObj)); document.getElementById('admin-auth-modal').classList.add('hidden'); setupSessionEnvironment(adminObj);
        } else throw new Error("Kredensial Salah.");
      } catch (err) { et.innerText = err.message; eb.classList.remove('hidden'); } finally { toggleLoader(false); }
    }

    function startRealtimeAdminListeners() {
      if (!firebaseUser) return; toggleLoader(true, "SINKRONISASI...");
      unsubscribeStudents = onSnapshot(getPublicCollection("Siswa"), (s) => { ALL_STUDENTS = []; s.forEach(d => ALL_STUDENTS.push(d.data())); renderStudentsCards(); updateClassSelectors(); refreshCachedDashboardStats(); });
      unsubscribeSchedules = onSnapshot(getPublicCollection("Jadwal Ujian"), (s) => { ALL_SCHEDULES = []; s.forEach(d => ALL_SCHEDULES.push(d.data())); renderSchedules(); updateAdminTokenBars(); refreshCachedDashboardStats(); renderDashboardActiveExamsTable(); });
      unsubscribeMonitor = onSnapshot(getPublicCollection("Session Ujian"), (s) => { ACTIVE_MONITOR_DATA = []; s.forEach(d => ACTIVE_MONITOR_DATA.push(d.data())); renderActiveMonitorList(); refreshCachedDashboardStats(); });
      unsubscribeResults = onSnapshot(getPublicCollection("Jawaban Siswa"), (s) => { ALL_RESULTS = []; s.forEach(d => ALL_RESULTS.push(d.data())); renderResultsCards(); renderActiveMonitorList(); refreshCachedDashboardStats(); });
      unsubscribeAdmins = onSnapshot(getPublicCollection("Admin"), (s) => { ALL_ADMINS = []; s.forEach(d => ALL_ADMINS.push(d.data())); renderAdminsCards(); });
      unsubscribePackets = onSnapshot(getPublicCollection("Bank Soal"), (s) => { ALL_PACKETS = []; s.forEach(d => ALL_PACKETS.push(d.data())); renderPacketsCards(); refreshBankSoalDropdowns(); refreshCachedDashboardStats(); renderDashboardActiveExamsTable(); toggleLoader(false); }, () => toggleLoader(false));
    }

    function stopAdminRealtimeListeners() {
      if (unsubscribeStudents) unsubscribeStudents(); if (unsubscribeSchedules) unsubscribeSchedules(); if (unsubscribeMonitor) unsubscribeMonitor(); if (unsubscribeResults) unsubscribeResults(); if (unsubscribePackets) unsubscribePackets(); if (unsubscribeAdmins) unsubscribeAdmins();
    }

    async function refreshCachedDashboardStats(force = false) {
      const textSelector = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
      const now = Date.now(); if (!force && (now - CACHE_AGGREGATIONS.timestamp < 60000)) { applyDashboardStatsUI(CACHE_AGGREGATIONS.data); return; }
      const stats = { totalSiswa: ALL_STUDENTS.length, totalKelas: new Set(ALL_STUDENTS.map(s => s.kelas)).size, totalPaket: ALL_PACKETS.length, totalJadwal: ALL_SCHEDULES.length, sedangUjian: ACTIVE_MONITOR_DATA.length, sudahSubmit: ALL_RESULTS.filter(r => r.status === 'Selesai').length };
      CACHE_AGGREGATIONS.timestamp = now; CACHE_AGGREGATIONS.data = stats; applyDashboardStatsUI(stats);
    }

    function askRefreshDatabase() {
      showConfirmation('Peringatan Keras', `Tindakan ini akan memuat ulang <strong>SEMUA</strong> data terbaru dari database.<br><br><strong>Langkah 1:</strong> Klik Lanjutkan untuk memastikan Anda paham risiko.`, () => {
        showConfirmation('Konfirmasi Keamanan 2', `Langkah 2: Ketik <strong>REFRESH</strong> pada kolom di bawah untuk melanjutkan operasi ini.<br><br><input id="refresh-confirm-code" placeholder="KETIK REFRESH" class="w-full mt-3 p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100" />`, async () => {
          const code = document.getElementById('refresh-confirm-code')?.value?.trim();
          if (code !== 'REFRESH') {
            showNotification('Dibatalkan', 'Kode konfirmasi tidak cocok. Operasi dibatalkan.', 'danger');
            return;
          }
          await handleRefreshDatabase();
        }, 'alert-triangle');
      }, 'alert-triangle');
    }

    async function handleRefreshDatabase() {
      if (!firebaseUser) return;
      toggleLoader(true, 'Memuat ulang semua data terbaru dari database...');
      try {
        const [siswaSnap, jadwalSnap, monitorSnap, resultsSnap, bankSoalSnap, adminSnap] = await Promise.all([
          getDocs(getPublicCollection('Siswa')),
          getDocs(getPublicCollection('Jadwal Ujian')),
          getDocs(getPublicCollection('Session Ujian')),
          getDocs(getPublicCollection('Jawaban Siswa')),
          getDocs(getPublicCollection('Bank Soal')),
          getDocs(getPublicCollection('Admin'))
        ]);
        ALL_STUDENTS = []; siswaSnap.docs.forEach(d => ALL_STUDENTS.push(d.data()));
        ALL_SCHEDULES = []; jadwalSnap.docs.forEach(d => ALL_SCHEDULES.push(d.data()));
        ACTIVE_MONITOR_DATA = []; monitorSnap.docs.forEach(d => ACTIVE_MONITOR_DATA.push(d.data()));
        ALL_RESULTS = []; resultsSnap.docs.forEach(d => ALL_RESULTS.push(d.data()));
        ALL_PACKETS = []; bankSoalSnap.docs.forEach(d => ALL_PACKETS.push(d.data()));
        ALL_ADMINS = []; adminSnap.docs.forEach(d => ALL_ADMINS.push(d.data()));
        renderStudentsCards(); updateClassSelectors(); renderSchedules(); updateAdminTokenBars(); renderActiveMonitorList(); renderResultsCards(); renderPacketsCards(); refreshBankSoalDropdowns(); refreshCachedDashboardStats(true); renderDashboardActiveExamsTable(); renderAdminsCards();
        showNotification('OK', 'Semua data terbaru berhasil dimuat.', 'success');
      } catch (err) {
        showNotification('Gagal', err.message || 'Gagal memuat data.', 'danger');
      } finally {
        toggleLoader(false);
      }
    }

    function applyDashboardStatsUI(s) {
      const e = (id, v) => { const el=document.getElementById(id); if(el) el.innerText=v; };
      e('stat-total-siswa', s.totalSiswa); e('stat-total-kelas', s.totalKelas); e('stat-total-paket', s.totalPaket); e('stat-total-jadwal', s.totalJadwal); e('stat-sedang-ujian', s.sedangUjian); e('stat-sudah-submit', s.sudahSubmit);
    }

    function updateClassSelectors() {
      const u = [...new Set(ALL_STUDENTS.map(s => s.kelas))].sort(sortClassStrings);
      ['filter-monitor-kelas', 'filter-student-class', 'filter-result-kelas', 'filter-dashboard-kelas'].forEach(id => { const s = document.getElementById(id); if (s) { const v = s.value; s.innerHTML = `<option value="">Semua Kelas</option>` + u.map(c => `<option value="${c}">${c}</option>`).join(''); s.value = v; } });
      refreshBankSoalDropdowns();
    }

    function updateAdminTokenBars() {
      const todayStr = new Date().toLocaleDateString('en-CA'); // Format: YYYY-MM-DD
      const todaySchedules = ALL_SCHEDULES.filter(s => s.mulai && s.mulai.startsWith(todayStr));
      const targetSchedules = todaySchedules.length > 0 ? todaySchedules : ALL_SCHEDULES;

      // regex cerdas mendukung "XII MIPA 1", "XI IPS 1", "X-1" dan "10 IPA" dengan batas kata
      const g = (regex) => targetSchedules.find(s => s.kelas_terpilih && s.kelas_terpilih.some(c => regex.test(c)));
      const x = g(/^(X\b|10\b)/i);
      const xi = g(/^(XI\b|11\b)/i);
      const xii = g(/^(XII\b|12\b)/i);
      
      const d = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
      d('token-display-x', x ? x.token : '-----');
      d('token-display-xi', xi ? xi.token : '-----');
      d('token-display-xii', xii ? xii.token : '-----');

      // Terapkan kuncian visual pada tombol generate token bila sudah dijalankan di sesi ini
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

    function renderStudentsCards() {
      const tbody = document.getElementById('students-table-body'); 
      if (!tbody) return;
      const sv = (document.getElementById('search-student')?.value || '').toLowerCase();
      const cf = document.getElementById('filter-student-class')?.value || '';
      
      tbody.innerHTML = ""; 
      const f = ALL_STUDENTS.filter(s => {
        const nis = String(s.nis || '').toLowerCase();
        const nama = String(s.nama || '').toLowerCase();
        return (nis.includes(sv) || nama.includes(sv)) && (!cf || s.kelas === cf);
      }).sort((a, b) => {
        const kelasComp = String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id');
        if (kelasComp !== 0) return kelasComp;
        return String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
      });
      const disp = document.getElementById('student-count-display'); if(disp) disp.innerText = f.length;
      
      if (!f.length) { 
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400 font-bold text-xs">Data siswa tidak ditemukan</td></tr>`; 
        return; 
      }
      
      f.forEach((s, index) => {
        tbody.innerHTML += `
          <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors border-b border-slate-100 dark:border-slate-800/80">
            <td class="py-3 px-4 font-bold text-slate-500 text-center">${index + 1}</td>
            <td class="py-3 px-4 font-semibold text-slate-500 dark:text-slate-400 monospace tracking-wide">${s.nis}</td>
            <td class="py-3 px-4 font-extrabold text-slate-700 dark:text-slate-100">${s.nama}</td>
            <td class="py-3 px-4 font-bold text-primary dark:text-accent">${s.kelas}</td>
            <td class="py-3 px-4 font-semibold text-slate-500 dark:text-slate-400 monospace">
              <div class="flex items-center gap-2">
                <span id="pwd-text-${s.nis}">â€¢â€¢â€¢â€¢â€¢â€¢</span>
                <span id="pwd-val-${s.nis}" class="hidden">${s.password}</span>
                <button onclick="toggleStudentPassword('${s.nis}')" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition" title="Lihat/Sembunyikan Password">
                  <i data-lucide="eye" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
                </button>
              </div>
            </td>
            <td class="py-3 px-4 text-right">
              <div class="flex justify-end gap-1.5">
                <button onclick="triggerEditStudent('${s.nis}')" class="p-1.5 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded-lg transition" title="Edit Siswa">
                  <i data-lucide="edit" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
                </button>
                <button onclick="triggerStudentDelete('${s.nis}')" class="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition" title="Hapus Siswa">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      }); 
      lucide.createIcons();
    }

    window.toggleStudentPassword = function(nis) {
      const textSpan = document.getElementById(`pwd-text-${nis}`);
      const valSpan = document.getElementById(`pwd-val-${nis}`);
      if (textSpan && valSpan) {
        if (textSpan.classList.contains('hidden')) {
          textSpan.classList.remove('hidden');
          valSpan.classList.add('hidden');
        } else {
          textSpan.classList.add('hidden');
          valSpan.classList.remove('hidden');
        }
      }
    };

    window.triggerEditStudent = function(nis) {
      if (!firebaseUser) return;
      const student = ALL_STUDENTS.find(s => s.nis === nis);
      if (!student) return;

      showConfirmation("Edit Data Siswa", `
        <div class="space-y-2 text-xs text-left text-slate-800 dark:text-slate-100">
          <label class="font-bold text-slate-400 uppercase tracking-wider block">NIS</label>
          <input id="e-n" value="${student.nis}" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50">
          
          <label class="font-bold text-slate-400 uppercase tracking-wider block mt-2">Nama Siswa</label>
          <input id="e-nm" value="${student.nama}" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50">
          
          <label class="font-bold text-slate-400 uppercase tracking-wider block mt-2">Kelas</label>
          <input id="e-k" value="${student.kelas}" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50">
          
          <label class="font-bold text-slate-400 uppercase tracking-wider block mt-2">Password</label>
          <div class="relative">
            <input type="password" id="e-p" value="${student.password}" class="w-full p-2 pr-10 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50">
            <button type="button" onclick="const p = document.getElementById('e-p'); p.type = p.type === 'password' ? 'text' : 'password'; this.querySelector('i').classList.toggle('fa-eye'); this.querySelector('i').classList.toggle('fa-eye-slash');" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <i class="fas fa-eye"></i>
            </button>
          </div>
        </div>
      `, async () => {
        const newNis = document.getElementById('e-n').value.trim();
        const nm = document.getElementById('e-nm').value.trim();
        const k = document.getElementById('e-k').value.trim();
        const p = document.getElementById('e-p').value.trim();

        if (!newNis || !nm || !k || !p) {
          showNotification("Input Gagal", "Semua kolom wajib diisi!", "danger");
          return;
        }

        if (newNis !== nis && ALL_STUDENTS.some(s => s.nis === newNis)) {
          showNotification("Input Gagal", "NIS sudah terdaftar!", "danger");
          return;
        }

        toggleLoader(true, "Mengupdate Siswa...");
        try {
          const updatedStudent = {
            nis: newNis,
            nama: nm,
            kelas: k,
            password: p
          };
          if (newNis !== nis) {
            await deleteDoc(getPublicDoc("Siswa", nis));
          }
          await setDoc(getPublicDoc("Siswa", newNis), updatedStudent);
          const idx = ALL_STUDENTS.findIndex(s => s.nis === nis);
          if (idx >= 0) {
            if (newNis !== nis) {
              ALL_STUDENTS.splice(idx, 1);
              ALL_STUDENTS.push(updatedStudent);
            } else {
              ALL_STUDENTS[idx] = updatedStudent;
            }
          }
          renderStudentsCards();
          updateClassSelectors();
          showNotification("Sukses", "Data siswa berhasil diperbarui!", "success");
        } catch (e) {
          showNotification("Gagal", e.message, "danger");
        } finally {
          toggleLoader(false);
        }
      });
    };

    function renderActiveMonitorList() {
      const c = document.getElementById('monitoring-list-container'); if (!c) return;
      const sv = (document.getElementById('filter-monitor-search')?.value || '').toLowerCase();
      const cf = document.getElementById('filter-monitor-kelas')?.value || '';
      const sf = document.getElementById('filter-monitor-status')?.value || '';
      c.innerHTML = ""; 
      const f = ACTIVE_MONITOR_DATA.map(ss => ({ ...ss, prof: ALL_STUDENTS.find(s => s.nis === ss.nis) || { nama: "Unknown", kelas: "-" } }))
      .filter(ss => {
        const nis = String(ss.nis || '').toLowerCase();
        const nama = String(ss.prof.nama || '').toLowerCase();
        return (nis.includes(sv) || nama.includes(sv)) && (!cf || ss.prof.kelas === cf) && (!sf || (sf==='curang'?ss.cheat_detected:!ss.cheat_detected));
      });
      
      if (!f.length) { 
        c.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-400 font-bold text-xs">Tidak ada data pengerjaan siswa yang sedang aktif</td></tr>`; 
        return; 
      }
      
      f.forEach(ss => {
        const statusText = ss.cheat_detected ? 'KELUAR' : 'ONLINE';
        const statusClass = ss.cheat_detected ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
        const timeStr = new Date(ss.mulai_ujian).toLocaleTimeString('id-ID');
        const activeResult = ALL_RESULTS.find(r => r.id === ss.id && r.status === 'Proses');
        const progressText = formatMonitorProgress(ss, ALL_SCHEDULES, ALL_PACKETS, activeResult);
        const liveScore = calculateMonitorScore(ss, activeResult, ALL_SCHEDULES, ALL_PACKETS);
        
        c.innerHTML += `
          <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors border-b border-slate-100 dark:border-slate-800/80">
            <td class="py-3 px-4 font-semibold text-slate-500 dark:text-slate-400 monospace">${ss.nis}</td>
            <td class="py-3 px-4 font-extrabold text-slate-700 dark:text-slate-100">${ss.prof.nama}</td>
            <td class="py-3 px-4 font-bold text-primary dark:text-accent">${ss.prof.kelas}</td>
            <td class="py-3 px-4 font-semibold text-slate-500 dark:text-slate-400 monospace">${timeStr}</td>
            <td class="py-3 px-4 font-bold text-slate-700 dark:text-slate-200">${progressText}</td>
            <td class="py-3 px-4 font-black text-slate-750 dark:text-slate-200 monospace">${liveScore}</td>
            <td class="py-3 px-4">
              <span class="text-[8px] sm:text-[10px] uppercase tracking-wide border px-2.5 py-0.5 rounded-full font-bold ${statusClass}">
                ${statusText}
              </span>
            </td>
            <td class="py-3 px-4 text-right">
              <button onclick="triggerResetIndividu('${ss.id}')" class="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[9px] sm:text-[10px] font-bold rounded-lg shadow-sm transition">
                Reset Ujian
              </button>
            </td>
          </tr>
        `;
      }); 
      lucide.createIcons();
    }

    function renderSchedules() {
      const c = document.getElementById('schedules-table-body');
      const wrapper = document.getElementById('schedules-container');
      if (!c || !wrapper) return;
      if (!ALL_SCHEDULES.length) {
        c.innerHTML = `
          <tr class="border-t border-slate-200 dark:border-slate-800">
            <td colspan="7" class="px-3 py-6 text-center text-slate-400 font-bold text-xs">Kosong</td>
          </tr>
        `;
        return;
      }
      c.innerHTML = '';
      const sortedSchedules = [...ALL_SCHEDULES].sort((a, b) => {
        const aMs = a.mulai ? new Date(a.mulai).getTime() : 0;
        const bMs = b.mulai ? new Date(b.mulai).getTime() : 0;
        return aMs - bMs;
      });
      sortedSchedules.forEach(sch => {
        const pName = ALL_PACKETS.find(p => p.id_paket === sch.id_paket)?.nama_paket || 'N/A';
        const kelasList = Array.isArray(sch.kelas_terpilih) ? sch.kelas_terpilih.join(', ') : (sch.kelas_terpilih || '-');
        let formattedDate = '-';
        if (sch.mulai) {
          const d = new Date(sch.mulai);
          const tgl = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
          const jam = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          formattedDate = `${tgl} • ${jam}`;
        }
        const startDate = new Date(sch.mulai);
        const endDate = new Date(startDate.getTime() + (Number(sch.durasi) || 0) * 60000);
        const dateLabel = startDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
        const startTime = startDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const endTime = endDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const timeLabel = `${startTime} - ${endTime}`;

        c.innerHTML += `
          <tr class="border-t border-slate-200 dark:border-slate-800">
            <td class="px-3 py-3 text-slate-600 dark:text-slate-300">${dateLabel}</td>
            <td class="px-3 py-3 text-slate-600 dark:text-slate-300">${timeLabel}</td>
            <td class="px-3 py-3 font-semibold text-slate-800 dark:text-slate-200">${sch.mapel}</td>
            <td class="px-3 py-3 text-slate-600 dark:text-slate-300 break-words">${kelasList}</td>
            <td class="px-3 py-3"><span class="inline-flex items-center px-2.5 py-1 rounded-full bg-accent text-white text-[9px] font-semibold">${sch.token}</span></td>
            <td class="px-3 py-3 text-slate-600 dark:text-slate-300">${sch.durasi} Menit</td>
            <td class="px-3 py-3 text-right">
              <button onclick="triggerDeleteSchedule('${sch.id}')" class="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[9px] sm:text-[10px] font-semibold">
                <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
              </button>
            </td>
          </tr>
        `;
      });
      lucide.createIcons();
    }

    function renderPacketsCards() {
      const c = document.getElementById('packets-cards-container'); if (!c) return; c.innerHTML = "";
      if (!ALL_PACKETS.length) {
        c.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400 font-bold text-xs">Kosong</td></tr>`;
        refreshBankSoalDropdowns();
        return;
      }
      ALL_PACKETS.forEach((pkt, idx) => {
        c.innerHTML += `<tr class="bg-white dark:bg-slate-900"><td class="px-3 py-3 text-slate-700 dark:text-slate-300">${idx+1}</td><td class="px-3 py-3 text-left text-slate-800 dark:text-slate-100">${pkt.nama_paket}</td><td class="px-3 py-3 text-slate-700 dark:text-slate-300">${pkt.daftar_soal ? pkt.daftar_soal.length : 0}</td><td class="px-3 py-3 text-center"><button onclick="triggerDeletePacket('${pkt.id_paket}')" class="px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl text-[9px] sm:text-[10px] font-semibold">Hapus</button></td></tr>`;
      });
      lucide.createIcons(); refreshBankSoalDropdowns();
    }

    function getBankSoalPacketById(id) { return ALL_PACKETS.find(p => p.id_paket === id); }
    function refreshBankSoalDropdowns() {
      const packetOptions = ALL_PACKETS.map(p => `<option value="${p.id_paket}">${p.nama_paket}</option>`).join('');
      const createSelect = document.getElementById('manual-question-packet');
      const viewSelect = document.getElementById('filter-banksoal-packet');
      if (createSelect) {
        const current = createSelect.value;
        createSelect.innerHTML = `<option value="">Pilih Soal</option><option value="__new__">--- Buat Soal Baru ---</option>` + packetOptions;
        createSelect.value = current || "";
        updateManualPacketMode();
      }
      if (viewSelect) { const current = viewSelect.value; viewSelect.innerHTML = `<option value="">Semua Soal</option>` + packetOptions; viewSelect.value = current || ""; }
    }

    function updateManualPacketMode() {
      const packetSelect = document.getElementById('manual-question-packet');
      const newPacketWrapper = document.getElementById('new-packet-name-wrapper');
      if (!packetSelect || !newPacketWrapper) return;
      const isCreatingNew = packetSelect.value === '__new__';
      newPacketWrapper.classList.toggle('hidden', !isCreatingNew);
      if (!isCreatingNew) {
        const newPacketInput = document.getElementById('manual-new-packet-name');
        if (newPacketInput) newPacketInput.value = '';
      }
    }

    function resetManualQuestionFormState() {
      window.currentEditingQuestionId = null;
      const saveBtn = document.getElementById('btn-save-manual-question');
      if (saveBtn) saveBtn.textContent = 'Simpan + Tambah Soal';
    }

    function clearManualQuestionTextarea() {
      const el = document.getElementById('manual-question-text');
      if (el) { el.innerHTML = ''; }
      // Clear option texts
      ['A','B','C','D','E'].forEach(letter => {
        const opt = document.getElementById(`manual-option-${letter}`);
        if (opt) opt.innerHTML = '';
      });
      // Reset correct key to default and clear packet selection
      const correctKey = document.getElementById('manual-correct-key');
      if (correctKey) correctKey.value = 'A';
      const packetSelect = document.getElementById('manual-question-packet');
      if (packetSelect) { packetSelect.value = ''; updateManualPacketMode(); }
      const newPacketInput = document.getElementById('manual-new-packet-name');
      if (newPacketInput) newPacketInput.value = '';
      if (el) el.focus();
    }

    function populateManualQuestionForm(packetId, question) {
      const packetSelect = document.getElementById('manual-question-packet');
      if (!packetSelect) return;
      packetSelect.value = packetId || '';
      updateManualPacketMode();

      const questionText = document.getElementById('manual-question-text');
      if (questionText) questionText.innerHTML = stripQuestionKeyLabel(question.soal || '');

      const questionImageAsset = normalizeImageAsset(question.image);
      if (questionText && questionImageAsset && !/<img[\s\S]*src=['\"]?data:image/i.test(questionText.innerHTML || '')) {
        questionText.innerHTML = `${questionText.innerHTML || ''}<div><img src="${questionImageAsset.data}" alt="Gambar" style="max-width:100%; height:auto; display:block; margin-top:0.75rem; border-radius:1rem;"></div>`;
      }

      const correctKeyInput = document.getElementById('manual-correct-key');
      if (correctKeyInput) correctKeyInput.value = question.correct_key || 'A';

      ['A','B','C','D','E'].forEach(letter => {
        const optionInput = document.getElementById(`manual-option-${letter}`);
        const optionData = (question.opsi || []).find(opt => opt.key === letter) || {};
        if (optionInput) optionInput.innerHTML = stripQuestionKeyLabel(optionData.text || '');
        const optionImageAsset = normalizeImageAsset(optionData.image);
        if (optionInput && optionImageAsset && !/<img[\s\S]*src=['\"]?data:image/i.test(optionInput.innerHTML || '')) {
          optionInput.innerHTML = `${optionInput.innerHTML || ''}<div><img src="${optionImageAsset.data}" alt="Gambar" style="max-width:100%; height:auto; display:block; margin-top:0.5rem; border-radius:1rem;"></div>`;
        }
      });

      window.currentEditingQuestionId = question.id;
      const saveBtn = document.getElementById('btn-save-manual-question');
      if (saveBtn) saveBtn.textContent = 'Simpan Perubahan Soal';
    }

    function setBankSoalTab(tab) {
      const createTab = document.getElementById('banksoal-tab-create');
      const packetsTab = document.getElementById('banksoal-tab-packets');
      const viewTab = document.getElementById('banksoal-tab-view');
      const createBtn = document.getElementById('tab-banksoal-create');
      const packetsBtn = document.getElementById('tab-banksoal-packets');
      const viewBtn = document.getElementById('tab-banksoal-view');
      if (!createTab || !packetsTab || !viewTab || !createBtn || !packetsBtn || !viewBtn) return;
      const isCreate = tab === 'create';
      const isPackets = tab === 'packets';
      const isView = tab === 'view';
      createTab.classList.toggle('hidden', !isCreate);
      packetsTab.classList.toggle('hidden', !isPackets);
      viewTab.classList.toggle('hidden', !isView);
      createBtn.classList.toggle('bg-primary', isCreate);
      createBtn.classList.toggle('text-white', isCreate);
      createBtn.classList.toggle('bg-white/10', !isCreate);
      createBtn.classList.toggle('text-slate-500', !isCreate);
      packetsBtn.classList.toggle('bg-primary', isPackets);
      packetsBtn.classList.toggle('text-white', isPackets);
      packetsBtn.classList.toggle('bg-white/10', !isPackets);
      packetsBtn.classList.toggle('text-slate-500', !isPackets);
      viewBtn.classList.toggle('bg-primary', isView);
      viewBtn.classList.toggle('text-white', isView);
      viewBtn.classList.toggle('bg-white/10', !isView);
      viewBtn.classList.toggle('text-slate-500', !isView);
      if (isPackets) renderPacketsCards();
      if (isView) renderBankSoalQuestionList();
      if (isCreate && !window.currentEditingQuestionId) resetManualQuestionFormState();
    }

    function toggleWordFormatExample() {
      const content = document.getElementById('word-format-content');
      const button = document.getElementById('toggle-word-format');
      if (!content || !button) return;
      const isHidden = content.classList.toggle('hidden');
      button.textContent = isHidden ? '+' : 'âˆ’';
    }

    document.addEventListener('DOMContentLoaded', () => {
      const toggleBtn = document.getElementById('toggle-word-format');
      if (toggleBtn) toggleBtn.addEventListener('click', toggleWordFormatExample);
      const packetSelect = document.getElementById('manual-question-packet');
      if (packetSelect) {
        packetSelect.addEventListener('change', updateManualPacketMode);
        updateManualPacketMode();
      }
    });

    function generateShortId(length = 6) {
      return Math.random().toString(36).substring(2, 2 + length);
    }

    function createImageAsset(dataUrl) {
      return {
        name: `img_${generateShortId(5)}`,
        data: dataUrl
      };
    }

    function normalizeImageAsset(value) {
      if (!value) return null;
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          if (parsed && parsed.data) return parsed;
        } catch (e) {
          return createImageAsset(value);
        }
      }
      return value && value.data ? value : null;
    }

    function getBankSoalImageData(inputId) {
      const input = document.getElementById(inputId);
      return normalizeImageAsset(input?.dataset.imageData || null);
    }

    function setBankSoalImageData(input, asset) {
      if (!input) return;
      input.dataset.imageData = asset ? JSON.stringify(asset) : '';
    }

    function stripQuestionKeyLabel(html) {
      if (!html || typeof html !== 'string') return html || '';
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
      const keyRegex = /^(?:kunci(?: jawaban)?|jawaban|answer)\s*[:\-]?\s*[A-Ea-e]$/i;
      doc.body.querySelectorAll('*').forEach(node => {
        if (node.nodeType === Node.ELEMENT_NODE && keyRegex.test(node.textContent.trim())) {
          node.remove();
        }
      });
      return doc.body.innerHTML.trim();
    }

    function sanitizeHtmlContent(html) {
      if (!html || typeof html !== 'string') return '';
      html = String(html).replace(/\r\n|\r/g, '\n');
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
      const allowedTags = ['b','strong','i','em','u','sub','sup','br','p','span','div','small','mark','img'];
      const allowedAttrs = ['style','src','alt','title'];

      function sanitizeNode(node) {
        if (node.nodeType === Node.TEXT_NODE) return;
        if (node.nodeType !== Node.ELEMENT_NODE) {
          node.remove();
          return;
        }
        const tagName = node.tagName.toLowerCase();
        if (!allowedTags.includes(tagName)) {
          const fragment = document.createDocumentFragment();
          while (node.firstChild) fragment.appendChild(node.firstChild);
          node.replaceWith(fragment);
          fragment.childNodes.forEach(sanitizeNode);
          return;
        }
        [...node.attributes].forEach(attr => {
          const attrName = attr.name.toLowerCase();
          if (!allowedAttrs.includes(attrName)) {
            node.removeAttribute(attr.name);
            return;
          }
          if (attrName === 'style') {
            const sanitizedStyles = attr.value.split(';').map(rule => rule.trim()).filter(rule => {
              return /^(font-weight|font-style|text-decoration|vertical-align|color|background-color|max-width|height|display|margin|padding)$/.test(rule);
            }).join('; ');
            if (sanitizedStyles) node.setAttribute('style', sanitizedStyles); else node.removeAttribute('style');
          }
          if (attrName === 'src') {
            if (tagName === 'img' && /^data:image\//.test(attr.value.trim())) {
              node.setAttribute('src', attr.value.trim());
            } else {
              node.removeAttribute('src');
            }
          }
        });
        if (tagName === 'img' && !node.getAttribute('src')) {
          node.remove();
          return;
        }
        [...node.childNodes].forEach(sanitizeNode);
      }

      [...doc.body.querySelectorAll('*')].forEach(sanitizeNode);
      return doc.body.innerHTML.replace(/\n+/g, '<br>');
    }

    async function handleBankSoalImageUpload(e) {
      const input = e.target;
      if (!input || !input.files || !input.files[0]) return;
      const file = input.files[0];
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        try {
          const compressed = await compressImageToTargetSize(ev.target.result, 50);
          const asset = createImageAsset(compressed);
          setBankSoalImageData(input, asset);
          const preview = document.getElementById(input.dataset.targetPreview);
          if (preview) {
            preview.src = asset.data;
            preview.classList.remove('hidden');
          }
        } catch (err) {
          showNotification('Gagal', 'Gagal mengunggah gambar.', 'danger');
        }
      };
      reader.readAsDataURL(file);
    }

    async function handleSaveManualQuestion() {
      if (!firebaseUser) return;
      const packetId = document.getElementById('manual-question-packet')?.value;
      const questionTextEl = document.getElementById('manual-question-text');
      const questionText = questionTextEl ? questionTextEl.innerHTML.trim() : '';
      const correctKey = document.getElementById('manual-correct-key')?.value;
      const isNewPacket = packetId === '__new__';
      const newPacketName = isNewPacket ? document.getElementById('manual-new-packet-name')?.value.trim() : null;
      const editingQuestionId = window.currentEditingQuestionId;
      const isEditing = !!editingQuestionId;
      if (!packetId) return showNotification('Pilih Paket', 'Pilih Soal terlebih dahulu.', 'danger');
      if (isNewPacket && !newPacketName) return showNotification('Nama Soal', 'Masukkan nama soal.', 'danger');
      if (!questionText) return showNotification('Isi Soal', 'Pertanyaan wajib diisi.', 'danger');
      const existingName = ALL_PACKETS.find(p => p.nama_paket.toLowerCase() === (newPacketName || '').toLowerCase());
      if (isNewPacket && existingName) return showNotification('Duplikat Paket', 'Nama soal sudah ada.', 'danger');
      const opsiKeys = ['A','B','C','D','E'];
      const opsi = [];
      for (const letter of opsiKeys) {
        const optionEl = document.getElementById(`manual-option-${letter}`);
        const textRaw = optionEl ? optionEl.innerHTML.trim() : '';
        const hasText = (optionEl && optionEl.textContent && optionEl.textContent.trim().length > 0) || /<img[\s\S]*src=['\"]?data:image/i.test(textRaw);
        if (!hasText) return showNotification('Isi Jawaban', `Jawaban ${letter} wajib diisi.`, 'danger');
        const optionImageAsset = extractImagesFromHtml(textRaw);
        const textWithoutImages = textRaw.replace(/<img[^>]*>/gi, '').trim();
        const text = textWithoutImages ? sanitizeHtmlContent(stripQuestionKeyLabel(textWithoutImages)) : '';
        opsi.push({ key: letter, text, image: optionImageAsset });
      }
      const questionTextHtml = sanitizeHtmlContent(stripQuestionKeyLabel(questionText));
      const packet = isNewPacket ? { id_paket: `pkt_${Date.now()}`, nama_paket: newPacketName, daftar_soal: [] } : getBankSoalPacketById(packetId);
      if (!packet) return showNotification('Paket Tidak Ditemukan', 'Paket soal tidak tersedia.', 'danger');
      const updatedPacket = { ...packet };
      if (isEditing && !isNewPacket) {
        updatedPacket.daftar_soal = (packet.daftar_soal || []).map(q => q.id === editingQuestionId ? {
          ...q,
          soal: questionTextHtml,
          image: null,
          opsi,
          correct_key: correctKey
        } : q);
      } else {
        const newQuestion = {
          id: editingQuestionId || `q_${Date.now()}`,
          nomer: (packet.daftar_soal?.length || 0) + 1,
          soal: questionTextHtml,
          image: null,
          opsi,
          correct_key: correctKey
        };
        updatedPacket.daftar_soal = [...(packet.daftar_soal || []), newQuestion];
      }
      const targetPacketId = isNewPacket ? packet.id_paket : packetId;
      toggleLoader(true, 'Menyimpan soal...');
      try {
        await setDoc(getPublicDoc('Bank Soal', targetPacketId), updatedPacket);
        if (isNewPacket) {
          ALL_PACKETS.push(updatedPacket);
        } else {
          const idx = ALL_PACKETS.findIndex(p => p.id_paket === targetPacketId);
          if (idx >= 0) ALL_PACKETS[idx] = updatedPacket;
        }
        const packetSelectEl = document.getElementById('manual-question-packet');
        if (packetSelectEl) packetSelectEl.value = targetPacketId;
        packet.daftar_soal = updatedPacket.daftar_soal;
        showNotification('Sukses', 'Soal berhasil disimpan.', 'success');
        renderPacketsCards();
        refreshBankSoalDropdowns();
        updateManualPacketMode();
        if (!document.getElementById('banksoal-tab-create')?.classList.contains('hidden')) {
          // tetap di tab Buat Soal
        } else {
          renderBankSoalQuestionList();
        }
        document.getElementById('manual-question-text').value = '';
        window.currentEditingQuestionId = null;
        const saveBtn = document.getElementById('btn-save-manual-question');
        if (saveBtn) saveBtn.textContent = 'Simpan + Tambah Soal';
        // Clear option texts and reset correct key
        ['A','B','C','D','E'].forEach(letter => {
          const opt = document.getElementById(`manual-option-${letter}`);
          if (opt) opt.value = '';
        });
        const correctKeyInput = document.getElementById('manual-correct-key');
        if (correctKeyInput) correctKeyInput.value = 'A';
        ['manual-question-text', 'manual-option-A', 'manual-option-B', 'manual-option-C', 'manual-option-D', 'manual-option-E'].forEach(id => {
          const el = document.getElementById(id);
          if (el) el.innerHTML = '';
        });
      } catch (err) {
        showNotification('Gagal', err.message, 'danger');
      } finally {
        toggleLoader(false);
      }
    }

    function renderBankSoalQuestionList() {
      const container = document.getElementById('banksoal-question-list');
      if (!container) return;
      const searchValue = document.getElementById('search-banksoal-question')?.value.toLowerCase() || '';
      const selectedPacket = document.getElementById('filter-banksoal-packet')?.value;
      const questions = [];
      if (selectedPacket) {
        const packet = getBankSoalPacketById(selectedPacket);
        if (packet?.daftar_soal?.length) packet.daftar_soal.forEach(q => questions.push({ ...q, packetName: packet.nama_paket, packetId: packet.id_paket }));
      } else {
        ALL_PACKETS.forEach(pkt => { (pkt.daftar_soal || []).forEach(q => questions.push({ ...q, packetName: pkt.nama_paket, packetId: pkt.id_paket })); });
      }
      const filtered = questions.filter(q => {
        const text = `${q.soal || ''} ${q.packetName || ''} ${q.nomer || ''}`.toLowerCase();
        return text.includes(searchValue);
      });
      if (!filtered.length) {
        container.innerHTML = `<div class="p-6 text-center text-slate-400 rounded-lg text-sm">Soal tidak ditemukan.</div>`;
        return;
      }
      container.innerHTML = '';
      filtered.forEach((q, idx) => {
        const card = document.createElement('div');
        card.className = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 hover:shadow-lg transition space-y-4';
        const questionImageAsset = normalizeImageAsset(q.image);
        
        const optionsHtml = (q.opsi || []).map(opt => {
          const isCorrect = opt.key === q.correct_key;
          const optionHtml = sanitizeHtmlContent(opt.text || '-');
          const optionImageAsset = normalizeImageAsset(opt.image);
          const optionImageHtml = optionImageAsset && !/<img[\s\S]*src=['\"]?data:image/i.test(optionHtml)
            ? `<div class="mt-2"><img src="${optionImageAsset.data}" alt="Opsi ${opt.key}" class="max-w-full h-auto rounded-xl object-contain"></div>`
            : '';
          return `
            <div class="flex gap-3 p-3 rounded-xl border cursor-default transition ${isCorrect ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-600'}">
              <span class="font-extrabold w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-xs monospace ${isCorrect ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}">${opt.key}</span>
              <div class="flex-1">
                <p class="text-sm font-semibold leading-relaxed mt-0.5 ${isCorrect ? 'text-emerald-800 dark:text-emerald-200' : 'text-slate-700 dark:text-slate-300'}">${optionHtml}</p>
                ${optionImageHtml}
              </div>
            </div>`;
        }).join('');
        
        card.innerHTML = `
          <div class="flex justify-between items-start gap-3">
            <div>
              <span class="text-xs font-extrabold uppercase text-slate-400">Soal ke: <span class="text-primary dark:text-accent font-black">${q.nomer}</span></span>
              <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">${q.packetName}</p>
            </div>
            <div class="flex gap-2 flex-shrink-0">
              <button onclick="event.stopPropagation(); triggerEditBankSoalQuestion('${q.packetId}', '${q.id}')" class="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-semibold">Edit</button>
              <button onclick="event.stopPropagation(); triggerDeleteBankSoalQuestion('${q.packetId}', '${q.id}')" class="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 font-semibold">Hapus</button>
            </div>
          </div>
          <p class="question-card-text text-sm md:text-base font-semibold leading-relaxed text-slate-700 dark:text-slate-300">${sanitizeHtmlContent(stripQuestionKeyLabel(q.soal || '-'))}</p>
          ${questionImageAsset ? `<div class="question-image-wrapper rounded-xl"><img src="${questionImageAsset.data}" alt="Soal" class="object-contain"></div>` : ''}
          <div class="space-y-2">
            ${optionsHtml}
          </div>
        `;
        container.appendChild(card);
      });
      lucide.createIcons();
    }

    window.triggerEditBankSoalQuestion = function(packetId, questionId) {
      if (!firebaseUser) return;
      const packet = getBankSoalPacketById(packetId);
      const question = packet?.daftar_soal?.find(q => q.id === questionId);
      if (!packet || !question) return;
      populateManualQuestionForm(packetId, question);
      setBankSoalTab('create');
      window.currentEditingQuestionId = questionId;
    };

    window.triggerDeleteBankSoalQuestion = function(packetId, questionId) {
      if (!firebaseUser) return;
      const packet = getBankSoalPacketById(packetId);
      if (!packet) return;
      showConfirmation('Hapus Soal', 'Yakin ingin menghapus soal ini?', async () => {
        const updatedQuestions = (packet.daftar_soal || []).filter(q => q.id !== questionId).map((q, idx) => ({ ...q, nomer: idx + 1 }));
        toggleLoader(true, 'Menghapus soal...');
        try {
          await setDoc(getPublicDoc('Bank Soal', packetId), { ...packet, daftar_soal: updatedQuestions });
          showNotification('OK', 'Soal dihapus.', 'success');
          renderBankSoalQuestionList();
        } catch (err) {
          showNotification('Gagal', err.message, 'danger');
        } finally { toggleLoader(false); }
      });
    };

    function renderResultsCards() {
      const c = document.getElementById('results-table-body');
      if (!c) return;
      const sv = (document.getElementById('filter-result-search')?.value || '').toLowerCase();
      const cf = document.getElementById('filter-result-kelas')?.value || '';
      const mf = document.getElementById('filter-result-mapel')?.value || '';
      const sortVal = document.getElementById('filter-result-sort')?.value || 'kelas-nama';
      const ps = parseInt(document.getElementById('result-page-size')?.value, 10) || 50;
      let pageNumber = getPageNumber('results');
      c.innerHTML = "";
      const filtered = ALL_RESULTS.filter(r => {
        const nis = String(r.nis || '').toLowerCase();
        const nama = String(r.nama || '').toLowerCase();
        return r.status === 'Selesai' && (nis.includes(sv) || nama.includes(sv)) && (!cf || r.kelas === cf) && (!mf || r.mapel === mf);
      }).sort((a, b) => {
        if (sortVal === 'nilai-desc') {
          return (Number(b.nilai) || 0) - (Number(a.nilai) || 0);
        } else if (sortVal === 'nilai-asc') {
          return (Number(a.nilai) || 0) - (Number(b.nilai) || 0);
        } else if (sortVal === 'nama-asc') {
          return String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
        } else if (sortVal === 'nama-desc') {
          return String(b.nama || '').localeCompare(String(a.nama || ''), 'id');
        } else {
          // Default: kelas-nama
          const kelasComp = String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id');
          if (kelasComp !== 0) return kelasComp;
          const namaComp = String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
          if (namaComp !== 0) return namaComp;
          return new Date(b.waktu_kirim || 0) - new Date(a.waktu_kirim || 0);
        }
      });
      if (!filtered.length) {
        c.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-400 font-bold text-xs">Kosong</td></tr>`;
        buildPaginationControls('results-pagination-controls', 1, 0, () => {});
        return;
      }

      const pageCount = Math.max(1, Math.ceil(filtered.length / ps));
      if (pageNumber > pageCount) pageNumber = pageCount;
      setPageNumber('results', pageNumber);
      const displayItems = filtered.slice((pageNumber - 1) * ps, pageNumber * ps);

      displayItems.forEach(r => {
        const penjelasanRaw = r.penjelasan || '-';
        const penjelasanColor = penjelasanRaw === 'Keluar Layar/Tab' ? 'text-red-500' : penjelasanRaw === 'Durasi Habis' ? 'text-amber-500' : penjelasanRaw === 'Kirim Manual' ? 'text-emerald-500' : penjelasanRaw === 'Auto Submit' ? 'text-orange-500' : 'text-slate-500';
        const penjelasanText = penjelasanRaw;
        c.innerHTML += `
          <tr class="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
            <td class="px-3 py-3 text-slate-600 dark:text-slate-300">${r.nis}</td>
            <td class="px-3 py-3 font-semibold text-slate-800 dark:text-slate-200">${r.nama}</td>
            <td class="px-3 py-3 text-slate-600 dark:text-slate-300">${r.kelas}</td>
            <td class="px-3 py-3 text-slate-600 dark:text-slate-300">${r.mapel}</td>
            <td class="px-3 py-3 text-slate-800 dark:text-slate-100 font-black">${r.nilai}</td>
            <td class="px-3 py-3 text-slate-600 dark:text-slate-300">${r.jumlah_benar}/${r.jumlah_salah}</td>
            <td class="px-3 py-3 text-slate-600 dark:text-slate-300">${new Date(r.waktu_kirim).toLocaleTimeString('id-ID')}</td>
            <td class="px-3 py-3 text-[10px] sm:text-xs font-semibold ${penjelasanColor}">${penjelasanText}</td>
            <td class="px-3 py-3 text-right">
              <div class="inline-flex items-center justify-end gap-1.5">
                <button onclick="showResultItemAnalysis('${r.id}')" class="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 text-[9px] sm:text-[10px] font-semibold">
                  Detail
                </button>
                <button onclick="triggerResetAnswer('${r.nis}', '${r.mapel}')" class="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[9px] sm:text-[10px] font-semibold">
                  Hapus
                </button>
              </div>
            </td>
          </tr>
        `;
      });
      buildPaginationControls('results-pagination-controls', pageNumber, pageCount, (newPage) => {
        setPageNumber('results', newPage);
        renderResultsCards();
      });
      lucide.createIcons();
    }

    // Fungsi Render Tabel Jadwal Ujian Aktif Dashboard
    function renderDashboardActiveExamsTable() {
      const tbody = document.getElementById('dashboard-active-exams-tbody');
      if (!tbody) return;
      tbody.innerHTML = "";

      if (!ALL_SCHEDULES.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400 font-bold text-xs">Belum ada jadwal ujian yang terdaftar</td></tr>`;
        return;
      }

      const todayStr = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD
      const searchInput = document.getElementById('search-dashboard-mapel');
      const searchVal = searchInput ? searchInput.value.toLowerCase() : "";

      // Mengambil nilai filter kelas dashboard aktif
      const classFilter = document.getElementById('filter-dashboard-kelas');
      const classVal = classFilter ? classFilter.value : "";

      const processedSchedules = ALL_SCHEDULES.map(sch => {
        let status = "Belum Mulai";
        let statusClass = "bg-blue-500/10 text-blue-500 border-blue-500/20";
        let order = 2; // Default order untuk belum mulai

        if (sch.mulai) {
          const nowMs = Date.now();
          const startMs = new Date(sch.mulai).getTime();
          // Jika sch.selesai belum ada (data lama), fallback pakai durasi
          const endMs = sch.selesai ? new Date(sch.selesai).getTime() : startMs + (sch.durasi * 60000);
          
          if (nowMs < startMs) {
            status = "Belum Mulai";
            statusClass = "bg-blue-500/10 text-blue-500 border-blue-500/20";
            order = 2;
          } else if (nowMs >= startMs && nowMs <= endMs) {
            status = "Aktif";
            statusClass = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 animate-pulse";
            order = 1; // Taruh aktif di paling atas
          } else {
            status = "Selesai";
            statusClass = "bg-slate-500/10 text-slate-500 border-slate-500/20";
            order = 3; // Taruh selesai di paling bawah
          }
        }

        return { ...sch, status, statusClass, order };
      });

      // Filter berdasarkan pencarian Mata Pelajaran & Filter Kelas di Dashboard
      const filteredSchedules = processedSchedules.filter(sch => {
        const matchesMapel = !searchVal || (sch.mapel && sch.mapel.toLowerCase().includes(searchVal));
        const matchesKelas = !classVal || (sch.kelas_terpilih && sch.kelas_terpilih.includes(classVal));
        return matchesMapel && matchesKelas;
      });

      // Urutkan berdasarkan prioritas status (aktif paling atas)
      filteredSchedules.sort((a, b) => a.order - b.order);

      if (!filteredSchedules.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400 font-bold text-xs">Jadwal ujian tidak ditemukan</td></tr>`;
        return;
      }

      filteredSchedules.forEach(sch => {
        const tr = document.createElement('tr');
        tr.className = "hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors border-b border-slate-100 dark:border-slate-800/80";
        
        // Format daftar kelas terpilih menjadi badge kecil
        const kelasBadges = sch.kelas_terpilih ? sch.kelas_terpilih.map(cls => 
          `<span class="text-[8px] sm:text-[9px] bg-slate-100 dark:bg-slate-800 font-bold px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">${cls}</span>`
        ).join(' ') : '';

        // Format Tanggal dan Waktu Lokalisasi Indonesia untuk Tabel
        let formattedDate = '-';
        let formattedTime = '-';
        if (sch.mulai) {
          const d = new Date(sch.mulai);
          const tgl = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
          const startTime = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          const endMs = sch.selesai ? new Date(sch.selesai).getTime() : d.getTime() + ((Number(sch.durasi) || 0) * 60000);
          const endTime = new Date(endMs).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
          formattedDate = tgl;
          formattedTime = `${startTime} - ${endTime}`;
        }

        tr.innerHTML = `
          <td class="py-3 px-4 font-bold text-slate-600 dark:text-slate-300 text-[11px] sm:text-xs tracking-wide">${formattedDate}</td>
          <td class="py-3 px-4 font-bold text-slate-600 dark:text-slate-300 text-[11px] sm:text-xs tracking-wide">${formattedTime}</td>
          <td class="py-3 px-4 font-extrabold text-primary dark:text-slate-100">${sch.mapel || '-'}</td>
          <td class="py-3 px-4"><div class="flex flex-wrap gap-1 max-w-[200px]">${kelasBadges}</div></td>
          <td class="py-3 px-4">
            <span class="text-[8px] sm:text-[10px] uppercase tracking-wide border px-2 py-0.5 rounded-full font-bold ${sch.statusClass}">
              ${sch.status}
            </span>
          </td>
          <td class="py-3 px-4 text-right">
            <div class="flex justify-end gap-1.5">
              <button onclick="triggerEditSchedule('${sch.id}')" class="p-1.5 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded-lg transition" title="Edit Jadwal">
                <i data-lucide="edit" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
              </button>
              <button onclick="triggerDeleteSchedule('${sch.id}')" class="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition" title="Hapus Jadwal">
                <i data-lucide="trash-2" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
              </button>
            </div>
          </td>
        `;
        tbody.appendChild(tr);
      });
      
      lucide.createIcons();
    }

    window.triggerStudentDelete = function(nis) { 
      if(!firebaseUser)return; 
      const student = ALL_STUDENTS.find(s => s.nis === nis);
      const displayName = student?.nama || nis;
      showConfirmation("Hapus", `Hapus Siswa <strong>${displayName}</strong>?`, async()=>{ 
        toggleLoader(true); 
        try{ 
          await deleteDoc(getPublicDoc("Siswa", nis));
          ALL_STUDENTS = ALL_STUDENTS.filter(s => s.nis !== nis);
          renderStudentsCards();
          updateClassSelectors();
          showNotification("OK", "Dihapus", "success"); 
        } catch (e) { console.error('triggerStudentDelete failed', e); showNotification("Gagal", e.message || "Gagal menghapus siswa.", "danger"); } finally { toggleLoader(false); } 
      }); 
    }
    
    // Perubahan: Menghapus token kuncian sesi ketika jadwal dihapus
    window.triggerDeleteSchedule = function(id) { 
      if(!firebaseUser)return; 
      showConfirmation("Hapus", "Hapus jadwal?", async()=>{ 
        toggleLoader(true); 
        try{ 
          await deleteDoc(getPublicDoc("Jadwal Ujian", id));
          ALL_SCHEDULES = ALL_SCHEDULES.filter(s => s.id !== id);
          renderSchedules();
          renderDashboardActiveExamsTable();
          mySessionStorage.removeItem('tokens_generated_session'); 
          showNotification("OK", "Dihapus", "success"); 
        } catch (e) { console.error('triggerDeleteSchedule failed', e); showNotification("Gagal", e.message || "Gagal menghapus jadwal.", "danger"); } finally { toggleLoader(false); } 
      }); 
    }

    // Fitur Baru: Edit Jadwal Ujian secara Langsung
    window.triggerEditSchedule = function(id) {
      if (!firebaseUser) return;
      const sch = ALL_SCHEDULES.find(s => s.id === id);
      if (!sch) return;

      const uc = [...new Set(ALL_STUDENTS.map(s => s.kelas))].sort(sortClassStrings).map(c => {
        const checked = sch.kelas_terpilih.includes(c) ? 'checked' : '';
        return `<label class="flex items-center gap-1"><input type="checkbox" name="sc-edit" value="${c}" ${checked} class="rounded text-primary"> <span class="text-[10px]">${c}</span></label>`;
      }).join('');
      showConfirmation("Edit Jadwal", `
        <div class="space-y-2 text-xs text-left text-slate-800 dark:text-slate-100">
          <label class="font-bold text-white dark:text-white uppercase tracking-wider block">Mata Pelajaran</label>
          <input id="s-m-edit" value="${sch.mapel || ''}" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50">
          
          <label class="font-bold text-white dark:text-white uppercase tracking-wider block">Paket Soal</label>
          <select id="s-p-edit" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50">
            ${ALL_PACKETS.map(p => `<option value="${p.id_paket}" ${p.id_paket === sch.id_paket ? 'selected' : ''}>${p.nama_paket}</option>`).join('')}
          </select>
          
          <label class="font-bold text-white dark:text-white uppercase tracking-wider block">Mulai</label>
          <input type="datetime-local" id="s-dt-edit" value="${sch.mulai || ''}" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50">
          
          <label class="font-bold text-white dark:text-white uppercase tracking-wider block">Durasi (Menit)</label>
          <input type="number" id="s-d-edit" value="${sch.durasi || 60}" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50">
          <div id="s-end-preview-edit" class="text-[10px] text-slate-600 dark:text-slate-400">Waktu selesai: -</div>
          
          <label class="font-bold text-white dark:text-white uppercase tracking-wider block">Kelas Terpilih</label>
          <div class="flex flex-wrap gap-2 p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950">${uc}</div>
        </div>
      `, async () => {
        const m = document.getElementById('s-m-edit').value.trim();
        const p = document.getElementById('s-p-edit').value;
        const dt = document.getElementById('s-dt-edit').value;
        const dr = parseInt(document.getElementById('s-d-edit').value, 10);
        const cl = Array.from(document.querySelectorAll('input[name="sc-edit"]:checked')).map(cb => cb.value);

        if (!m || !p || !dt || !dr || !cl.length) {
          showNotification("Input Gagal", "Semua kolom wajib diisi!", "danger");
          return;
        }

        toggleLoader(true, "Mengupdate Jadwal...");
        try {
          const updatedSch = {
            ...sch,
            mapel: m,
            id_paket: p,
            mulai: dt,
            durasi: dr,
            kelas_terpilih: cl
          };
          await setDoc(getPublicDoc("Jadwal Ujian", id), updatedSch);
          const idx = ALL_SCHEDULES.findIndex(s => s.id === id);
          if (idx >= 0) ALL_SCHEDULES[idx] = updatedSch;
          renderSchedules();
          renderDashboardActiveExamsTable();
          mySessionStorage.removeItem('tokens_generated_session');
          showNotification("Sukses", "Jadwal berhasil diperbarui!", "success");
        } catch (e) {
          showNotification("Gagal", e.message, "danger");
        } finally {
          toggleLoader(false);
        }
      });
      attachScheduleEndPreview('s-dt-edit','s-d-edit','s-end-preview-edit');
    };
    
    window.triggerDeletePacket = function(id) { if(!firebaseUser)return; showConfirmation("Hapus", "Hapus paket?", async()=>{ toggleLoader(true); try{ await deleteDoc(getPublicDoc("Bank Soal", id)); ALL_PACKETS=ALL_PACKETS.filter(p=>p.id_paket!==id); renderPacketsCards(); showNotification("OK", "Dihapus", "success"); } catch (e) { console.error('triggerDeletePacket failed', e); showNotification("Gagal", e.message || "Gagal menghapus paket.", "danger"); } finally { toggleLoader(false); } }); }
    window.triggerEditPacket = function(id) {
      const pkt = getBankSoalPacketById(id);
      if (!pkt) return showNotification("Gagal", "Paket tidak ditemukan", "danger");
      window.CURRENT_EDIT_PACKET = id;
      const packetSelect = document.getElementById('manual-question-packet');
      if (packetSelect) {
        packetSelect.value = pkt.id_paket || '';
        updateManualPacketMode();
      }
      setBankSoalTab('create');
      showNotification("Edit", "Edit mode aktif: pilih paket lalu sunting/impor.", "info");
    }
    window.triggerResetIndividu = function(sid) { 
      if(!firebaseUser)return; 
      showConfirmation("Reset", "Hapus sesi perangkat lama?", async()=>{ 
        toggleLoader(true); 
        try{ 
          await deleteDoc(getPublicDoc("Session Ujian", sid));
          ACTIVE_MONITOR_DATA = ACTIVE_MONITOR_DATA.filter(s => s.id !== sid);
          renderActiveMonitorList();
          showNotification("OK", "Direset", "success"); 
        } catch (e) { console.error('triggerResetIndividu failed', e); showNotification("Gagal", e.message || "Gagal mereset sesi.", "danger"); } finally { toggleLoader(false); } 
      }); 
    }
    window.triggerResetAnswer = function(nis, mapel) {
      if (!firebaseUser) return;
      const mr = ALL_RESULTS.find(r => r.nis === nis && r.mapel === mapel);
      if (!mr) return;
      showConfirmation("Reset", `Hapus hasil ${mapel}?`, async () => {
        toggleLoader(true);
        try {
          await deleteDoc(getPublicDoc("Jawaban Siswa", mr.id));
          ALL_RESULTS = ALL_RESULTS.filter(r => r.id !== mr.id);
          renderResultsCards();
          refreshCachedDashboardStats(true);
          showNotification("OK", "Dihapus", "success");
        } catch (e) {
          showNotification("Err", e.message, "danger");
        } finally {
          toggleLoader(false);
        }
      });
    };

    async function handleExportDatabase() { if(!firebaseUser)return; toggleLoader(true); try { const p={}; for(const c of ["Admin","Siswa","Bank Soal","Jadwal Ujian","Jawaban Siswa","Session Ujian"]){ const s=await getDocs(getPublicCollection(c)); p[c]=s.docs.map(d=>d.data()); } const a=document.createElement('a'); a.href="data:text/json;charset=utf-8,"+encodeURIComponent(JSON.stringify(p,null,2)); a.download=`CBT_Backup_${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); showNotification("OK", "Diunduh", "success"); } catch (e) { console.error('handleExportDatabase failed', e); showNotification("Gagal", e.message || "Gagal mengekspor database.", "danger"); } finally { toggleLoader(false); } }
    function handleImportDatabase(e) { if(!firebaseUser)return; const f = e?.target?.files?.[0]; if(!f) return; const r=new FileReader(); r.onload=async(ev)=>{ toggleLoader(true); try{ const dt = JSON.parse(ev.target.result); for(const [c,ds] of Object.entries(dt)){ let batch = writeBatch(db); let opCount = 0; for(const doj of ds){ const id = doj.nis || doj.id || doj.id_paket || doj.username; if(!id) continue; batch.set(getPublicDoc(c, String(id)), doj); opCount++; if(opCount >= 450){ await batch.commit(); batch = writeBatch(db); opCount = 0; } } if(opCount > 0) await batch.commit(); } mySessionStorage.removeItem('tokens_generated_session'); showNotification("OK", "Dipulihkan", "success"); }catch(er){ showNotification("Gagal", er.message || "Impor gagal.", "danger"); }finally{toggleLoader(false);} }; r.readAsText(f); }
    async function handleTruncateAnswers() { if(!firebaseUser)return; showConfirmation("Hapus", "Kosongkan jawaban?", async()=>{ toggleLoader(true); try{ const s = await getDocs(getPublicCollection("Jawaban Siswa")); let batch = writeBatch(db); let opCount = 0; for(const d of s.docs){ batch.delete(getPublicDoc("Jawaban Siswa", d.id)); opCount++; if(opCount >= 450){ await batch.commit(); batch = writeBatch(db); opCount = 0; } } if(opCount > 0) await batch.commit(); showNotification("OK", "Kosong", "success"); }catch(e){ showNotification("Gagal", e.message || "Gagal menghapus jawaban.", "danger"); }finally{toggleLoader(false);} }); }
    async function handlePurgeDatabaseTotal() {
      if (!firebaseUser) return;
      toggleLoader(true, 'Menghapus semua data dari database (kecuali data admin)...');
      try {
        for (const c of ['Siswa', 'Bank Soal', 'Jadwal Ujian', 'Jawaban Siswa', 'Session Ujian']) {
          const s = await getDocs(getPublicCollection(c));
          let batch = writeBatch(db);
          let opCount = 0;
          for (const d of s.docs) {
            batch.delete(getPublicDoc(c, d.id));
            opCount++;
            if (opCount >= 450) {
              await batch.commit();
              batch = writeBatch(db);
              opCount = 0;
            }
          }
          if (opCount > 0) await batch.commit();
        }
        mySessionStorage.removeItem('tokens_generated_session');
        showNotification('OK', 'Semua data (kecuali data admin) berhasil dihapus.', 'success');
      } catch (e) {
        showNotification('Gagal', e.message || 'Gagal menghapus data.', 'danger');
      } finally {
        toggleLoader(false);
      }
    }

    function askPurgeDatabaseTotal() {
      showConfirmation('Peringatan Keras', `Tindakan ini akan menghapus <strong>SEMUA DATA</strong> (kecuali data admin) dari database.<br><br><strong>Langkah 1:</strong> Klik Lanjutkan untuk memastikan Anda paham risiko.`, () => {
        showConfirmation('Konfirmasi Keamanan 2', `Langkah 2: Ketik <strong>DELETE ALL</strong> pada kolom di bawah untuk melanjutkan operasi ini.<br><br><input id=\"purge-confirm-code\" placeholder=\"KETIK DELETE ALL\" class=\"w-full mt-3 p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100\" />`, async () => {
          const code = document.getElementById('purge-confirm-code')?.value?.trim();
          if (code !== 'DELETE ALL') {
            showNotification('Dibatalkan', 'Kode konfirmasi tidak cocok. Operasi dibatalkan.', 'danger');
            return;
          }
          await handlePurgeDatabaseTotal();
        }, 'alert-triangle');
      }, 'alert-triangle');
    }
    async function handleResetAllSessions() { if(!firebaseUser)return; showConfirmation("Reset Sesi", "Kosongkan session aktif?", async()=>{ toggleLoader(true); try{ const s = await getDocs(getPublicCollection("Session Ujian")); let batch = writeBatch(db); let opCount = 0; for(const d of s.docs){ batch.delete(getPublicDoc("Session Ujian", d.id)); opCount++; if(opCount >= 450){ await batch.commit(); batch = writeBatch(db); opCount = 0; } } if(opCount > 0) await batch.commit(); showNotification("OK", "Sesi bersih", "success"); }catch(e){ showNotification("Gagal", e.message || "Gagal mereset sesi.", "danger"); }finally{toggleLoader(false);} }); }

    function handleExportResultsExcel() {
      if (typeof XLSX === 'undefined') return showNotification("Gagal", "Modul Excel sedang dimuat.", "danger");
      if (!ALL_RESULTS.length) return showNotification("Kosong", "Tidak ada hasil.", "info");
      const dr = ALL_RESULTS.map((r, i) => ({"No": i + 1, "NIS": r.nis, "Nama": r.nama, "Kelas": r.kelas, "Mapel": r.mapel, "Nilai": r.nilai, "Benar": r.jumlah_benar, "Salah": r.jumlah_salah, "Status": r.status, "Waktu Submit": new Date(r.waktu_kirim).toLocaleString('id-ID')}));
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dr), "Hasil"); XLSX.writeFile(wb, `Hasil_${Date.now()}.xlsx`);
    }

    function handleExcelImportSiswa(e) {
      if (typeof XLSX === 'undefined') return showNotification("Gagal", "Modul Excel sedang dimuat.", "danger");
      if (!firebaseUser) return; const f = e.target.files[0]; if (!f) return;
      const r = new FileReader(); r.onload = async(ev) => {
        toggleLoader(true);
        try {
          const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
          const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
          if (json.length < 2) throw new Error("Kosong");
          let batch = writeBatch(db); let opCount = 0; let l = 0;
          for (let i = 1; i < json.length; i++) {
            if (json[i][0] && json[i][1] && json[i][2]) {
              const nis = String(json[i][0]).trim();
              batch.set(getPublicDoc("Siswa", nis), { nis, nama: String(json[i][1]).trim(), kelas: String(json[i][2]).trim(), password: json[i][3] ? String(json[i][3]).trim() : "123456" });
              l++; opCount++;
              if (opCount >= 450) {
                await batch.commit();
                batch = writeBatch(db);
                opCount = 0;
              }
            }
          }
          if (opCount > 0) await batch.commit();
          showNotification("OK", `${l} tersimpan`, "success");
        } catch (er) { showNotification("Err", er.message, "danger"); } finally { toggleLoader(false); e.target.value = ""; }
      }; r.readAsArrayBuffer(f);
    }

    function downloadSiswaTemplate() {
      if (typeof XLSX === 'undefined') return showNotification("Gagal", "Modul Excel dimuat.", "danger");
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["NIS", "Nama", "Kelas", "Password"], ["123", "AR Siswa", "XII MIPA 1", "pass123"]]), "Format"); XLSX.writeFile(wb, "Template.xlsx");
    }

    // ===== GENERATOR KARTU UJIAN PDF (desain kartu pemilih) =====
    async function handleDownloadKartuUjian() {
      if (typeof window.jspdf === 'undefined') {
        return showNotification("Gagal", "Modul PDF belum siap. Coba beberapa saat lagi.", "danger");
      }
      if (!ALL_STUDENTS.length) {
        return showNotification("Kosong", "Tidak ada data siswa untuk dicetak.", "info");
      }

      toggleLoader(true, "MEMBUAT KARTU UJIAN...");

      try {
        const { jsPDF } = window.jspdf;
        const schoolName = myLocalStorage.getItem('er_sh_name') || "SMA Negeri 2 Kuningan";
        const logoUrl    = myLocalStorage.getItem('er_sh_logo') || "https://iili.io/B5MMKiX.png";
        const siteUrl    = 'https://arnnon28.github.io/smandacbt/';

        let logoDataUrl = null;
        try {
          const resp = await fetch(logoUrl);
          const blob = await resp.blob();
          logoDataUrl = await new Promise((res) => {
            const fr = new FileReader();
            fr.onload = () => res(fr.result);
            fr.readAsDataURL(blob);
          });
        } catch (_) { logoDataUrl = null; }

        const sorted = [...ALL_STUDENTS].sort((a, b) => {
          const kc = String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id');
          if (kc !== 0) return kc;
          return String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
        });

        const doc = new jsPDF('p', 'mm', 'a4');
        const kartuLebar = 85.6;
        const kartuTinggi = 50;
        const marginX = 8;
        const marginY = 6;
        const posXAwal = 15.4;
        const posYAwal = 10;
        const BLUE = [34, 102, 170];

        function drawCbtHeaderIcon(doc, boxX, boxY, boxW, boxH) {
          doc.setDrawColor(255, 255, 255);
          doc.setFillColor(...BLUE);
          doc.setLineWidth(0.4);
          doc.roundedRect(boxX + 1, boxY + 2, boxW - 2, boxH - 5, 0.8, 0.8, 'FD');
          doc.setFillColor(255, 255, 255);
          doc.rect(boxX + 2, boxY + 3, boxW - 4, boxH - 7.5, 'F');
          doc.setFillColor(255, 255, 255);
          doc.rect(boxX + boxW / 2 - 1.5, boxY + boxH - 3.5, 3, 1.5, 'F');
          doc.rect(boxX + boxW / 2 - 3.5, boxY + boxH - 2, 7, 0.8, 'F');
        }

        let posX = posXAwal;
        let posY = posYAwal;
        let col = 0;
        let rowCount = 0;

        for (let i = 0; i < sorted.length; i++) {
          const student = sorted[i];
          let qrDataUrl = null;
          try {
            if (typeof QRious !== 'undefined') {
              const qr = new QRious({ value: siteUrl, size: 200, level: 'M' });
              qrDataUrl = qr.toDataURL('image/jpeg');
            }
          } catch (_) {}

          doc.setFillColor(255, 255, 255);
          doc.setDrawColor(...BLUE);
          doc.setLineWidth(0.3);
          doc.roundedRect(posX, posY, kartuLebar, kartuTinggi, 3, 3, 'FD');

          doc.setFillColor(...BLUE);
          doc.roundedRect(posX, posY, kartuLebar, 14, 3, 3, 'F');
          doc.rect(posX, posY + 7, kartuLebar, 7, 'F');

          if (logoDataUrl) {
            try {
              doc.addImage(logoDataUrl, 'PNG', posX + 3, posY + 2, 10, 10);
            } catch (_) {}
          }

          drawCbtHeaderIcon(doc, posX + kartuLebar - 14, posY + 1.5, 11, 11);

          doc.setFont('helvetica', 'bold');
          doc.setFontSize(10.5);
          doc.setTextColor(255, 255, 255);
          doc.text('KARTU UJIAN SISWA', posX + kartuLebar / 2, posY + 5.5, { align: 'center' });
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(7.5);
          doc.text(schoolName, posX + kartuLebar / 2, posY + 10, { align: 'center' });

          const labelX = posX + 5;
          const valX = labelX + 16;
          let textY = posY + 20;

          const drawDataRow = (label, value, valueColor = [10, 10, 10], isBold = true) => {
            doc.setFont('helvetica', 'normal');
            doc.setTextColor(100, 100, 100);
            doc.setFontSize(7.5);
            doc.text(label, labelX, textY);
            doc.text(':', labelX + 13, textY);
            doc.setFont('helvetica', isBold ? 'bold' : 'normal');
            doc.setTextColor(valueColor[0], valueColor[1], valueColor[2]);
            doc.setFontSize(8);
            const lines = doc.splitTextToSize(String(value), 36);
            for (let li = 0; li < lines.length; li++) {
              doc.text(lines[li], valX, textY);
              if (li < lines.length - 1) textY += 3.5;
            }
            textY += 4.5;
          };

          drawDataRow('Nama', student.nama || '-');
          drawDataRow('NIS', student.nis || '-');
          drawDataRow('Kelas', student.kelas || '-');
          drawDataRow('Password', student.password || '-', [220, 50, 50], true);

          if (qrDataUrl) {
            const qrSize = 20;
            doc.addImage(qrDataUrl, 'JPEG', posX + kartuLebar - qrSize - 4, posY + 15, qrSize, qrSize);
          }

          doc.setFont('helvetica', 'italic');
          doc.setTextColor(120, 120, 120);
          doc.setFontSize(7.5);
          const websiteLabel = siteUrl.replace(/^https?:\/\//, '');
          doc.text(`Website: ${websiteLabel}`, posX + kartuLebar / 2, posY + kartuTinggi - 5.5, { align: 'center' });

          doc.setFillColor(...BLUE);
          doc.roundedRect(posX, posY + kartuTinggi - 3, kartuLebar, 3, 3, 3, 'F');
          doc.rect(posX, posY + kartuTinggi - 3, kartuLebar, 1.5, 'F');

          col++;
          if (col === 2) {
            col = 0;
            rowCount++;
            posX = posXAwal;
            posY += kartuTinggi + marginY;
          } else {
            posX += kartuLebar + marginX;
          }
          if (rowCount === 5 && i < sorted.length - 1) {
            doc.addPage();
            posX = posXAwal;
            posY = posYAwal;
            col = 0;
            rowCount = 0;
          }
        }

        doc.save('Kartu_Ujian_Siswa.pdf');
        showNotification("Sukses", `${sorted.length} kartu ujian berhasil dibuat!`, "success");
      } catch (err) {
        console.error('handleDownloadKartuUjian error:', err);
        showNotification("Gagal", err.message || "Gagal membuat kartu ujian.", "danger");
      } finally {
        toggleLoader(false);
      }
    }

    function downloadWordTemplate() {
      const url = './assets/template/template_soal.docx';
      const link = document.createElement('a');
      link.href = url;
      link.download = 'template_soal.docx';
      document.body.appendChild(link);
      link.click();
      link.remove();
    }

    function handleDOCXImportSoal(e) {
      if (typeof mammoth === 'undefined') { showNotification("Belum Siap", "Pustaka DOCX masih diunduh.", "danger"); e.target.value=""; return; }
      if (!firebaseUser) return;
      const f = e.target.files[0];
      const packetId = document.getElementById('manual-question-packet').value.trim();
      const isNewPacket = packetId === '__new__';
      const newPacketName = isNewPacket ? document.getElementById('manual-new-packet-name')?.value.trim() : null;
      if (!packetId) { showNotification("Pilih Paket", "Pilih Soal terlebih dahulu", "info"); e.target.value=""; return; }
      if (isNewPacket && !newPacketName) { showNotification("Nama Soal", "Masukkan nama soal.", "info"); e.target.value=""; return; }
      if (!f) return;
      const r = new FileReader(); r.onload = function(ev) {
        toggleLoader(true);
        
        // Konfigurasi Mammoth untuk mengekstrak SEMUA gambar / objek / Math formula dalam base64
        const mammothOptions = {
          convertImage: mammoth.images.imgElement(function(image) {
            return image.read("base64").then(function(imageBuffer) {
              return {
                src: "data:" + image.contentType + ";base64," + imageBuffer
              };
            });
          })
        };

        mammoth.convertToHtml({ arrayBuffer: ev.target.result }, mammothOptions).then(async(res) => {
          const div = document.createElement('div'); div.innerHTML = res.value;
          const qs = [];
          let cq = null;
          let pendingImage = null;
          for (let p of div.querySelectorAll('p')) {
            const imgEl = p.querySelector('img');
            let img = null;
            if (imgEl && imgEl.src.startsWith('data:image')) {
              const compressed = await compressImageToTargetSize(imgEl.src, 50);
              img = createImageAsset(compressed);
            }
            let txt = (p.innerText || p.textContent).trim();
            const keyMatch = txt.match(/^(.*?)(?:\s*(?:kunci|jawaban|answer)\s*[:=]?\s*([A-Ea-e])\s*)$/i);
            if (keyMatch && cq) {
              txt = keyMatch[1].trim();
              cq.correct_key = keyMatch[2].toUpperCase();
            }
            if (img && !txt) {
              pendingImage = img;
              if (cq && !cq.image) {
                cq.image = pendingImage;
                pendingImage = null;
              } else if (cq && cq.opsi?.length) {
                const lastOpt = cq.opsi[cq.opsi.length - 1];
                if (lastOpt && !lastOpt.image) {
                  lastOpt.image = pendingImage;
                  pendingImage = null;
                }
              }
              continue;
            }
            const om = txt.match(/^([A-Ea-e])(?:[\.\)\s]+)(.*)/);
            const qm = txt.match(/^(\d+)(?:[\.\)\s]+)(.*)/);
            if (qm) {
              if (cq) qs.push(cq);
              const questionHtml = sanitizeHtmlContent(p.innerHTML.replace(/<img[^>]*>/gi, '').trim() || qm[2].trim());
              cq = {
                id: `q_${qs.length + 1}`,
                nomer: parseInt(qm[1], 10),
                soal: questionHtml,
                image: pendingImage,
                opsi: []
              };
              pendingImage = null;
            } else if (/^(kunci|jawaban|answer)[:\-]\s*([A-Ea-e])/.test(txt) && cq) {
              cq.correct_key = txt.match(/^(kunci|jawaban|answer)[:\-]\s*([A-Ea-e])/i)[2].toUpperCase();
              pendingImage = null;
            } else if (om && cq) {
              const optionHtml = sanitizeHtmlContent(p.innerHTML.replace(/<img[^>]*>/gi, '').trim() || om[2].trim());
              cq.opsi.push({ key: om[1].toUpperCase(), text: optionHtml, image: pendingImage });
              pendingImage = null;
            } else if (cq) {
              const addedHtml = sanitizeHtmlContent(p.innerHTML.replace(/<img[^>]*>/gi, '').trim() || txt);
              cq.soal += "\n" + addedHtml;
              if (pendingImage && !cq.image) {
                cq.image = pendingImage;
                pendingImage = null;
              }
            }
          }
          if (cq) qs.push(cq);
          if (!qs.length) throw new Error("Format salah");
          const targetPacketId = isNewPacket ? `pkt_${Date.now()}` : packetId;
          const selectedPacket = isNewPacket ? { id_paket: targetPacketId, nama_paket: newPacketName, daftar_soal: [] } : getBankSoalPacketById(packetId);
          if (!selectedPacket) throw new Error("Paket tidak ditemukan");
          const updatedQuestions = [...(selectedPacket.daftar_soal || []), ...qs];
          const pld = { id_paket: targetPacketId, nama_paket: selectedPacket.nama_paket, daftar_soal: updatedQuestions };
          await setDoc(getPublicDoc("Bank Soal", targetPacketId), pld);
          const idx = ALL_PACKETS.findIndex(p => p.id_paket === targetPacketId);
          if (idx >= 0) ALL_PACKETS[idx] = pld; else ALL_PACKETS.push(pld);
          window.CURRENT_EDIT_PACKET = null;
          const packetSelectEl = document.getElementById('manual-question-packet');
          if (packetSelectEl) packetSelectEl.value = targetPacketId;
          renderPacketsCards();
          refreshBankSoalDropdowns();
          updateManualPacketMode();
          if (!document.getElementById('banksoal-tab-view')?.classList.contains('hidden')) {
            renderBankSoalQuestionList();
          }
          showNotification("OK", `${qs.length} Soal ditambahkan ke paket`, "success");
        }).catch(er => showNotification("Err", er.message, "danger")).finally(() => { toggleLoader(false); e.target.value = ""; });
      }; r.readAsArrayBuffer(f);
    }

    function compressImageToTargetSize(b64, maxKB) {
      return new Promise((res) => {
        const img = new Image(); img.src = b64;
        img.onload = () => {
          const cvs = document.createElement('canvas'); let w = img.width, h = img.height;
          if (w > 800) { h *= (800 / w); w = 800; }
          cvs.width = w; cvs.height = h; cvs.getContext('2d').drawImage(img, 0, 0, w, h);
          let q = 0.7, out = cvs.toDataURL('image/jpeg', q);
          while (out.length > maxKB * 1024 && q > 0.1) { q -= 0.1; out = cvs.toDataURL('image/jpeg', q); }
          res(out);
        };
        img.onerror = () => res(b64);
      });
    }

    async function handleAddStudentManual() {
      if (!firebaseUser) return;
      showConfirmation("Tambah Siswa Manual", `
        <div class="space-y-2 text-xs text-left text-slate-800 dark:text-slate-100">
          <label class="font-bold text-slate-400 uppercase tracking-wider block">NIS</label>
          <input id="m-n" placeholder="Masukkan NIS" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50">
          
          <label class="font-bold text-slate-400 uppercase tracking-wider block mt-2">Nama Siswa</label>
          <input id="m-nm" placeholder="Masukkan Nama Siswa" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50">
          
          <label class="font-bold text-slate-400 uppercase tracking-wider block mt-2">Kelas</label>
          <input id="m-k" placeholder="Masukkan Kelas" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50">
          
          <label class="font-bold text-slate-400 uppercase tracking-wider block mt-2">Password</label>
          <div class="relative">
            <input type="password" id="m-p" placeholder="Masukkan Password" class="w-full p-2 pr-10 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50">
            <button type="button" onclick="const p = document.getElementById('m-p'); p.type = p.type === 'password' ? 'text' : 'password'; this.querySelector('i').classList.toggle('fa-eye'); this.querySelector('i').classList.toggle('fa-eye-slash');" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <i class="fas fa-eye"></i>
            </button>
          </div>
        </div>
      `, async () => {
        const n=document.getElementById('m-n').value.trim(), nm=document.getElementById('m-nm').value.trim(), k=document.getElementById('m-k').value.trim(), p=document.getElementById('m-p').value.trim();
        if(!n||!nm||!k||!p){ showNotification("Input Gagal", "Semua kolom wajib diisi.", "danger"); return; }
        if(ALL_STUDENTS.some(s => s.nis === n)){ showNotification("Input Gagal", "NIS sudah terdaftar.", "danger"); return; }
        toggleLoader(true, "Menyimpan Siswa..."); 
        try{ 
          const newStudent = {nis:n, nama:nm, kelas:k, password:p};
          await setDoc(getPublicDoc("Siswa", n), newStudent);
          ALL_STUDENTS.push(newStudent);
          renderStudentsCards();
          updateClassSelectors();
          showNotification("Sukses", "Siswa berhasil disimpan", "success"); 
        }catch(e){ showNotification("Gagal", e.message || "Tidak dapat menyimpan siswa.", "danger"); }finally{toggleLoader(false);}
      });
    }

    function renderAdminsCards() {
      const tbody = document.getElementById('admins-table-body');
      if (!tbody) return;
      tbody.innerHTML = "";
      if (!ALL_ADMINS.length) {
        tbody.innerHTML = `<tr><td colspan="4" class="py-8 text-center text-slate-400 font-bold text-xs">Data admin tidak ditemukan</td></tr>`;
        return;
      }
      ALL_ADMINS.forEach((adm, index) => {
        tbody.innerHTML += `
          <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors border-b border-slate-100 dark:border-slate-800/80">
            <td class="py-3 px-4 font-bold text-slate-500 text-center">${index + 1}</td>
            <td class="py-3 px-4 font-semibold text-slate-700 dark:text-slate-200">${adm.username}</td>
            <td class="py-3 px-4 font-semibold text-slate-500 dark:text-slate-400 monospace">
              <div class="flex items-center gap-2">
                <span id="adm-pwd-text-${adm.username}">••••••</span>
                <span id="adm-pwd-val-${adm.username}" class="hidden">${adm.password}</span>
                <button onclick="toggleAdminDbPassword('${adm.username}')" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition" title="Lihat/Sembunyikan Password">
                  <i data-lucide="eye" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
                </button>
              </div>
            </td>
            <td class="py-3 px-4 text-right">
              <div class="flex justify-end gap-1.5">
                <button onclick="triggerEditAdmin('${adm.username}')" class="p-1.5 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded-lg transition" title="Edit Password Admin">
                  <i data-lucide="edit" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
                </button>
                <button onclick="triggerAdminDelete('${adm.username}')" class="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition" title="Hapus Admin">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      });
      lucide.createIcons();
    }

    window.toggleAdminDbPassword = function(username) {
      const textSpan = document.getElementById(`adm-pwd-text-${username}`);
      const valSpan = document.getElementById(`adm-pwd-val-${username}`);
      if (textSpan && valSpan) {
        if (textSpan.classList.contains('hidden')) {
          textSpan.classList.remove('hidden');
          valSpan.classList.add('hidden');
        } else {
          textSpan.classList.add('hidden');
          valSpan.classList.remove('hidden');
        }
      }
    };

    window.triggerEditAdmin = function(username) {
      if (!firebaseUser) return;
      const admin = ALL_ADMINS.find(a => a.username === username);
      if (!admin) return;
      showConfirmation("Edit Data Admin", `
        <div class="space-y-2 text-xs text-left text-slate-800 dark:text-slate-100">
          <label class="font-bold text-slate-400 uppercase tracking-wider block">Username</label>
          <input id="e-adm-un" value="${admin.username}" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50">
          
          <label class="font-bold text-slate-400 uppercase tracking-wider block mt-2">Password Baru</label>
          <div class="relative">
            <input type="password" id="e-adm-p" value="${admin.password}" class="w-full p-2 pr-10 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50">
            <button type="button" onclick="const p = document.getElementById('e-adm-p'); p.type = p.type === 'password' ? 'text' : 'password'; this.querySelector('i').classList.toggle('fa-eye'); this.querySelector('i').classList.toggle('fa-eye-slash');" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <i class="fas fa-eye"></i>
            </button>
          </div>
        </div>
      `, async () => {
        const newUsername = document.getElementById('e-adm-un').value.trim();
        const p = document.getElementById('e-adm-p').value.trim();
        if (!newUsername || !p) {
          showNotification("Input Gagal", "Username dan password wajib diisi!", "danger");
          return;
        }
        if (newUsername.toLowerCase() !== username.toLowerCase() && ALL_ADMINS.some(a => a.username.toLowerCase() === newUsername.toLowerCase())) {
          showNotification("Input Gagal", "Username admin sudah terdaftar!", "danger");
          return;
        }
        toggleLoader(true, "Mengupdate Admin...");
        try {
          const updatedAdmin = { ...admin, username: newUsername, password: p };
          if (newUsername !== username) {
            await deleteDoc(getPublicDoc("Admin", username));
          }
          await setDoc(getPublicDoc("Admin", newUsername), updatedAdmin);
          
          const isSelf = CURRENT_USER && CURRENT_USER.username === username;
          if (isSelf && newUsername !== username) {
            CURRENT_USER.username = newUsername;
            mySessionStorage.setItem('cbt-session', JSON.stringify(CURRENT_USER));
            // Update UI profile name if self is edited
            const selfNameEl = document.getElementById('header-profile-name');
            if (selfNameEl) selfNameEl.innerText = newUsername;
          }

          const idx = ALL_ADMINS.findIndex(a => a.username === username);
          if (idx >= 0) {
            if (newUsername !== username) {
              ALL_ADMINS.splice(idx, 1);
              ALL_ADMINS.push(updatedAdmin);
            } else {
              ALL_ADMINS[idx] = updatedAdmin;
            }
          }
          renderAdminsCards();
          showNotification("Sukses", "Data admin berhasil diperbarui!", "success");
        } catch (e) {
          showNotification("Gagal", e.message, "danger");
        } finally {
          toggleLoader(false);
        }
      });
    };

    window.triggerAdminDelete = function(username) {
      if (!firebaseUser) return;
      if (CURRENT_USER && CURRENT_USER.username === username) {
        showNotification("Gagal", "Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif!", "danger");
        return;
      }
      showConfirmation("Hapus Admin", `Yakin ingin menghapus administrator ${username}?`, async () => {
        toggleLoader(true, "Menghapus Admin...");
        try {
          await deleteDoc(getPublicDoc("Admin", username));
          ALL_ADMINS = ALL_ADMINS.filter(a => a.username !== username);
          renderAdminsCards();
          showNotification("OK", "Admin berhasil dihapus.", "success");
        } catch (e) {
          showNotification("Gagal", e.message || "Gagal menghapus admin.", "danger");
        } finally {
          toggleLoader(false);
        }
      });
    };

    async function handleAddAdminManual() {
      if (!firebaseUser) return;
      showConfirmation("Tambah Admin", `
        <div class="space-y-2 text-xs text-left text-slate-800 dark:text-slate-100">
          <label class="font-bold text-slate-400 uppercase tracking-wider block">Username</label>
          <input id="new-adm-un" placeholder="Contoh: proktor2" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50">
          
          <label class="font-bold text-slate-400 uppercase tracking-wider block mt-2">Password</label>
          <div class="relative">
            <input type="password" id="new-adm-p" placeholder="••••••••" class="w-full p-2 pr-10 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50">
            <button type="button" onclick="const p = document.getElementById('new-adm-p'); p.type = p.type === 'password' ? 'text' : 'password'; this.querySelector('i').classList.toggle('fa-eye'); this.querySelector('i').classList.toggle('fa-eye-slash');" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <i class="fas fa-eye"></i>
            </button>
          </div>
        </div>
      `, async () => {
        const un = document.getElementById('new-adm-un').value.trim();
        const p = document.getElementById('new-adm-p').value.trim();
        if (!un || !p) {
          showNotification("Input Gagal", "Username dan password wajib diisi!", "danger");
          return;
        }
        if (ALL_ADMINS.some(a => a.username.toLowerCase() === un.toLowerCase())) {
          showNotification("Input Gagal", "Username admin sudah terdaftar!", "danger");
          return;
        }
        toggleLoader(true, "Menyimpan Admin...");
        try {
          const newAdmin = { username: un, password: p };
          await setDoc(getPublicDoc("Admin", un), newAdmin);
          ALL_ADMINS.push(newAdmin);
          renderAdminsCards();
          showNotification("OK", "Admin berhasil disimpan", "success");
        } catch (e) {
          showNotification("Gagal", e.message || "Gagal menyimpan admin.", "danger");
        } finally {
          toggleLoader(false);
        }
      });
    }

    // Perubahan: Menghapus token kuncian sesi ketika jadwal baru ditambahkan
    async function handleAddSchedule() {
      if (!firebaseUser) return; if (!ALL_PACKETS.length) return showNotification("Kosong", "Buat paket dulu", "danger");
      const uc = [...new Set(ALL_STUDENTS.map(s => s.kelas))].sort(sortClassStrings).map(c=>`<label class="flex items-center gap-1"><input type="checkbox" name="sc" value="${c}" class="rounded text-primary"> <span class="text-[10px]">${c}</span></label>`).join('');
      showConfirmation("Jadwal", `<div class="space-y-2 text-xs"><input id="s-m" placeholder="Mapel" class="w-full p-2 border rounded"><select id="s-p" class="w-full p-2 border rounded"><option value="">Pilih</option>${ALL_PACKETS.map(p=>`<option value="${p.id_paket}">${p.nama_paket}</option>`).join('')}</select><input type="datetime-local" id="s-dt" class="w-full p-2 border rounded"><input type="number" id="s-d" placeholder="Durasi(Menit)" class="w-full p-2 border rounded"><div id="s-end-preview" class="text-[10px] text-slate-600 dark:text-slate-400">Waktu selesai: -</div><div class="flex flex-wrap gap-2">${uc}</div></div>`, async()=>{
        const m=document.getElementById('s-m').value, p=document.getElementById('s-p').value, dt=document.getElementById('s-dt').value, dr=parseInt(document.getElementById('s-d').value,10), cl=Array.from(document.querySelectorAll('input[name="sc"]:checked')).map(cb=>cb.value);
        if(!m||!p||!dt||!dr||!cl.length){ showNotification("Input Gagal", "Semua kolom wajib diisi dan pilih kelas.", "danger"); return; }
        const tk = Array.from({length: 6}, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join(''), id=`sch_${Date.now()}`; 
        toggleLoader(true); 
        try{ 
          const newSched = {id, mapel:m, id_paket:p, mulai:dt, durasi:dr, kelas_terpilih:cl, token:tk};
          await setDoc(getPublicDoc("Jadwal Ujian", id), newSched);
          ALL_SCHEDULES.push(newSched);
          renderSchedules();
          renderDashboardActiveExamsTable();
          mySessionStorage.removeItem('tokens_generated_session'); 
          showNotification("OK", "Token: "+tk, "success"); 
        }catch(e){ showNotification("Gagal", e.message || "Tidak dapat menyimpan jadwal.", "danger"); }finally{toggleLoader(false);}
      });
      attachScheduleEndPreview('s-dt','s-d','s-end-preview');

    }

    function attachScheduleEndPreview(startId, durationId, previewId) {
      const updateScheduleEndPreview = () => {
        const dtEl = document.getElementById(startId);
        const durEl = document.getElementById(durationId);
        const preview = document.getElementById(previewId);
        if (!preview) return;
        const dt = dtEl?.value;
        const dur = Number(durEl?.value);
        if (!dt || !dur || dur <= 0) {
          preview.textContent = 'Waktu selesai: -';
          return;
        }
        const endDate = new Date(new Date(dt).getTime() + dur * 60000);
        preview.textContent = `Waktu selesai: ${endDate.toLocaleString('id-ID', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`;
      };
      ['input', 'change'].forEach(evt => {
        const dtEl = document.getElementById(startId);
        const durEl = document.getElementById(durationId);
        if (dtEl) dtEl.addEventListener(evt, updateScheduleEndPreview);
        if (durEl) durEl.addEventListener(evt, updateScheduleEndPreview);
      });
      updateScheduleEndPreview();
    }

    // Hanya dapat dieksekusi 1 kali per sesi browser proktor, kecuali jika jadwal diubah
    async function handleGenerateAllTokens() {
      if (!firebaseUser) return; 
      if (!ALL_SCHEDULES.length) return;

      if (mySessionStorage.getItem('tokens_generated_session') === 'true') {
        showNotification("Akses Dibatasi", "Generate token hanya diizinkan maksimal 1 kali setiap sesi ujian proktor!", "danger");
        return;
      }

      showConfirmation("Token Baru", "Regenerate semua token? Tindakan ini hanya dapat dilakukan 1 kali saja per sesi.", async () => {
        toggleLoader(true);
        try {
          const updatedSchedules = ALL_SCHEDULES.map(s => ({
            ...s,
            token: Array.from({length: 6}, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join('')
          }));
          const b = writeBatch(db);
          updatedSchedules.forEach(s => {
            b.update(getPublicDoc("Jadwal Ujian", s.id), s);
          });
          await b.commit();
          ALL_SCHEDULES = updatedSchedules;
          updateAdminTokenBars();
          renderSchedules();
          renderDashboardActiveExamsTable();
          mySessionStorage.setItem('tokens_generated_session', 'true');
          const btn = document.getElementById('btn-generate-all-tokens');
          if (btn) {
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            btn.disabled = true;
          }
          showNotification("OK", "Selesai memperbarui token aktif sesi ini.", "success");
        } catch (e) {
          showNotification("Gagal", e.message, "danger");
        } finally {
          toggleLoader(false);
        }
      });
    }

    // ================= SIKAT PENGIKAT EVENT UTAMA =================
    function setupInteractiveListeners() {
      const safeAdd = (id, event, callback) => { const el = document.getElementById(id); if (el) el.addEventListener(event, callback); };

      safeAdd('toggle-theme-auth', 'click', toggleTheme); safeAdd('toggle-theme-main', 'click', toggleTheme);
      safeAdd('student-login-form', 'submit', handleStudentLogin); safeAdd('admin-login-form', 'submit', handleAdminLogin);
      safeAdd('btn-trigger-admin-modal', 'click', () => document.getElementById('admin-auth-modal').classList.remove('hidden'));
      safeAdd('btn-close-admin-modal', 'click', () => document.getElementById('admin-auth-modal').classList.add('hidden'));

      safeAdd('toggle-auth-password', 'click', () => { const i = document.getElementById('login-password'); if (i) i.type = i.type === 'password' ? 'text' : 'password'; });
      safeAdd('toggle-admin-password', 'click', () => { const i = document.getElementById('admin-password'); if (i) i.type = i.type === 'password' ? 'text' : 'password'; });

      safeAdd('btn-mobile-nav', 'click', () => { if (CURRENT_USER?.role === 'student') toggleMobileSheet(true); });
      
      safeAdd('btn-collapse-sidebar', 'click', () => {
        sidebarCollapsed = !sidebarCollapsed; const sb = document.getElementById('system-sidebar'), hd = document.getElementById('sidebar-header'), lg = document.getElementById('sidebar-logo-text'), bc = document.getElementById('btn-collapse-sidebar');
        const lw = document.getElementById('logout-wrapper'), lo = document.getElementById('btn-sidebar-logout');
        
        if (sb) {
          // Animasi transisi lebar samping
          sb.classList.add('transition-all', 'duration-300', 'ease-in-out');
          if (sidebarCollapsed) {
            sb.className = "hidden md:flex flex-col w-16 bg-primary text-slate-200 border-r border-slate-800 shrink-0 relative z-30 shadow-2xl overflow-hidden transition-all duration-300 ease-in-out";
            if (hd) { hd.className = "h-16 flex items-center justify-center px-0 border-b border-white/10 transition-all duration-300 ease-in-out"; }
            if (lg) { lg.className = "text-xl sm:text-2xl font-black tracking-tight uppercase whitespace-nowrap overflow-hidden pr-0 max-w-0 opacity-0 inline-block transition-all duration-300 ease-in-out"; } 
            if (bc) { bc.className = "p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white shrink-0 flex items-center justify-center w-8 h-8 mx-auto px-0 transition-all duration-300 ease-in-out"; }
            if (lw) { lw.className = "p-0 py-4 border-t border-white/10 flex justify-center transition-all duration-300 ease-in-out"; }
            if (lo) { lo.className = "flex items-center justify-center gap-0 p-2.5 rounded-xl bg-red-600/15 hover:bg-red-600/25 text-red-400 font-bold text-xs transition-all duration-300 ease-in-out"; }
            
            document.querySelectorAll('#system-sidebar .nav-text').forEach(t => {
              t.className = "nav-text text-xs whitespace-nowrap overflow-hidden max-w-0 opacity-0 inline-block transition-all duration-300 ease-in-out";
            });
            document.querySelectorAll('#admin-nav-links .nav-btn').forEach(btn => { 
              const isCurrent = btn.classList.contains('bg-white/10');
              btn.className = `nav-btn w-full flex items-center gap-0 py-2.5 rounded-xl ${isCurrent ? 'bg-white/10 text-white font-bold' : 'hover:bg-white/5 text-slate-300'} mx-auto justify-center px-0 transition-all duration-300 ease-in-out`; 
            });
          } else {
            sb.className = "hidden md:flex flex-col w-max min-w-[240px] bg-primary text-slate-200 border-r border-slate-800 shrink-0 relative z-30 shadow-2xl overflow-hidden transition-all duration-300 ease-in-out";
            if (hd) { hd.className = "h-16 flex items-center justify-between px-4 border-b border-white/10 transition-all duration-300 ease-in-out"; }
            if (lg) { 
              lg.className = "text-xl sm:text-2xl font-black tracking-tight uppercase whitespace-nowrap overflow-hidden pr-2 max-w-xs opacity-100 inline-block transition-all duration-300 ease-in-out"; 
            } 
            if (bc) { bc.className = "p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white shrink-0 flex items-center justify-center w-8 h-8 transition-all duration-300 ease-in-out"; }
            if (lw) { lw.className = "p-4 border-t border-white/10 transition-all duration-300 ease-in-out"; }
            if (lo) { lo.className = "w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-red-600/15 hover:bg-red-600/25 text-red-400 font-bold text-xs transition-all duration-300 ease-in-out"; }
            
            document.querySelectorAll('#system-sidebar .nav-text').forEach(t => {
              t.className = "nav-text text-xs whitespace-nowrap overflow-hidden max-w-xs opacity-100 inline-block transition-all duration-300 ease-in-out";
            });
            document.querySelectorAll('#admin-nav-links .nav-btn').forEach(btn => { 
              const isCurrent = btn.classList.contains('bg-white/10');
              btn.className = `nav-btn w-full flex items-center gap-3 py-2.5 rounded-xl ${isCurrent ? 'bg-white/10 text-white font-bold' : 'hover:bg-white/5 text-slate-300'} mx-auto px-4 transition-all duration-300 ease-in-out`; 
            });
          }
        }
      });

      document.querySelectorAll('.nav-btn').forEach(btn => {
        const viewId = btn.getAttribute('data-nav');
        if (viewId) btn.addEventListener('click', () => switchView(viewId));
      });

      safeAdd('btn-sidebar-logout', 'click', handleLogout); safeAdd('btn-mobile-logout', 'click', handleLogout);
      safeAdd('excel-import-file', 'change', handleExcelImportSiswa); safeAdd('docx-import-file', 'change', handleDOCXImportSoal); safeAdd('import-database-file', 'change', handleImportDatabase);
      safeAdd('btn-download-template', 'click', downloadSiswaTemplate); safeAdd('btn-download-word-template', 'click', downloadWordTemplate); safeAdd('btn-add-student-manual', 'click', handleAddStudentManual);
      safeAdd('btn-download-kartu-ujian', 'click', handleDownloadKartuUjian);
      safeAdd('btn-add-admin', 'click', handleAddAdminManual);
      safeAdd('btn-add-schedule', 'click', handleAddSchedule); safeAdd('btn-export-database', 'click', handleExportDatabase); safeAdd('btn-truncate-answers', 'click', handleTruncateAnswers);
      safeAdd('btn-purge-database', 'click', askPurgeDatabaseTotal); safeAdd('btn-generate-all-tokens', 'click', handleGenerateAllTokens); safeAdd('btn-force-refresh-stats', 'click', () => refreshCachedDashboardStats(true)); safeAdd('btn-refresh-database', 'click', askRefreshDatabase);
      
      window.toggleAdminDbPassword = toggleAdminDbPassword;
      window.triggerEditAdmin = triggerEditAdmin;
      window.triggerAdminDelete = triggerAdminDelete;

      safeAdd('btn-save-manual-question', 'click', (e) => { e.preventDefault(); handleSaveManualQuestion(); });
      safeAdd('btn-clear-manual-question', 'click', (e) => { e.preventDefault(); clearManualQuestionTextarea(); });
      safeAdd('tab-banksoal-create', 'click', () => setBankSoalTab('create'));
      safeAdd('tab-banksoal-packets', 'click', () => setBankSoalTab('packets'));
      safeAdd('tab-banksoal-view', 'click', () => setBankSoalTab('view'));
      safeAdd('btn-reset-all-sessions', 'click', handleResetAllSessions); safeAdd('btn-export-results-excel', 'click', handleExportResultsExcel);
      
      const ss = document.getElementById('search-student'); if(ss) ss.addEventListener('input', renderStudentsCards);
      const fs = document.getElementById('filter-student-class'); if(fs) fs.addEventListener('change', renderStudentsCards);
      const ms = document.getElementById('filter-monitor-search'); if(ms) ms.addEventListener('input', renderActiveMonitorList);
      const mk = document.getElementById('filter-monitor-kelas'); if(mk) mk.addEventListener('change', renderActiveMonitorList);
      const mt = document.getElementById('filter-monitor-status'); if(mt) mt.addEventListener('change', renderActiveMonitorList);
      const rs = document.getElementById('filter-result-search'); if(rs) rs.addEventListener('input', renderResultsCards);
      const rk = document.getElementById('filter-result-kelas'); if(rk) rk.addEventListener('change', renderResultsCards);
      const rm = document.getElementById('filter-result-mapel'); if(rm) rm.addEventListener('change', renderResultsCards);
      const rsort = document.getElementById('filter-result-sort'); if(rsort) rsort.addEventListener('change', renderResultsCards);
      const rp = document.getElementById('result-page-size'); if(rp) rp.addEventListener('change', renderResultsCards);
      const fb = document.getElementById('filter-banksoal-packet'); if (fb) fb.addEventListener('change', renderBankSoalQuestionList);
      const sq = document.getElementById('search-banksoal-question'); if (sq) sq.addEventListener('input', renderBankSoalQuestionList);
      document.querySelectorAll('.banksoal-image-uploader').forEach(input => input.addEventListener('change', handleBankSoalImageUpload));

      // Dashboard Search Mapel Listener
      const sdm = document.getElementById('search-dashboard-mapel'); if(sdm) sdm.addEventListener('input', renderDashboardActiveExamsTable);
      
      // Perubahan: Menghubungkan listener filter kelas di Dashboard
      const fdk = document.getElementById('filter-dashboard-kelas'); if(fdk) fdk.addEventListener('change', renderDashboardActiveExamsTable);

      // Student Controls Bindings
      safeAdd('btn-toggle-doubt', 'click', () => { const q = EXAM_STATE.scrambledQuestions[EXAM_STATE.currentIndex]; if (!q) return; EXAM_STATE.doubts[q.id] = !EXAM_STATE.doubts[q.id]; saveExamStateToLocal(); renderExamQuestion(); });
      safeAdd('btn-prev-question', 'click', () => { if (EXAM_STATE.currentIndex > 0) { EXAM_STATE.currentIndex--; saveExamStateToLocal(); renderExamQuestion(); } });
      safeAdd('btn-next-question', 'click', () => { if (EXAM_STATE.currentIndex < EXAM_STATE.scrambledQuestions.length - 1) { EXAM_STATE.currentIndex++; saveExamStateToLocal(); renderExamQuestion(); } });
      safeAdd('btn-finish-exam', 'click', () => {
        const t = EXAM_STATE.scrambledQuestions.length, a = Object.keys(EXAM_STATE.answers).length, d = Object.values(EXAM_STATE.doubts).some(v=>v);
        if (d || a < t) return showNotification("Belum Selesai", "Periksa kembali naskah ragu-ragu dan lengkapi jawaban.", "danger");
        showConfirmation("Selesai Ujian", "Yakin ingin menyelesaikan ujian?", async () => { stopAntiCheatEngines(); clearInterval(EXAM_STATE.timerInterval); toggleLoader(true, "Mengirim..."); await finalizeExamAnswersAndGrade("Kirim Manual"); }, "check-check");
      });
      safeAdd('btn-close-sheet', 'click', () => toggleMobileSheet(false));
      safeAdd('btn-close-sheet-drag', 'click', () => toggleMobileSheet(false));
    }

    async function initStudentExamView() {
      toggleLoader(true, "Mempersiapkan ujian..."); stopAdminRealtimeListeners();
      try {
        const schedDoc = await getDoc(getPublicDoc("Jadwal Ujian", CURRENT_USER.activeScheduleId));
        const pktDoc = await getDoc(getPublicDoc("Bank Soal", CURRENT_USER.activePacketId));
        if (!schedDoc.exists() || !pktDoc.exists()) throw new Error("Sesi ujian tidak tersedia. Silakan hubungi proktor.");
        const sched = schedDoc.data(); const pkt = pktDoc.data();
        if (sched.mulai) {
          const startMs = new Date(sched.mulai).getTime();
          const durMs = (sched.durasi || 60) * 60 * 1000;
          const endMs = startMs + durMs;
          const nowMs = Date.now();
          if (nowMs < startMs) {
            throw new Error("Ujian belum dimulai.");
          } else if (nowMs > endMs) {
            throw new Error("Ujian telah selesai.");
          }
        } else {
          throw new Error("Jadwal ujian belum valid (waktu mulai belum diatur).");
        }
        sched.id = sched.id || CURRENT_USER.activeScheduleId;
        pkt.id_paket = pkt.id_paket || CURRENT_USER.activePacketId;
        EXAM_STATE.packet = pkt; EXAM_STATE.schedule = sched;
        document.querySelectorAll('.watermark-nis').forEach(w => w.innerText = CURRENT_USER.nis);
        const ls = myLocalStorage.getItem(`ar_cbt_state_${sched.id}_${CURRENT_USER.nis}`);
        let s = null;
        if (ls) {
          try { s = JSON.parse(ls); } catch (err) { s = null; }
        }
        
        // Cek data session di database (cloud state dari Jawaban Siswa) jika local storage kosong
        if (!s) {
          const ansDoc = await getDoc(getPublicDoc("Jawaban Siswa", `${sched.id}_${CURRENT_USER.nis}`));
          if (ansDoc.exists() && ansDoc.data().status === 'Proses') {
            const cloudData = ansDoc.data().jawaban;
            if (cloudData && cloudData.scrambledQuestions && cloudData.scrambledQuestions.length > 0) {
              s = cloudData;
            }
          }
        }

        if (s) {
          EXAM_STATE.answers = s.answers || {};
          EXAM_STATE.doubts = s.doubts || {};
          EXAM_STATE.scrambledQuestions = s.scrambledQuestions || [];
          EXAM_STATE.scrambledOptions = s.scrambledOptions || {};
          EXAM_STATE.currentIndex = Number.isInteger(s.currentIndex) ? s.currentIndex : 0;
          EXAM_STATE.timeRemaining = typeof s.timeRemaining === 'number' ? s.timeRemaining : (sched.durasi || 0) * 60;
        } else {
          EXAM_STATE.scrambledQuestions = [...(pkt.daftar_soal || [])].sort(() => Math.random() - 0.5);
          EXAM_STATE.scrambledQuestions.forEach(q => { EXAM_STATE.scrambledOptions[q.id] = [...(q.opsi || [])].sort(() => Math.random() - 0.5); });
          EXAM_STATE.currentIndex = 0;
          EXAM_STATE.timeRemaining = (sched.durasi || 0) * 60;
          saveExamStateToLocal();
        }
        const nEl = document.getElementById('exam-student-name'), idEl = document.getElementById('exam-student-identity');
        if (nEl) nEl.innerText = CURRENT_USER.nama;
        if (idEl) idEl.innerText = `NIS: ${CURRENT_USER.nis} | Kelas: ${CURRENT_USER.kelas}`;
        switchView('student-exam'); startAntiCheatEngines(); requestFullscreenMode(); startExamTimer(); renderExamQuestion();
      } catch (err) {
        showNotification("Sesi Error", err.message, "danger");
        handleLogout();
      } finally {
        toggleLoader(false);
      }
    }

    function renderExamQuestion() {
      const q = EXAM_STATE.scrambledQuestions[EXAM_STATE.currentIndex];
      const nEl = document.getElementById('exam-question-number');
      const tEl = document.getElementById('exam-question-text');
      const mb = document.getElementById('exam-media-placeholder');
      const mi = document.getElementById('exam-question-image');
      const db = document.getElementById('btn-toggle-doubt');
      const oc = document.getElementById('exam-options-container');

      if (!q) {
        if (nEl) nEl.innerText = '0';
        if (tEl) tEl.innerText = 'Tidak ada soal tersedia.';
        if (mb) mb.classList.add('hidden');
        if (db) db.className = "px-3 py-1 sm:px-4 sm:py-1.5 rounded-lg border text-[10px] sm:text-xs font-bold flex items-center gap-1.5 transition bg-slate-100 dark:bg-slate-800 text-slate-500 border-slate-300 dark:border-slate-700";
        if (oc) oc.innerHTML = `<div class="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 text-sm">Belum ada soal pada paket ini.</div>`;
        updateExamProgressUI(); renderDesktopMapGrid();
        return;
      }

      if (nEl) nEl.innerText = EXAM_STATE.currentIndex + 1;
      if (tEl) {
        tEl.innerHTML = sanitizeHtmlContent(q.soal || '-');
      }
      const currentQuestionImageAsset = normalizeImageAsset(q.image);
      if (currentQuestionImageAsset && mi && mb) {
        mi.src = currentQuestionImageAsset.data;
        mb.classList.remove('hidden');
      } else if (mb) mb.classList.add('hidden');
      if (db) {
        if (EXAM_STATE.doubts[q.id]) db.className = "px-3 py-1 sm:px-4 sm:py-1.5 rounded-lg border text-[10px] sm:text-xs font-bold flex items-center gap-1.5 transition bg-amber-500 border-amber-500 text-white";
        else db.className = "px-3 py-1 sm:px-4 sm:py-1.5 rounded-lg border text-[10px] sm:text-xs font-bold flex items-center gap-1.5 transition bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300";
      }
      if (oc) {
        oc.innerHTML = "";
        const so = (EXAM_STATE.scrambledOptions && EXAM_STATE.scrambledOptions[q.id]) ? EXAM_STATE.scrambledOptions[q.id] : (q.opsi || []);
        so.forEach(opt => {
          const chk = EXAM_STATE.answers[q.id] === opt.key;
          const d = document.createElement('div');
          d.className = `p-3 rounded-xl border cursor-pointer transition flex items-start gap-2.5 ${chk ? 'bg-primary/5 border-primary text-primary dark:border-accent dark:text-accent font-semibold' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-200 hover:border-slate-300'}`;
          d.onclick = () => { EXAM_STATE.answers[q.id] = opt.key; saveExamStateToLocal(); renderExamQuestion(); syncStudentActiveProgress(); };
          const optText = sanitizeHtmlContent(opt.text || '-');
          d.innerHTML = `<span class="monospace text-[10px] sm:text-xs font-extrabold w-5 h-5 sm:w-6 sm:h-6 rounded-lg flex items-center justify-center shrink-0 ${chk ? 'bg-primary text-white dark:bg-accent dark:text-slate-950' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}">${opt.key}</span><p class="text-[10px] sm:text-sm font-semibold leading-relaxed mt-0.5">${optText}</p>`;
          oc.appendChild(d);
        });
      }
      updateExamProgressUI(); renderDesktopMapGrid();
    }

    function saveExamStateToLocal() {
      if (!EXAM_STATE.schedule?.id || !CURRENT_USER?.nis) return;
      myLocalStorage.setItem(`ar_cbt_state_${EXAM_STATE.schedule.id}_${CURRENT_USER.nis}`, JSON.stringify(EXAM_STATE));
    }

    async function syncStudentActiveProgress() {
      if (!firebaseUser || !CURRENT_USER || CURRENT_USER.role === 'admin') return;
      try {
        const id = `${CURRENT_USER.activeScheduleId}_${CURRENT_USER.nis}`;
        // Simpan status ringan ke Session Ujian (kolom yang sudah ada)
        await setDoc(getPublicDoc("Session Ujian", id), {
          waktu_terakhir: new Date().toISOString(),
          progress_total: Object.keys(EXAM_STATE.answers).length,
          total_soal: EXAM_STATE.scrambledQuestions.length,
          cheat_detected: (EXAM_STATE.cheatTabCount > 0 || EXAM_STATE.cheatFocusCount > 0)
        }, { merge: true }); // MENCEGAH PENGHAPUSAN WAKTU LOGIN AWAL
        // Simpan seluruh state ke Jawaban Siswa (kolom jawaban yang sudah ada)
        await setDoc(getPublicDoc("Jawaban Siswa", id), {
          id,
          nis: CURRENT_USER.nis,
          nama: CURRENT_USER.nama,
          kelas: CURRENT_USER.kelas,
          mapel: EXAM_STATE.schedule?.mapel || '',
          waktu_kirim: new Date().toISOString(),
          status: 'Proses',
          jawaban: {
            answers: EXAM_STATE.answers || {},
            doubts: EXAM_STATE.doubts || {},
            scrambledQuestions: EXAM_STATE.scrambledQuestions || [],
            scrambledOptions: EXAM_STATE.scrambledOptions || {},
            currentIndex: EXAM_STATE.currentIndex || 0,
            timeRemaining: EXAM_STATE.timeRemaining || 0
          }
        });
      } catch (e) { console.warn('syncStudentActiveProgress failed', e); }
    }

    function updateExamProgressUI() {
      const t = EXAM_STATE.scrambledQuestions.length;
      const a = Object.keys(EXAM_STATE.answers).length;
      const percent = t > 0 ? Math.round((a / t) * 100) : 0;
      const ep = document.getElementById('exam-progress-percent');
      const eb = document.getElementById('exam-progress-bar');
      if (ep) ep.innerText = `${percent}%`;
      if (eb) eb.style.width = `${percent}%`;
      const pb = document.getElementById('btn-prev-question');
      const nb = document.getElementById('btn-next-question');
      const fb = document.getElementById('btn-finish-exam');
      if (pb) {
        if (EXAM_STATE.currentIndex === 0 || t === 0) pb.classList.add('opacity-40', 'pointer-events-none');
        else pb.classList.remove('opacity-40', 'pointer-events-none');
      }
      if (nb && fb) {
        if (t === 0) {
          nb.classList.add('hidden');
          fb.classList.add('hidden');
        } else if (EXAM_STATE.currentIndex === t - 1) {
          nb.classList.add('hidden');
          fb.classList.remove('hidden');
        } else {
          nb.classList.remove('hidden');
          fb.classList.add('hidden');
        }
      }
    }

    function renderDesktopMapGrid() {
      const b = (g) => {
        if (!g) return; g.innerHTML = "";
        EXAM_STATE.scrambledQuestions.forEach((q, idx) => {
          const isCur = idx === EXAM_STATE.currentIndex, isAns = EXAM_STATE.answers[q.id] !== undefined, isDbt = EXAM_STATE.doubts[q.id] === true;
          let tm = "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
          if (isDbt) tm = "bg-amber-500 text-white"; else if (isAns) tm = "bg-primary text-white dark:bg-accent dark:text-slate-950";
          const btn = document.createElement('button');
          btn.className = `monospace text-[10px] sm:text-xs font-bold p-2 rounded-lg text-center transition ${tm} ${isCur ? 'ring-2 ring-offset-2 ring-primary dark:ring-accent scale-105' : ''}`;
          btn.innerText = idx + 1;
          btn.onclick = () => { EXAM_STATE.currentIndex = idx; saveExamStateToLocal(); renderExamQuestion(); toggleMobileSheet(false); };
          g.appendChild(btn);
        });
      };
      b(document.getElementById('student-desktop-soal-grid')); b(document.getElementById('exam-desktop-sidebar-grid')); b(document.getElementById('exam-mobile-sheet-grid'));
    }

    function startExamTimer() {
      if (EXAM_STATE.timerInterval) clearInterval(EXAM_STATE.timerInterval);
      if (typeof EXAM_STATE.timeRemaining !== 'number' || isNaN(EXAM_STATE.timeRemaining)) {
        EXAM_STATE.timeRemaining = 0;
      }
      EXAM_STATE.timerInterval = setInterval(() => {
        if (typeof EXAM_STATE.timeRemaining !== 'number' || isNaN(EXAM_STATE.timeRemaining) || EXAM_STATE.timeRemaining <= 0) {
          clearInterval(EXAM_STATE.timerInterval);
          autoSubmitExam("Durasi Habis");
          return;
        }
        EXAM_STATE.timeRemaining--;
        saveExamStateToLocal();
        const hr = Math.floor(EXAM_STATE.timeRemaining / 3600).toString().padStart(2, '0');
        const mn = Math.floor((EXAM_STATE.timeRemaining % 3600) / 60).toString().padStart(2, '0');
        const sc = (EXAM_STATE.timeRemaining % 60).toString().padStart(2, '0');
        const tmr = document.getElementById('exam-countdown-timer');
        if (tmr) tmr.innerText = `${hr}:${mn}:${sc}`;
      }, 1000);
    }

    async function autoSubmitExam(r) { stopAntiCheatEngines(); if(EXAM_STATE.timerInterval) clearInterval(EXAM_STATE.timerInterval); toggleLoader(true, "Mengirim..."); await finalizeExamAnswersAndGrade(r); }

    async function finalizeExamAnswersAndGrade(s) {
      if (!firebaseUser) return;
      try {
        let bc = 0, ic = 0;
        EXAM_STATE.scrambledQuestions.forEach(q => { if (EXAM_STATE.answers[q.id] === (q.correct_key || "A")) bc++; else ic++; });
        const total = EXAM_STATE.scrambledQuestions.length;
        const gr = total > 0 ? Math.round((bc / total) * 100) : 0;
        const id = `${EXAM_STATE.schedule.id}_${CURRENT_USER.nis}`;
        await setDoc(getPublicDoc("Jawaban Siswa", id), { id, nis: CURRENT_USER.nis, nama: CURRENT_USER.nama, kelas: CURRENT_USER.kelas, mapel: EXAM_STATE.schedule.mapel, waktu_kirim: new Date().toISOString(), status: 'Selesai', jawaban: EXAM_STATE.answers, urutan_soal: EXAM_STATE.scrambledQuestions.map(q => q.id), jumlah_benar: bc, jumlah_salah: ic, nilai: gr, penjelasan: s });
        await deleteDoc(getPublicDoc("Session Ujian", `${EXAM_STATE.schedule.id}_${CURRENT_USER.nis}`));
        myLocalStorage.removeItem(`ar_cbt_state_${EXAM_STATE.schedule.id}_${CURRENT_USER.nis}`);
        // Cek apakah admin mengizinkan siswa melihat nilai
        const showScore = EXAM_STATE.schedule?.tampil_nilai === true;
        const alertMsg = showScore 
          ? `Ujian Selesai! Nilai Akhir Anda: ${gr}` 
          : "Ujian Selesai! Jawaban Anda telah sukses terkirim ke server.";
        
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(err => console.warn(err));
        }
        const btnConfirm = document.getElementById('dialog-btn-confirm');
        const originalBtnText = btnConfirm ? btnConfirm.innerText : "Lanjutkan";
        if (btnConfirm) btnConfirm.innerText = "Kembali ke Halaman Utama";
        
        showNotification("Sukses", alertMsg, "success", () => {
          if (btnConfirm) btnConfirm.innerText = originalBtnText;
          handleLogout();
        });
      } catch (err) { showNotification("Gagal", err.message, "danger"); } finally { toggleLoader(false); }
    }

    function handleLogout() {
      mySessionStorage.removeItem('cbt-session');
      if (CURRENT_USER && CURRENT_USER.role !== 'admin' && CURRENT_USER.activeScheduleId && CURRENT_USER.nis) {
        deleteDoc(getPublicDoc("Session Ujian", `${CURRENT_USER.activeScheduleId}_${CURRENT_USER.nis}`)).catch(() => {});
      }
      stopAdminRealtimeListeners();
      stopAntiCheatEngines();
      if (EXAM_STATE.timerInterval) { clearInterval(EXAM_STATE.timerInterval); EXAM_STATE.timerInterval = null; }
      const studentNavBtn = document.getElementById('btn-mobile-nav'); if (studentNavBtn) studentNavBtn.classList.add('hidden');
      toggleMobileSheet(false);
      CURRENT_USER = null;
      document.getElementById('auth-view').classList.remove('hidden');
      document.getElementById('main-system-view').classList.add('hidden');
    }

    window.toggleMobileSheet = function(show) {
      const sheet = document.getElementById('mobile-bottom-sheet');
      if (!sheet) return;
      if (show) {
        sheet.classList.remove('hidden', 'translate-y-full');
      } else {
        sheet.classList.add('translate-y-full', 'hidden');
      }
    }
