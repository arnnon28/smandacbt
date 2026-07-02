    // Database & helper logic loaded from js/cbt-helpers.js

    let firebaseUser = null, CURRENT_USER = null;
    let ALL_STUDENTS = [], ALL_PACKETS = [], ALL_SCHEDULES = [], ALL_RESULTS = [], ACTIVE_MONITOR_DATA = [], ALL_ADMINS = [];
    let EXAM_STATE = { packet: null, schedule: null, currentIndex: 0, answers: {}, doubts: {}, scrambledQuestions: [], scrambledOptions: {}, timeRemaining: 0, timerInterval: null, cheatTabCount: 0, cheatFocusCount: 0 };
    let CACHE_AGGREGATIONS = { timestamp: 0, data: { totalSiswa: 0, totalKelas: 0, totalPaket: 0, totalJadwal: 0, sedangUjian: 0, sudahSubmit: 0 } };
    let unsubscribeStudents = null, unsubscribeSchedules = null, unsubscribeMonitor = null, unsubscribeResults = null, unsubscribePackets = null, unsubscribeAdmins = null;
    let sidebarCollapsed = false;
    const PAGINATION_STATE = { students: 1, monitor: 1, banksoal: 1, results: 1, dashboard: 1, admins: 1 };

    function getPageSizeFromSelect(selectId, defaultSize = 50) {
      const raw = document.getElementById(selectId)?.value || '';
      if (raw === 'all') return Number.MAX_SAFE_INTEGER;
      const parsed = parseInt(raw, 10);
      return Number.isNaN(parsed) ? defaultSize : parsed;
    }

    function getPageNumber(key) {
      return PAGINATION_STATE[key] || 1;
    }

    function setPageNumber(key, value) {
      PAGINATION_STATE[key] = Math.max(1, value);
    }

    function resetPageNumber(key) {
      if (PAGINATION_STATE[key] != null) {
        PAGINATION_STATE[key] = 1;
      }
    }

    function sortClassStrings(a, b) {
      const parse = (value) => {
        const text = String(value || '').toUpperCase().trim();
        const match = text.match(/(\d+)$/);
        return {
          text,
          num: match ? parseInt(match[1], 10) : null,
          prefix: match ? text.slice(0, match.index).trim() : text
        };
      };
      const xa = parse(a);
      const xb = parse(b);
      if (xa.prefix !== xb.prefix) {
        const rank = (prefix) => {
          if (/^XII\b/.test(prefix)) return 3;
          if (/^XI\b/.test(prefix)) return 2;
          if (/^X\b/.test(prefix)) return 1;
          const numeric = prefix.match(/^(\d+)/);
          return numeric ? parseInt(numeric[1], 10) + 0.1 : 100;
        };
        return rank(xa.prefix) - rank(xb.prefix) || xa.prefix.localeCompare(xb.prefix);
      }
      if (xa.num != null && xb.num != null) return xa.num - xb.num;
      if (xa.num != null) return -1;
      if (xb.num != null) return 1;
      return xa.text.localeCompare(xb.text);
    }

    function buildPaginationControls(containerId, currentPage, pageCount, onPageChange) {
      const container = document.getElementById(containerId);
      if (!container) return;
      if (pageCount < 2) {
        container.innerHTML = '';
        return;
      }

      let startPage = Math.max(1, currentPage - 2);
      let endPage = Math.min(pageCount, startPage + 4);
      if (endPage - startPage < 4) {
        startPage = Math.max(1, endPage - 4);
      }

      const pages = [];
      for (let i = startPage; i <= endPage; i++) {
        pages.push(i);
      }

      container.innerHTML = `
        <div class="flex flex-wrap items-center gap-2 justify-center text-[10px] sm:text-xs">
          <button data-page="prev" class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Prev</button>
          ${pages.map(page => `
            <button data-page="${page}" class="px-3 py-1.5 rounded-xl border ${page === currentPage ? 'bg-primary text-white border-primary' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">${page}</button>
          `).join('')}
          <button data-page="next" class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Next</button>
        </div>
      `;

      container.querySelectorAll('button[data-page]').forEach(button => {
        button.addEventListener('click', () => {
          const pageValue = button.getAttribute('data-page');
          if (!pageValue) return;
          let targetPage = currentPage;
          if (pageValue === 'prev') targetPage = Math.max(1, currentPage - 1);
          else if (pageValue === 'next') targetPage = Math.min(pageCount, currentPage + 1);
          else targetPage = Number(pageValue);
          if (targetPage !== currentPage) onPageChange(targetPage);
        });
      });
    }

    async function initAuth() {
      firebaseUser = { uid: "anonymous" };
      return firebaseUser;
    }

    function showNotification(title, message, iconType = 'info', onConfirm = null) {
      const dialog = document.getElementById('confirmation-dialog');
      const titleEl = document.getElementById('dialog-title');
      const messageEl = document.getElementById('dialog-message');
      const iconWrapper = document.getElementById('dialog-icon-wrapper');
      const iconEl = document.getElementById('dialog-icon');
      const btnCancel = document.getElementById('dialog-btn-cancel');
      const btnConfirm = document.getElementById('dialog-btn-confirm');
      if (!dialog || !titleEl || !messageEl || !iconWrapper || !iconEl || !btnConfirm) return;
      titleEl.innerText = title;
      messageEl.innerHTML = message;

      const iconStr = String(iconType).toLowerCase();
      const titleStr = String(title).toLowerCase();
      const isWarning = (
        iconStr.includes('danger') || 
        iconStr.includes('warning') || 
        iconStr.includes('alert') ||
        titleStr.includes('peringatan') ||
        titleStr.includes('danger') ||
        titleStr.includes('gagal')
      );

      let emoticonEl = document.getElementById('dialog-emoticon');
      if (isWarning) {
        dialog.classList.add('warning-modal');
        if (!emoticonEl) {
          emoticonEl = document.createElement('span');
          emoticonEl.id = 'dialog-emoticon';
          emoticonEl.className = 'text-4xl animate-bounce';
          iconWrapper.appendChild(emoticonEl);
        }
        emoticonEl.innerText = '🚨';
        emoticonEl.classList.remove('hidden');
        iconEl.classList.add('hidden');
      } else {
        dialog.classList.remove('warning-modal');
        if (emoticonEl) emoticonEl.classList.add('hidden');
        iconEl.classList.remove('hidden');
      }

      iconWrapper.className = iconType === 'success' ? 'bg-emerald-500/10 text-emerald-500' : iconType === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary';
      iconEl.setAttribute('data-lucide', iconType === 'success' ? 'check-circle' : iconType === 'danger' ? 'alert-triangle' : 'help-circle');
      lucide.createIcons();
      dialog.classList.remove('hidden');
      if (btnCancel) btnCancel.classList.add('hidden');
      btnConfirm.onclick = () => {
        dialog.classList.add('hidden');
        if (onConfirm) onConfirm();
      };
    }

    function showConfirmation(title, message, onConfirm, iconType = 'help-circle', onCancel = null) {
      const dialog = document.getElementById('confirmation-dialog');
      const titleEl = document.getElementById('dialog-title');
      const messageEl = document.getElementById('dialog-message');
      const iconWrapper = document.getElementById('dialog-icon-wrapper');
      const iconEl = document.getElementById('dialog-icon');
      const btnCancel = document.getElementById('dialog-btn-cancel');
      const btnConfirm = document.getElementById('dialog-btn-confirm');
      if (!dialog || !titleEl || !messageEl || !iconWrapper || !iconEl || !btnCancel || !btnConfirm) return;
      titleEl.innerText = title;
      messageEl.innerHTML = message;

      const iconStr = String(iconType).toLowerCase();
      const titleStr = String(title).toLowerCase();

      let resolvedIcon = iconType;
      if (resolvedIcon === 'help-circle' || !resolvedIcon) {
        if (titleStr.includes('hapus') || titleStr.includes('delete') || titleStr.includes('purge') || titleStr.includes('kosongkan')) {
          resolvedIcon = 'trash-2';
        } else if (titleStr.includes('jadwal')) {
          resolvedIcon = 'calendar';
        } else if (titleStr.includes('edit') || titleStr.includes('ubah') || titleStr.includes('tambah') || titleStr.includes('simpan')) {
          resolvedIcon = 'edit-3';
        } else if (titleStr.includes('selesai') || titleStr.includes('kirim') || titleStr.includes('sukses') || titleStr.includes('berhasil')) {
          resolvedIcon = 'check-circle';
        } else if (titleStr.includes('reset') || titleStr.includes('putar') || titleStr.includes('ulang')) {
          resolvedIcon = 'refresh-cw';
        }
      }

      const isWarning = (
        iconStr.includes('alert') ||
        iconStr.includes('triangle') ||
        iconStr.includes('octagon') ||
        iconStr.includes('trash') ||
        iconStr.includes('delete') ||
        resolvedIcon === 'trash-2' ||
        titleStr.includes('hapus') ||
        titleStr.includes('peringatan') ||
        titleStr.includes('danger')
      );

      let emoticonEl = document.getElementById('dialog-emoticon');
      if (isWarning) {
        dialog.classList.add('warning-modal');
        if (!emoticonEl) {
          emoticonEl = document.createElement('span');
          emoticonEl.id = 'dialog-emoticon';
          emoticonEl.className = 'text-4xl animate-bounce';
          iconWrapper.appendChild(emoticonEl);
        }
        emoticonEl.innerText = '🚨';
        emoticonEl.classList.remove('hidden');
        iconEl.classList.add('hidden');
      } else {
        dialog.classList.remove('warning-modal');
        if (emoticonEl) emoticonEl.classList.add('hidden');
        iconEl.classList.remove('hidden');
      }

      let colorClass = 'bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 dark:text-blue-400';
      if (titleStr.includes('jadwal')) {
        colorClass = 'bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 dark:text-blue-400';
      } else if (isWarning) {
        colorClass = 'bg-rose-500/10 text-rose-500 dark:bg-rose-500/20 dark:text-rose-400';
      } else if (
        iconStr.includes('check') ||
        iconStr.includes('success') ||
        resolvedIcon === 'check-circle' ||
        titleStr.includes('selesai') ||
        titleStr.includes('sukses') ||
        titleStr.includes('berhasil')
      ) {
        colorClass = 'bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20 dark:text-emerald-400';
      } else if (
        iconStr.includes('help') ||
        iconStr.includes('question') ||
        resolvedIcon === 'help-circle' ||
        titleStr.includes('tanya') ||
        titleStr.includes('konfirmasi')
      ) {
        colorClass = 'bg-amber-500/10 text-amber-500 dark:bg-amber-500/20 dark:text-accent';
      }

      iconWrapper.className = colorClass;
      iconEl.setAttribute('data-lucide', resolvedIcon);
      lucide.createIcons();
      dialog.classList.remove('hidden');
      btnCancel.classList.remove('hidden');
      btnCancel.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dialog.classList.add('hidden');
        if (typeof onCancel === 'function') onCancel();
      };
      btnConfirm.onclick = async () => {
        dialog.classList.add('hidden');
        try {
          await onConfirm?.();
        } catch (err) {
          console.error('Confirmation callback failed:', err);
        }
      };
      if (typeof fitConfirmationDialogText === 'function') {
        requestAnimationFrame(() => fitConfirmationDialogText());
      }
    }

    // Bind ke window untuk sistem pemicu sebaris
    window.showNotification = showNotification; window.showConfirmation = showConfirmation;

    // Data Default Sistem
    const DEFAULT_SYSTEM_SETTINGS = {
      schoolName: "SMA Negeri 2 Kuningan",
      examTitle: "Asesmen Sumatif Akhir Tahun",
      schoolLogo: "https://iili.io/B5MMKiX.png",
      footerText: "Computer Based Test | by arnnon"
    };

    const elementsToUpdate = {
      headerLogo: null, headerName: null, headerExam: null, footerText: null,
      bannerName: null, inputName: null, inputExam: null, inputLogo: null
    };

    function initElementsCache() {
      elementsToUpdate.headerLogo = document.getElementById('header-school-logo');
      elementsToUpdate.headerName = document.getElementById('header-school-name');
      elementsToUpdate.headerExam = document.getElementById('header-exam-title');
      elementsToUpdate.footerText = document.getElementById('footer-copyright-text');
      elementsToUpdate.bannerName = document.querySelectorAll('.school-name-text');
      elementsToUpdate.inputName = document.getElementById('input-school-name');
      elementsToUpdate.inputExam = document.getElementById('input-exam-title');
      elementsToUpdate.inputLogo = document.getElementById('input-school-logo');
    }

    function renderConfiguredSettings() {
      const currentName = myLocalStorage.getItem('er_sh_name') || DEFAULT_SYSTEM_SETTINGS.schoolName;
      const currentExam = myLocalStorage.getItem('er_ex_title') || DEFAULT_SYSTEM_SETTINGS.examTitle;
      const currentLogo = myLocalStorage.getItem('er_sh_logo') || DEFAULT_SYSTEM_SETTINGS.schoolLogo;

      if (elementsToUpdate.headerName) elementsToUpdate.headerName.textContent = currentName;
      if (elementsToUpdate.headerExam) elementsToUpdate.headerExam.textContent = currentExam;
      if (elementsToUpdate.headerLogo) elementsToUpdate.headerLogo.src = currentLogo;
      if (elementsToUpdate.bannerName) elementsToUpdate.bannerName.forEach(el => el.textContent = currentName.toUpperCase());
      if (elementsToUpdate.inputName) elementsToUpdate.inputName.value = currentName;
      if (elementsToUpdate.inputExam) elementsToUpdate.inputExam.value = currentExam;

      const favicon = document.querySelector('link[rel="icon"]');
      if (favicon) {
        favicon.href = currentLogo;
      }

      if (elementsToUpdate.inputLogo) {
        elementsToUpdate.inputLogo.value = currentLogo.startsWith('data:') || currentLogo === DEFAULT_SYSTEM_SETTINGS.schoolLogo ? '' : currentLogo;
      }
      if (typeof fitAdminHeaderText === 'function') fitAdminHeaderText();
    }

    window.processLocalLogo = function (event) {
      const file = event.target.files[0];
      if (file) {
        if (file.size > 2 * 1024 * 1024) return showNotification("Ukuran file terlalu besar! Maksimal 2MB.", "danger");
        const reader = new FileReader();
        reader.onload = e => { window.tempUploadedLogo = e.target.result; showNotification("Gambar siap! Tekan 'Simpan Perubahan'.", "info"); };
        reader.readAsDataURL(file);
      }
    }

    window.commitSettings = function () {
      const targetName = elementsToUpdate.inputName.value.trim() || DEFAULT_SYSTEM_SETTINGS.schoolName;
      const targetExam = elementsToUpdate.inputExam.value.trim() || DEFAULT_SYSTEM_SETTINGS.examTitle;
      let targetLogo = elementsToUpdate.inputLogo.value.trim();
      if (!targetLogo) targetLogo = window.tempUploadedLogo || myLocalStorage.getItem('er_sh_logo') || DEFAULT_SYSTEM_SETTINGS.schoolLogo;

      myLocalStorage.setItem('er_sh_name', targetName);
      myLocalStorage.setItem('er_ex_title', targetExam);
      myLocalStorage.setItem('er_sh_logo', targetLogo);

      renderConfiguredSettings();
      showNotification("Pengaturan berhasil disimpan!", "success");
    }

    window.resetSettingsToDefault = function () {
      showConfirmation("Reset Pengaturan", "Apakah Anda yakin ingin mengembalikan semua konfigurasi aplikasi ke pengaturan awal/default?", () => {
        myLocalStorage.removeItem('er_sh_name');
        myLocalStorage.removeItem('er_ex_title');
        myLocalStorage.removeItem('er_sh_logo');
        window.tempUploadedLogo = null;
        const logoFileInput = document.getElementById('input-logo-file');
        if (logoFileInput) logoFileInput.value = '';
        renderConfiguredSettings();
        showNotification("Pengaturan telah dikembalikan ke default!", "success");
      }, "refresh-cw");
    }

    window.addEventListener('DOMContentLoaded', async () => {
      lucide.createIcons(); initRealtimeClock(); setupInteractiveListeners(); applyTheme();
      initElementsCache(); renderConfiguredSettings(); initAdminHeaderAutoFit();
      toggleLoader(true, "MENGHUBUNGKAN...");
      try { await initAuth(); checkSavedSession(); } catch (err) { showNotification("Koneksi Gagal", "Gagal menghubungi server.", "danger"); } finally { toggleLoader(false); }
    });

    function initRealtimeClock() {
      setInterval(() => {
        const timeStr = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const c1 = document.getElementById('digital-clock-auth'), c2 = document.getElementById('digital-clock-main'), c3 = document.getElementById('digital-clock-sidebar');
        if (c1) c1.innerText = timeStr; if (c2) c2.innerText = timeStr; if (c3) c3.innerText = timeStr;
      }, 1000);
    }

    window.toggleGlobalClass = function (grade, checked, nameAttr) {
      const checkboxes = document.querySelectorAll(`input[name="${nameAttr}"]`);
      checkboxes.forEach(cb => {
        const val = cb.value.toUpperCase().trim();
        let match = false;
        if (grade === 'X') {
          match = (val.startsWith('X') && !val.startsWith('XI') && !val.startsWith('XII')) || val.startsWith('10') || val.startsWith('KLS X') || val.startsWith('KLS 10');
        } else if (grade === 'XI') {
          match = (val.startsWith('XI') && !val.startsWith('XII')) || val.startsWith('11') || val.startsWith('KLS XI') || val.startsWith('KLS 11');
        } else if (grade === 'XII') {
          match = val.startsWith('XII') || val.startsWith('12') || val.startsWith('KLS XII') || val.startsWith('KLS 12');
        }
        if (match) {
          cb.checked = checked;
        }
      });
    };

    // Mesin Pengubah Tema
    function applyTheme() { if (myLocalStorage.getItem('cbt-dark-mode') === 'true') document.documentElement.classList.add('dark'); else document.documentElement.classList.remove('dark'); }
    function toggleTheme() { myLocalStorage.setItem('cbt-dark-mode', document.documentElement.classList.toggle('dark')); }

    window.switchView = function (viewId) {
      document.querySelectorAll('.page-view').forEach(view => view.classList.add('hidden'));
      const activePage = document.getElementById(`view-${viewId}`);
      if (activePage) activePage.classList.remove('hidden');

      document.querySelectorAll('.nav-btn').forEach(btn => {
        const isMobileNav = btn.closest('#mobile-admin-nav');
        const icon = btn.querySelector('i');
        if (btn.getAttribute('data-nav') === viewId) {
          if (isMobileNav) {
            btn.className = "nav-btn flex flex-col items-center justify-center w-full h-full text-[#3b82f6] transition-colors relative pt-1 active:scale-95";
          } else {
            btn.className = `nav-btn flex items-center px-3 py-2.5 mx-3 mb-1 bg-white/20 text-white rounded-md border border-white/30 shadow-md transition-all duration-300 ${sidebarCollapsed ? 'justify-center px-0' : ''}`;
            if (icon) {
              icon.classList.remove('text-[#9db9d8]');
              icon.classList.add('text-[#3b82f6]');
            }
          }
        } else {
          if (isMobileNav) {
            btn.className = "nav-btn flex flex-col items-center justify-center w-full h-full text-[#b5cbdf] transition-colors relative pt-1 active:scale-95";
          } else {
            btn.className = `nav-btn sidebar-menu-link group flex items-center px-3 py-2.5 mx-3 mb-1 rounded-md text-[#b5cbdf] hover:text-white ${sidebarCollapsed ? 'justify-center px-0' : ''}`;
            if (icon) {
              icon.classList.remove('text-[#3b82f6]');
              icon.classList.add('text-[#9db9d8]');
            }
          }
        }
      });
      const safeViewId = viewId || '';
      const subtitle = document.getElementById('system-subtitle'); if (subtitle) subtitle.innerText = `PANEL UTAMA \u2022 ${safeViewId.toUpperCase().replace('ADMIN-', '')}`;

      const activeSessionBar = document.getElementById('admin-active-session-bar');
      if (activeSessionBar) {
        if (CURRENT_USER && CURRENT_USER.role === 'admin' && safeViewId === 'admin-dashboard') {
          activeSessionBar.classList.remove('hidden');
        } else {
          activeSessionBar.classList.add('hidden');
        }
      }

      toggleMobileSheet(false);
    }

    function toggleLoader(show, text = "MENGOLAH...") {
      const loader = document.getElementById('global-spinner');
      if (!loader) return;
      if (show) {
        // Hanya tampilkan loading untuk proses autentikasi/login dan mengirim jawaban
        const lowerText = text.toLowerCase();
        const isAuth = lowerText.includes('autentikasi') || lowerText.includes('login') || lowerText.includes('masuk');
        const isSend = lowerText.includes('mengirim') || lowerText.includes('kirim') || lowerText.includes('submit');
        if (!isAuth && !isSend) {
          return; // Skip loading screen untuk operasi lain agar instan & ringan
        }
        const txtEl = document.getElementById('global-spinner-text');
        if (txtEl) txtEl.innerText = text;
        loader.classList.remove('hidden');
      } else {
        loader.classList.add('hidden');
      }
    }

    function checkSavedSession() {
      const sessionStr = mySessionStorage.getItem('cbt-session');
      if (!sessionStr) {
        window.location.href = 'index.html';
        return;
      }

      try {
        const user = JSON.parse(sessionStr);
        if (user.role !== 'admin') {
          window.location.href = 'index.html';
          return;
        }
        setupSessionEnvironment(user);
      } catch (err) {
        mySessionStorage.removeItem('cbt-session');
        window.location.href = 'index.html';
      }
    }

    function setupSessionEnvironment(user) {
      CURRENT_USER = user; document.getElementById('main-system-view').classList.remove('hidden');

      const pContainer = document.getElementById('header-profile-container');
      if (pContainer) {
        pContainer.classList.remove('hidden');
        const pName = document.getElementById('header-profile-name');
        const pRole = document.getElementById('header-profile-role');
        if (pName && pRole) {
          pName.textContent = user.username;
          pRole.textContent = 'admin';
        }
      }

      const studentNavBtn = document.getElementById('btn-mobile-nav');
      document.getElementById('admin-nav-links').classList.remove('hidden'); document.getElementById('student-nav-links').classList.add('hidden'); document.getElementById('admin-active-session-bar').classList.remove('hidden');
      const mobNav = document.getElementById('mobile-admin-nav'); if (mobNav) { mobNav.classList.remove('hidden'); mobNav.classList.add('flex', 'md:hidden'); }
      if (studentNavBtn) studentNavBtn.classList.add('hidden');
      switchView('admin-dashboard'); startRealtimeAdminListeners();
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
      const now = Date.now(); if (!force && (now - CACHE_AGGREGATIONS.timestamp < 60000)) { applyDashboardStatsUI(CACHE_AGGREGATIONS.data); updateDatabaseCapacityStats(); return; }
      const stats = { totalSiswa: ALL_STUDENTS.length, totalKelas: new Set(ALL_STUDENTS.map(s => s.kelas)).size, totalPaket: ALL_PACKETS.length, totalJadwal: ALL_SCHEDULES.length, sedangUjian: ACTIVE_MONITOR_DATA.length, sudahSubmit: ALL_RESULTS.filter(r => r.status === 'Selesai').length };
      CACHE_AGGREGATIONS.timestamp = now; CACHE_AGGREGATIONS.data = stats; applyDashboardStatsUI(stats);
      updateDatabaseCapacityStats();
    }

    function updateDatabaseCapacityStats() {
      try {
        const p = {
          "Admin": ALL_ADMINS,
          "Siswa": ALL_STUDENTS,
          "Bank Soal": ALL_PACKETS,
          "Jadwal Ujian": ALL_SCHEDULES,
          "Jawaban Siswa": ALL_RESULTS,
          "Session Ujian": ACTIVE_MONITOR_DATA
        };
        const sizeInBytes = new Blob([JSON.stringify(p)]).size;
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
      const e = (id, v) => { const el = document.getElementById(id); if (el) el.innerText = v; };
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
      const pageSize = getPageSizeFromSelect('students-page-size', 50);
      let pageNumber = getPageNumber('students');

      tbody.innerHTML = "";
      const filtered = ALL_STUDENTS.filter(s => {
        const nis = String(s.nis || '').toLowerCase();
        const nama = String(s.nama || '').toLowerCase();
        return (nis.includes(sv) || nama.includes(sv)) && (!cf || s.kelas === cf);
      }).sort((a, b) => {
        const kelasComp = String(a.kelas || '').localeCompare(String(b.kelas || ''), 'id');
        if (kelasComp !== 0) return kelasComp;
        return String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
      });
      const disp = document.getElementById('student-count-display'); if (disp) disp.innerText = filtered.length;

      if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 font-bold text-xs">Data siswa tidak ditemukan</td></tr>`;
        buildPaginationControls('students-pagination-controls', 1, 0, () => { });
        return;
      }

      const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
      if (pageNumber > pageCount) pageNumber = pageCount;
      setPageNumber('students', pageNumber);
      const pageItems = filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

      pageItems.forEach((s, index) => {
        tbody.innerHTML += `
          <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors border-b border-slate-100 dark:border-slate-800/80">
            <td class="py-3 px-4 font-bold text-slate-500 text-center">${(pageNumber - 1) * pageSize + index + 1}</td>
            <td class="py-3 px-4 font-semibold text-slate-500 dark:text-slate-400 monospace tracking-wide">${s.nis}</td>
            <td class="py-3 px-4 font-extrabold text-slate-700 dark:text-slate-100">${s.nama}</td>
            <td class="py-3 px-4 font-semibold text-slate-700 dark:text-slate-200">${s.jenis_kelamin === 'L' ? 'Laki-Laki' : s.jenis_kelamin === 'P' ? 'Perempuan' : (s.jenis_kelamin || '-')}</td>
            <td class="py-3 px-4 font-bold text-primary dark:text-accent">${s.kelas}</td>
            <td class="py-3 px-4 font-semibold text-slate-500 dark:text-slate-400 monospace">
              <div class="flex items-center gap-2">
                <span id="pwd-text-${s.nis}">\u2022\u2022\u2022\u2022\u2022\u2022</span>
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

      buildPaginationControls('students-pagination-controls', pageNumber, pageCount, (newPage) => {
        setPageNumber('students', newPage);
        renderStudentsCards();
      });
      lucide.createIcons();
    }

    window.toggleStudentPassword = function (nis) {
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

    window.triggerEditStudent = function (nis) {
      if (!firebaseUser) return;
      const student = ALL_STUDENTS.find(s => s.nis === nis);
      if (!student) return;

      showConfirmation("Edit Data Siswa", `
        <div class="space-y-2 text-xs text-left text-slate-800 dark:text-slate-100">
          <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">NIS</label>
          <input id="e-n" value="${student.nis}" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">

          <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block mt-2">Nama Siswa</label>
          <input id="e-nm" value="${student.nama}" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">

          <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block mt-2">Kelas</label>
          <input id="e-k" value="${student.kelas}" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">

          <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block mt-2">Jenis Kelamin</label>
          <select id="e-jk" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">
            <option value="L" ${student.jenis_kelamin === 'L' ? 'selected' : ''}>Laki-laki</option>
            <option value="P" ${student.jenis_kelamin === 'P' ? 'selected' : ''}>Perempuan</option>
          </select>

          <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block mt-2">Password</label>
          <div class="relative">
            <input type="password" id="e-p" value="${student.password}" class="w-full p-2 pr-10 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">
            <button type="button" onclick="const i=document.getElementById('e-p'); i.type=i.type==='password'?'text':'password';" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <i class="fas fa-eye text-sm"></i>
            </button>
          </div>
        </div>
      `, async () => {
        const newNis = document.getElementById('e-n').value.trim();
        const nm = document.getElementById('e-nm').value.trim();
        const k = document.getElementById('e-k').value.trim();
        const jk = document.getElementById('e-jk').value;
        const p = document.getElementById('e-p').value.trim();

        if (!newNis || !nm || !k || !jk || !p) {
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
            jenis_kelamin: jk,
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
      const pageSize = getPageSizeFromSelect('monitor-page-size', 50);
      let pageNumber = getPageNumber('monitor');
      c.innerHTML = "";

      const filtered = ACTIVE_MONITOR_DATA.map(ss => ({ ...ss, prof: ALL_STUDENTS.find(s => s.nis === ss.nis) || { nama: "Unknown", kelas: "-" } }))
        .filter(ss => {
          const nis = String(ss.nis || '').toLowerCase();
          const nama = String(ss.prof.nama || '').toLowerCase();
          return (nis.includes(sv) || nama.includes(sv)) && (!cf || ss.prof.kelas === cf) && (!sf || (sf === 'curang' ? ss.cheat_detected : !ss.cheat_detected));
        })
        .sort((a, b) => {
          const nameA = String(a.prof.nama || '').toLowerCase();
          const nameB = String(b.prof.nama || '').toLowerCase();
          const byName = nameA.localeCompare(nameB, 'id', { sensitivity: 'base' });
          if (byName !== 0) return byName;
          return String(a.nis || '').localeCompare(String(b.nis || ''), 'id', { numeric: true });
        });

      if (!filtered.length) {
        c.innerHTML = `<tr><td colspan="8" class="py-8 text-center text-slate-400 font-bold text-xs">Tidak ada data pengerjaan siswa yang sedang aktif</td></tr>`;
        buildPaginationControls('monitor-pagination-controls', 1, 0, () => { });
        return;
      }

      const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
      if (pageNumber > pageCount) pageNumber = pageCount;
      setPageNumber('monitor', pageNumber);
      const displayItems = filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

      displayItems.forEach(ss => {
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

      buildPaginationControls('monitor-pagination-controls', pageNumber, pageCount, (newPage) => {
        setPageNumber('monitor', newPage);
        renderActiveMonitorList();
      });
      lucide.createIcons();
    }

    function renderSchedules() {
      const c = document.getElementById('schedules-table-body');
      if (!c) return;
      if (!ALL_SCHEDULES.length) {
        c.innerHTML = `
          <tr class="border-t border-slate-200 dark:border-slate-800">
            <td colspan="7" class="px-3 py-6 text-center text-slate-400 font-bold text-xs">Kosong</td>
          </tr>
        `;
        buildPaginationControls('schedules-pagination-controls', 1, 0, () => { });
        return;
      }

      const pageSize = 10; // Default 10 schedules per page
      let pageNumber = getPageNumber('schedules');
      c.innerHTML = '';
      const sortedSchedules = [...ALL_SCHEDULES].sort((a, b) => {
        const aMs = a.mulai ? new Date(a.mulai).getTime() : 0;
        const bMs = b.mulai ? new Date(b.mulai).getTime() : 0;
        return aMs - bMs;
      });

      const pageCount = Math.max(1, Math.ceil(sortedSchedules.length / pageSize));
      if (pageNumber > pageCount) pageNumber = pageCount;
      setPageNumber('schedules', pageNumber);
      const displayItems = sortedSchedules.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

      displayItems.forEach(sch => {
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
        const isValidStart = !Number.isNaN(startDate.getTime());
        const endDate = isValidStart ? new Date(startDate.getTime() + (Number(sch.durasi) || 0) * 60000) : null;
        const dateLabel = isValidStart ? startDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : '-';
        const startTime = isValidStart ? startDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
        const endTime = isValidStart && endDate ? endDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
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
              <div class="flex justify-end gap-1.5">
                <button onclick="triggerEditSchedule('${sch.id}')" class="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 text-[9px] sm:text-[10px] font-semibold">
                  <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
                </button>
                <button onclick="triggerDeleteSchedule('${sch.id}')" class="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[9px] sm:text-[10px] font-semibold">
                  <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      });

      buildPaginationControls('schedules-pagination-controls', pageNumber, pageCount, (newPage) => {
        setPageNumber('schedules', newPage);
        renderSchedules();
      });
      lucide.createIcons();
    }

    function renderPacketsCards() {
      const c = document.getElementById('packets-cards-container'); if (!c) return; c.innerHTML = "";
      if (!ALL_PACKETS.length) {
        c.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-slate-400 font-bold text-xs">Kosong</td></tr>`;
        buildPaginationControls('packets-pagination-controls', 1, 0, () => { });
        refreshBankSoalDropdowns();
        return;
      }
      const pageSize = 10; // Default 10 packets per page
      let pageNumber = getPageNumber('packets');
      const pageCount = Math.max(1, Math.ceil(ALL_PACKETS.length / pageSize));
      if (pageNumber > pageCount) pageNumber = pageCount;
      setPageNumber('packets', pageNumber);
      const displayItems = ALL_PACKETS.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

      displayItems.forEach((pkt, idx) => {
        const globalIdx = (pageNumber - 1) * pageSize + idx + 1;
        c.innerHTML += `<tr class="bg-white dark:bg-slate-900"><td class="px-3 py-3 text-slate-700 dark:text-slate-300">${globalIdx}</td><td class="px-3 py-3 text-left text-slate-800 dark:text-slate-100">${pkt.nama_paket}</td><td class="px-3 py-3 text-slate-700 dark:text-slate-300">${pkt.daftar_soal ? pkt.daftar_soal.length : 0}</td><td class="px-3 py-3 text-center"><button onclick="triggerDeletePacket('${pkt.id_paket}')" class="px-3 py-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl text-[9px] sm:text-[10px] font-semibold">Hapus</button></td></tr>`;
      });
      buildPaginationControls('packets-pagination-controls', pageNumber, pageCount, (newPage) => {
        setPageNumber('packets', newPage);
        renderPacketsCards();
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
      if (viewSelect) {
        const current = viewSelect.value;
        viewSelect.innerHTML = `<option value="">Semua Soal</option>` + packetOptions;
        viewSelect.value = current || "";
      }
      const viewTab = document.getElementById('banksoal-tab-view');
      if (viewTab && !viewTab.classList.contains('hidden')) {
        renderBankSoalQuestionList();
      }
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
      ['A', 'B', 'C', 'D', 'E'].forEach(letter => {
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
      resetManualQuestionFormState();
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
        questionText.innerHTML += `<div><img src="${questionImageAsset.data}" alt="Gambar" style="max-width:100%; height:auto; display:block; margin-top:0.75rem; border-radius:1rem;"></div>`;
      }

      const correctKeyInput = document.getElementById('manual-correct-key');
      if (correctKeyInput) correctKeyInput.value = question.correct_key || 'A';

      ['A', 'B', 'C', 'D', 'E'].forEach(letter => {
        const optionInput = document.getElementById(`manual-option-${letter}`);
        const optionData = (question.opsi || []).find(opt => opt.key === letter) || {};
        if (optionInput) optionInput.innerHTML = stripQuestionKeyLabel(optionData.text || '');
        const optionImageAsset = normalizeImageAsset(optionData.image);
        if (optionInput && optionImageAsset && !/<img[\s\S]*src=['\"]?data:image/i.test(optionInput.innerHTML || '')) {
          optionInput.innerHTML += `<div><img src="${optionImageAsset.data}" alt="Gambar" style="max-width:100%; height:auto; display:block; margin-top:0.5rem; border-radius:1rem;"></div>`;
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
      button.textContent = isHidden ? '+' : '-';
    }

    document.addEventListener('DOMContentLoaded', () => {
      const toggleBtn = document.getElementById('toggle-word-format');
      if (toggleBtn) toggleBtn.addEventListener('click', toggleWordFormatExample);
      const packetSelect = document.getElementById('manual-question-packet');
      if (packetSelect) {
        packetSelect.addEventListener('change', updateManualPacketMode);
        updateManualPacketMode();
      }
      document.querySelectorAll('.manual-contenteditable').forEach(editable => {
        editable.addEventListener('paste', handleContentEditablePaste);
      });
    });

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

    function createImageAsset(dataUrl) {
      return {
        name: `img_${Math.random().toString(36).substring(2, 7)}`,
        data: dataUrl
      };
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
      const allowedTags = ['b', 'strong', 'i', 'em', 'u', 'sub', 'sup', 'br', 'p', 'span', 'div', 'small', 'mark', 'img'];
      const allowedAttrs = ['style', 'src', 'alt', 'title'];

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
          const name = attr.name.toLowerCase();
          if (!allowedAttrs.includes(name)) {
            node.removeAttribute(attr.name);
            return;
          }
          if (name === 'style') {
            const sanitizedStyles = attr.value.split(';').map(rule => rule.trim()).filter(rule => {
              return /^(font-weight|font-style|text-decoration|vertical-align|color|background-color|max-width|height|display|margin|padding)$/.test(rule);
            }).join('; ');
            if (sanitizedStyles) node.setAttribute('style', sanitizedStyles); else node.removeAttribute('style');
          }
          if (name === 'src') {
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
      return doc.body.innerHTML.replace(/\n+/g, '<br>').trim();
    }

    function insertHtmlAtCursor(html) {
      const selection = window.getSelection();
      if (!selection || !selection.rangeCount) return;
      const range = selection.getRangeAt(0);
      range.deleteContents();
      const fragment = range.createContextualFragment(html);
      range.insertNode(fragment);
      range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }

    function handleContentEditablePaste(event) {
      const items = event.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          event.preventDefault();
          const file = item.getAsFile();
          if (!file) return;
          const reader = new FileReader();
          reader.onload = (e) => {
            if (!e.target?.result) return;
            insertHtmlAtCursor(`<img src="${e.target.result}" alt="Gambar" style="max-width:100%; height:auto; display:block; margin-top:0.5rem; border-radius:1rem;">`);
          };
          reader.readAsDataURL(file);
          return;
        }
      }
    }

    function extractImagesFromHtml(html) {
      if (!html || typeof html !== 'string') return null;
      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
      const imgEl = doc.querySelector('img');
      if (imgEl && imgEl.src && imgEl.src.startsWith('data:')) {
        return createImageAsset(imgEl.src);
      }
      return null;
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
          input.dataset.imageData = JSON.stringify(asset);
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
      const questionTextHtmlRaw = questionTextEl ? questionTextEl.innerHTML.trim() : '';
      const questionTextPlain = questionTextEl ? questionTextEl.textContent.trim() : '';
      const correctKey = document.getElementById('manual-correct-key')?.value;
      const isNewPacket = packetId === '__new__';
      const newPacketName = isNewPacket ? document.getElementById('manual-new-packet-name')?.value.trim() : null;
      const editingQuestionId = window.currentEditingQuestionId;
      const isEditing = !!editingQuestionId;
      if (!packetId) return showNotification('Pilih Paket', 'Pilih Soal terlebih dahulu.', 'danger');
      if (isNewPacket && !newPacketName) return showNotification('Nama Soal', 'Masukkan nama soal.', 'danger');
      if (!questionTextPlain && !/<img[\s\S]*src=['\"]?data:image/i.test(questionTextHtmlRaw)) return showNotification('Isi Soal', 'Pertanyaan wajib diisi.', 'danger');
      const existingName = ALL_PACKETS.find(p => p.nama_paket.toLowerCase() === (newPacketName || '').toLowerCase());
      if (isNewPacket && existingName) return showNotification('Duplikat Paket', 'Nama soal sudah ada.', 'danger');
      const opsiKeys = ['A', 'B', 'C', 'D', 'E'];
      const opsi = [];
      for (const letter of opsiKeys) {
        const optionEl = document.getElementById(`manual-option-${letter}`);
        const textRaw = optionEl ? optionEl.innerHTML.trim() : '';
        const optionTextPlain = optionEl ? optionEl.textContent.trim() : '';
        const optionImageAsset = extractImagesFromHtml(textRaw);
        if (!optionTextPlain && !optionImageAsset) return showNotification('Isi Jawaban', `Jawaban ${letter} wajib diisi.`, 'danger');
        const textWithoutImages = textRaw.replace(/<img[^>]*>/gi, '').trim();
        const text = textWithoutImages ? sanitizeHtmlContent(stripQuestionKeyLabel(textWithoutImages)) : '';
        opsi.push({ key: letter, text, image: optionImageAsset });
      }
      const questionTextHtml = sanitizeHtmlContent(stripQuestionKeyLabel(questionTextHtmlRaw));
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
        const questionTextEl = document.getElementById('manual-question-text');
        if (questionTextEl) questionTextEl.innerHTML = '';
        window.currentEditingQuestionId = null;
        const saveBtn = document.getElementById('btn-save-manual-question');
        if (saveBtn) saveBtn.textContent = 'Simpan + Tambah Soal';
        // Clear option texts and reset correct key
        ['A', 'B', 'C', 'D', 'E'].forEach(letter => {
          const opt = document.getElementById(`manual-option-${letter}`);
          if (opt) opt.innerHTML = '';
        });
        const correctKeyInput = document.getElementById('manual-correct-key');
        if (correctKeyInput) correctKeyInput.value = 'A';
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
      const pageSize = getPageSizeFromSelect('banksoal-page-size', 50);
      let pageNumber = getPageNumber('banksoal');
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
        buildPaginationControls('banksoal-pagination-controls', 1, 0, () => { });
        return;
      }

      const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
      if (pageNumber > pageCount) pageNumber = pageCount;
      setPageNumber('banksoal', pageNumber);
      const pageItems = filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

      container.innerHTML = '';
      pageItems.forEach((q, idx) => {
        const card = document.createElement('div');
        card.className = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 hover:shadow-lg transition space-y-4';

        const optionsHtml = (q.opsi || []).map(opt => {
          const isCorrect = opt.key === q.correct_key;
          const optionHtml = sanitizeHtmlContent(opt.text || '-');
          const optionImageAsset = normalizeImageAsset(opt.image);
          const optionImageHtml = optionImageAsset && !/<img[\s\S]*src=['\"]?data:image/i.test(optionHtml)
            ? `<div class="mt-2"><img src="${optionImageAsset.data}" alt="Opsi ${opt.key}" class="max-w-full h-auto rounded-xl object-contain"></div>`
            : '';
          return `
            <div class="flex gap-3 p-3 rounded-xl cursor-default transition ${isCorrect ? 'bg-transparent text-emerald-800 dark:text-emerald-200' : 'bg-transparent text-slate-700 dark:text-slate-300'}">
              <span class="font-extrabold w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-xs monospace ${isCorrect ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}">${opt.key}</span>
              <div class="flex-1">
                <p class="text-sm font-semibold leading-relaxed mt-0.5">${optionHtml}</p>
                ${optionImageHtml}
              </div>
            </div>`;
        }).join('');
        const questionImageAsset = normalizeImageAsset(q.image);

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
          <div class="question-options-group space-y-2">
            ${optionsHtml}
          </div>
        `;
        container.appendChild(card);
      });

      buildPaginationControls('banksoal-pagination-controls', pageNumber, pageCount, (newPage) => {
        setPageNumber('banksoal', newPage);
        renderBankSoalQuestionList();
      });
      lucide.createIcons();
    }

    window.triggerEditBankSoalQuestion = function (packetId, questionId) {
      if (!firebaseUser) return;
      const packet = getBankSoalPacketById(packetId);
      const question = packet?.daftar_soal?.find(q => q.id === questionId);
      if (!packet || !question) return;
      populateManualQuestionForm(packetId, question);
      setBankSoalTab('create');
      window.currentEditingQuestionId = questionId;
    };

    window.triggerDeleteBankSoalQuestion = function (packetId, questionId) {
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
      const table = document.getElementById('results-table');
      if (!c || !table) return;
      const sv = (document.getElementById('filter-result-search')?.value || '').toLowerCase();
      const cf = document.getElementById('filter-result-kelas')?.value || '';
      const mf = document.getElementById('filter-result-mapel')?.value || '';
      const sortVal = document.getElementById('filter-result-sort')?.value || 'kelas-nama';
      const pageSize = getPageSizeFromSelect('result-page-size', 50);
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
        buildPaginationControls('results-pagination-controls', 1, 0, () => { });
        return;
      }

      const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
      if (pageNumber > pageCount) pageNumber = pageCount;
      setPageNumber('results', pageNumber);
      const displayItems = filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

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
                <button onclick="showResultItemAnalysis('${r.id}')" class="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 dark:text-accent dark:bg-accent/10 dark:hover:bg-accent/20 text-[9px] sm:text-[10px] font-semibold">
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

    function getItemAnalysisStatusLabel(status) {
      if (status === 'benar') return { text: 'Benar', className: 'item-analysis-status-benar' };
      if (status === 'salah') return { text: 'Salah', className: 'item-analysis-status-salah' };
      return { text: 'Kosong', className: 'item-analysis-status-kosong' };
    }

    window.showResultItemAnalysis = function (resultId) {
      const result = ALL_RESULTS.find(r => r.id === resultId);
      if (!result) return showNotification('Tidak Ditemukan', 'Data hasil ujian tidak ditemukan.', 'danger');

      const analysis = buildStudentItemAnalysis(result, ALL_SCHEDULES, ALL_PACKETS);
      window.__currentItemAnalysis = analysis;
      const modal = document.getElementById('result-item-analysis-modal');
      const titleEl = document.getElementById('item-analysis-title');
      const subtitleEl = document.getElementById('item-analysis-subtitle');
      const summaryEl = document.getElementById('item-analysis-summary');
      const tbody = document.getElementById('item-analysis-table-body');
      if (!modal || !titleEl || !subtitleEl || !summaryEl || !tbody) return;

      titleEl.textContent = `${analysis.student.nama} (${analysis.student.nis})`;
      subtitleEl.textContent = `${analysis.student.kelas} • ${analysis.student.mapel} • ${analysis.packetName}`;

      summaryEl.innerHTML = `
        <div class="item-analysis-summary-card">
          <p class="text-[10px] uppercase font-bold text-slate-400">Nilai</p>
          <p class="text-lg font-black text-primary dark:text-accent">${analysis.student.nilai}</p>
        </div>
        <div class="item-analysis-summary-card">
          <p class="text-[10px] uppercase font-bold text-slate-400">Total Soal</p>
          <p class="text-lg font-black text-slate-700 dark:text-slate-100">${analysis.summary.total}</p>
        </div>
        <div class="item-analysis-summary-card">
          <p class="text-[10px] uppercase font-bold text-slate-400">Benar</p>
          <p class="text-lg font-black text-emerald-600">${analysis.summary.benar}</p>
        </div>
        <div class="item-analysis-summary-card">
          <p class="text-[10px] uppercase font-bold text-slate-400">Salah</p>
          <p class="text-lg font-black text-red-500">${analysis.summary.salah}</p>
        </div>
        <div class="item-analysis-summary-card">
          <p class="text-[10px] uppercase font-bold text-slate-400">Kosong</p>
          <p class="text-lg font-black text-slate-500">${analysis.summary.kosong}</p>
        </div>
      `;

      if (!analysis.items.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-400 font-bold text-xs">Data butir soal tidak tersedia untuk hasil ini.</td></tr>`;
      } else {
        tbody.innerHTML = analysis.items.map(item => {
          const statusMeta = getItemAnalysisStatusLabel(item.status);
          const preview = truncateText(stripHtmlToText(typeof stripQuestionKeyLabel === 'function' ? stripQuestionKeyLabel(item.soal) : item.soal), 140);
          return `
            <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-900/40">
              <td class="font-bold text-slate-500">${item.no}</td>
              <td class="item-analysis-col-soal text-slate-700 dark:text-slate-200 leading-relaxed">${preview}</td>
              <td class="text-center font-black monospace">${item.studentAnswer || '-'}</td>
              <td class="text-center font-black monospace text-emerald-600">${item.correctKey}</td>
              <td class="text-center ${statusMeta.className}">${statusMeta.text}</td>
            </tr>
          `;
        }).join('');
      }

      modal.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
      if (typeof lucide !== 'undefined') lucide.createIcons();
    };

    window.closeResultItemAnalysis = function () {
      const modal = document.getElementById('result-item-analysis-modal');
      if (modal) modal.classList.add('hidden');
      document.body.style.overflow = '';
      window.__currentItemAnalysis = null;
    };

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

      const pageSize = getPageSizeFromSelect('dashboard-page-size', 50);
      let pageNumber = getPageNumber('dashboard');
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
        buildPaginationControls('dashboard-pagination-controls', 1, 0, () => { });
        return;
      }

      const pageCount = Math.max(1, Math.ceil(filteredSchedules.length / pageSize));
      if (pageNumber > pageCount) pageNumber = pageCount;
      setPageNumber('dashboard', pageNumber);
      const displaySchedules = filteredSchedules.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

      displaySchedules.forEach(sch => {
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

      buildPaginationControls('dashboard-pagination-controls', pageNumber, pageCount, (newPage) => {
        setPageNumber('dashboard', newPage);
        renderDashboardActiveExamsTable();
      });
      lucide.createIcons();
    }

    window.triggerStudentDelete = function (nis) {
      if (!firebaseUser) return;
      const student = ALL_STUDENTS.find(s => s.nis === nis);
      const displayName = student?.nama || nis;
      showConfirmation("Hapus", `Hapus Siswa <strong>${displayName}</strong>?`, async () => {
        toggleLoader(true);
        try {
          await deleteDoc(getPublicDoc("Siswa", nis));
          ALL_STUDENTS = ALL_STUDENTS.filter(s => s.nis !== nis);
          renderStudentsCards();
          updateClassSelectors();
          showNotification("OK", "Dihapus", "success");
        } catch (e) { console.error('triggerStudentDelete failed', e); showNotification("Gagal", e.message || "Gagal menghapus siswa.", "danger"); } finally { toggleLoader(false); }
      });
    };

    window.toggleAdminDbPassword = function (username) {
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

    window.triggerEditAdmin = function (username) {
      if (!firebaseUser) return;
      const admin = ALL_ADMINS.find(a => a.username === username);
      if (!admin) return;
      showConfirmation("Edit Data Admin", `
        <div class="space-y-2 text-xs text-left text-slate-800 dark:text-slate-100">
          <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">Username</label>
          <input id="e-adm-un" value="${admin.username}" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">

          <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block mt-2">Password Baru</label>
          <div class="relative">
            <input type="password" id="e-adm-p" value="${admin.password}" class="w-full p-2 pr-10 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">
            <button type="button" onclick="const i=document.getElementById('e-adm-p'); i.type=i.type==='password'?'text':'password';" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <i class="fas fa-eye text-sm"></i>
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

    window.triggerAdminDelete = function (username) {
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

    // Perubahan: Menghapus token kuncian sesi ketika jadwal dihapus
    window.triggerDeleteSchedule = function (id) {
      if (!firebaseUser) return;
      showConfirmation("Hapus", "Hapus jadwal?", async () => {
        toggleLoader(true);
        try {
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
    window.triggerEditSchedule = function (id) {
      if (!firebaseUser) return;
      const sch = ALL_SCHEDULES.find(s => s.id === id);
      if (!sch) return;

      const uc = [...new Set(ALL_STUDENTS.map(s => s.kelas))].sort(sortClassStrings).map(c => {
        const checked = sch.kelas_terpilih.includes(c) ? 'checked' : '';
        return `<label class="flex items-center gap-1"><input type="checkbox" name="sc-edit" value="${c}" ${checked} class="rounded text-primary"> <span class="text-[10px]">${c}</span></label>`;
      }).join('');

      const globalCheckboxes = `
        <div class="flex flex-wrap gap-2.5 p-2 mb-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <label class="flex items-center gap-1"><input type="checkbox" onchange="window.toggleGlobalClass('X', this.checked, 'sc-edit')" class="rounded text-primary"> <span class="text-[10px] font-bold text-blue-500">Pilih Semua X</span></label>
          <label class="flex items-center gap-1"><input type="checkbox" onchange="window.toggleGlobalClass('XI', this.checked, 'sc-edit')" class="rounded text-primary"> <span class="text-[10px] font-bold text-blue-500">Pilih Semua XI</span></label>
          <label class="flex items-center gap-1"><input type="checkbox" onchange="window.toggleGlobalClass('XII', this.checked, 'sc-edit')" class="rounded text-primary"> <span class="text-[10px] font-bold text-blue-500">Pilih Semua XII</span></label>
        </div>
      `;

      const tnChecked = sch.tampil_nilai ? 'checked' : '';
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

          <label class="font-bold text-white dark:text-white uppercase tracking-wider block">Kelas Terpilih</label>
          <div class="flex flex-col p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950">
            ${globalCheckboxes}
            <div class="flex flex-wrap gap-2">${uc}</div>
          </div>

          <label class="flex items-center gap-1.5 mt-2">
            <input type="checkbox" id="s-tn-edit" ${tnChecked} class="rounded text-primary">
            <span class="text-[10px] font-bold text-slate-700 dark:text-slate-300">Tampilkan Nilai ke Siswa</span>
          </label>
        </div>
      `, async () => {
        const m = document.getElementById('s-m-edit').value.trim();
        const p = document.getElementById('s-p-edit').value;
        const dt = document.getElementById('s-dt-edit').value;
        const dr = parseInt(document.getElementById('s-d-edit').value, 10);
        const cl = Array.from(document.querySelectorAll('input[name="sc-edit"]:checked')).map(cb => cb.value);
        const tn = document.getElementById('s-tn-edit').checked;

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
            kelas_terpilih: cl,
            tampil_nilai: tn
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
    };

    window.triggerDeletePacket = function (id) { if (!firebaseUser) return; showConfirmation("Hapus", "Hapus paket?", async () => { toggleLoader(true); try { await deleteDoc(getPublicDoc("Bank Soal", id)); ALL_PACKETS = ALL_PACKETS.filter(p => p.id_paket !== id); renderPacketsCards(); showNotification("OK", "Dihapus", "success"); } catch (e) { console.error('triggerDeletePacket failed', e); showNotification("Gagal", e.message || "Gagal menghapus paket.", "danger"); } finally { toggleLoader(false); } }); }
    window.triggerEditPacket = function (id) {
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
    window.triggerResetIndividu = function (sid) {
      if (!firebaseUser) return;
      showConfirmation("Reset", "Hapus sesi perangkat lama?", async () => {
        toggleLoader(true);
        try {
          await deleteDoc(getPublicDoc("Session Ujian", sid));
          ACTIVE_MONITOR_DATA = ACTIVE_MONITOR_DATA.filter(s => s.id !== sid);
          renderActiveMonitorList();
          showNotification("OK", "Direset", "success");
        } catch (e) { console.error('triggerResetIndividu failed', e); showNotification("Gagal", e.message || "Gagal mereset sesi.", "danger"); } finally { toggleLoader(false); }
      });
    }
    window.triggerResetAnswer = function (nis, mapel) {
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

    async function handleExportDatabase() { if (!firebaseUser) return; toggleLoader(true); try { const p = {}; for (const c of ["Admin", "Siswa", "Bank Soal", "Jadwal Ujian", "Jawaban Siswa", "Session Ujian"]) { const s = await getDocs(getPublicCollection(c)); p[c] = s.docs.map(d => d.data()); } const a = document.createElement('a'); a.href = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(p, null, 2)); a.download = `CBT_Backup_${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); showNotification("OK", "Diunduh", "success"); } catch (e) { console.error('handleExportDatabase failed', e); showNotification("Gagal", e.message || "Gagal mengekspor database.", "danger"); } finally { toggleLoader(false); } }
    function handleImportDatabase(e) { if (!firebaseUser) return; const f = e?.target?.files?.[0]; if (!f) return; const r = new FileReader(); r.onload = async (ev) => { toggleLoader(true); try { const dt = JSON.parse(ev.target.result); for (const [c, ds] of Object.entries(dt)) { let batch = writeBatch(db); let opCount = 0; for (const doj of ds) { const id = doj.nis || doj.id || doj.id_paket || doj.username; if (!id) continue; batch.set(getPublicDoc(c, String(id)), doj); opCount++; if (opCount >= 450) { await batch.commit(); batch = writeBatch(db); opCount = 0; } } if (opCount > 0) await batch.commit(); } mySessionStorage.removeItem('tokens_generated_session'); showNotification("OK", "Dipulihkan", "success"); } catch (er) { showNotification("Gagal", er.message || "Impor gagal.", "danger"); } finally { toggleLoader(false); } }; r.readAsText(f); }
    async function handleTruncateAnswers() { if (!firebaseUser) return; showConfirmation("Hapus", "Kosongkan jawaban?", async () => { toggleLoader(true); try { const s = await getDocs(getPublicCollection("Jawaban Siswa")); let batch = writeBatch(db); let opCount = 0; for (const d of s.docs) { batch.delete(getPublicDoc("Jawaban Siswa", d.id)); opCount++; if (opCount >= 450) { await batch.commit(); batch = writeBatch(db); opCount = 0; } } if (opCount > 0) await batch.commit(); showNotification("OK", "Kosong", "success"); } catch (e) { showNotification("Gagal", e.message || "Gagal menghapus jawaban.", "danger"); } finally { toggleLoader(false); } }); }

    async function handleDeleteAllStudents() {
      if (!firebaseUser) return;
      showConfirmation("Hapus Semua Siswa", "Hapus semua data siswa? Tindakan ini tidak dapat dibatalkan.", async () => {
        toggleLoader(true);
        try {
          const s = await getDocs(getPublicCollection("Siswa"));
          let batch = writeBatch(db);
          let opCount = 0;
          for (const d of s.docs) {
            batch.delete(getPublicDoc("Siswa", d.id));
            opCount++;
            if (opCount >= 450) {
              await batch.commit();
              batch = writeBatch(db);
              opCount = 0;
            }
          }
          if (opCount > 0) await batch.commit();
          ALL_STUDENTS = [];
          renderStudentsCards();
          updateClassSelectors();
          refreshCachedDashboardStats();
          renderDashboardActiveExamsTable();
          showNotification("OK", "Semua data siswa berhasil dihapus", "success");
        } catch (e) {
          showNotification("Gagal", e.message || "Gagal menghapus siswa.", "danger");
        } finally {
          toggleLoader(false);
        }
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

    async function handleDeleteAllQuestions() {
      if (!firebaseUser) return;
      showConfirmation("Hapus Semua Soal", "Hapus semua paket soal dan soal? Tindakan ini tidak dapat dibatalkan.", async () => {
        toggleLoader(true);
        try {
          const s = await getDocs(getPublicCollection("Bank Soal"));
          let batch = writeBatch(db);
          let opCount = 0;
          for (const d of s.docs) {
            batch.delete(getPublicDoc("Bank Soal", d.id));
            opCount++;
            if (opCount >= 450) {
              await batch.commit();
              batch = writeBatch(db);
              opCount = 0;
            }
          }
          if (opCount > 0) await batch.commit();
          ALL_PACKETS = [];
          renderPacketsCards();
          refreshBankSoalDropdowns();
          refreshCachedDashboardStats();
          renderDashboardActiveExamsTable();
          showNotification("OK", "Semua soal berhasil dihapus", "success");
        } catch (e) {
          showNotification("Gagal", e.message || "Gagal menghapus soal.", "danger");
        } finally {
          toggleLoader(false);
        }
      });
    }

    async function handleDeleteAllSchedules() {
      if (!firebaseUser) return;
      showConfirmation("Hapus Semua Jadwal", "Hapus semua jadwal ujian? Tindakan ini tidak dapat dibatalkan.", async () => {
        toggleLoader(true);
        try {
          const s = await getDocs(getPublicCollection("Jadwal Ujian"));
          let batch = writeBatch(db);
          let opCount = 0;
          for (const d of s.docs) {
            batch.delete(getPublicDoc("Jadwal Ujian", d.id));
            opCount++;
            if (opCount >= 450) {
              await batch.commit();
              batch = writeBatch(db);
              opCount = 0;
            }
          }
          if (opCount > 0) await batch.commit();
          ALL_SCHEDULES = [];
          renderSchedules();
          updateAdminTokenBars();
          refreshCachedDashboardStats();
          renderDashboardActiveExamsTable();
          showNotification("OK", "Semua jadwal berhasil dihapus", "success");
        } catch (e) {
          showNotification("Gagal", e.message || "Gagal menghapus jadwal.", "danger");
        } finally {
          toggleLoader(false);
        }
      });
    }

    async function handleDeleteExamAnswers() {
      if (!firebaseUser) return;
      showConfirmation("Hapus Jawaban", "Kosongkan semua jawaban ujian?", async () => {
        toggleLoader(true);
        try {
          const s = await getDocs(getPublicCollection("Jawaban Siswa"));
          let batch = writeBatch(db);
          let opCount = 0;
          for (const d of s.docs) {
            batch.delete(getPublicDoc("Jawaban Siswa", d.id));
            opCount++;
            if (opCount >= 450) {
              await batch.commit();
              batch = writeBatch(db);
              opCount = 0;
            }
          }
          if (opCount > 0) await batch.commit();
          renderResultsCards();
          showNotification("OK", "Semua jawaban berhasil dihapus", "success");
        } catch (e) {
          showNotification("Gagal", e.message || "Gagal menghapus jawaban.", "danger");
        } finally {
          toggleLoader(false);
        }
      });
    }

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
        showConfirmation('Konfirmasi Keamanan 2', `Langkah 2: Ketik <strong>DELETE ALL</strong> pada kolom di bawah untuk melanjutkan operasi ini.<br><br><input id="purge-confirm-code" placeholder="KETIK DELETE ALL" class="w-full mt-3 p-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-slate-100" />`, async () => {
          const code = document.getElementById('purge-confirm-code')?.value?.trim();
          if (code !== 'DELETE ALL') {
            showNotification('Dibatalkan', 'Kode konfirmasi tidak cocok. Operasi dibatalkan.', 'danger');
            return;
          }
          await handlePurgeDatabaseTotal();
        }, 'alert-triangle');
      }, 'alert-triangle');
    }
    async function handleResetAllSessions() { if (!firebaseUser) return; showConfirmation("Reset Sesi", "Kosongkan session aktif?", async () => { toggleLoader(true); try { const s = await getDocs(getPublicCollection("Session Ujian")); let batch = writeBatch(db); let opCount = 0; for (const d of s.docs) { batch.delete(getPublicDoc("Session Ujian", d.id)); opCount++; if (opCount >= 450) { await batch.commit(); batch = writeBatch(db); opCount = 0; } } if (opCount > 0) await batch.commit(); showNotification("OK", "Sesi bersih", "success"); } catch (e) { showNotification("Gagal", e.message || "Gagal mereset sesi.", "danger"); } finally { toggleLoader(false); } }); }

    function handleExportResultsExcel() {
      if (typeof XLSX === 'undefined') return showNotification("Gagal", "Modul Excel sedang dimuat.", "danger");
      const kelas = document.getElementById('filter-result-kelas')?.value || '';
      if (!kelas) return showNotification("Pilih Kelas", "Silakan pilih kelas terlebih dahulu pada filter dropdown.", "danger");
      const filtered = ALL_RESULTS.filter(r => r.kelas === kelas);
      if (!filtered.length) return showNotification("Kosong", `Tidak ada hasil ujian untuk kelas ${kelas}.`, "info");
      const dr = filtered.map((r, i) => ({ "No": i + 1, "NIS": r.nis, "Nama": r.nama, "Kelas": r.kelas, "Mapel": r.mapel, "Nilai": r.nilai, "Benar": r.jumlah_benar, "Salah": r.jumlah_salah, "Status": r.status, "Waktu Submit": new Date(r.waktu_kirim).toLocaleString('id-ID') }));
      const wb = XLSX.utils.book_new();
      const safeKelas = kelas.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(dr), "Hasil");
      XLSX.writeFile(wb, `Hasil_${safeKelas}_${Date.now()}.xlsx`);
    }

    function handleExportItemAnalysisExcel() {
      if (typeof XLSX === 'undefined') return showNotification("Gagal", "Modul Excel sedang dimuat.", "danger");
      const kelas = document.getElementById('filter-result-kelas')?.value || '';
      if (!kelas) return showNotification("Pilih Kelas", "Silakan pilih kelas terlebih dahulu pada filter dropdown.", "danger");
      const results = ALL_RESULTS.filter(r => r.kelas === kelas && r.status !== 'Proses');
      if (!results.length) return showNotification("Kosong", `Tidak ada hasil ujian untuk kelas ${kelas}.`, "info");

      const rows = [];
      results.forEach(result => {
        const analysis = buildStudentItemAnalysis(result, ALL_SCHEDULES, ALL_PACKETS);
        const row = {
          NIS: analysis.student.nis,
          Nama: analysis.student.nama,
          Kelas: analysis.student.kelas,
          Mapel: analysis.student.mapel,
          Nilai: analysis.student.nilai
        };

        // Tambah kolom untuk setiap soal dengan status jawaban
        analysis.items.forEach(item => {
          const statusText = item.status === 'benar' ? 'Benar' : item.status === 'salah' ? 'Salah' : 'Kosong';
          row[`Soal_${item.no}`] = statusText;
        });

        // Tambah ringkasan di akhir
        row['Total_Benar'] = analysis.summary.benar;
        row['Total_Salah'] = analysis.summary.salah;
        row['Total_Kosong'] = analysis.summary.kosong;
        row['Total_Soal'] = analysis.summary.total;

        rows.push(row);
      });

      if (!rows.length) return showNotification("Kosong", `Tidak ada hasil ujian untuk kelas ${kelas}.`, "info");

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Analisis Butir Soal");
      const safeKelas = kelas.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
      XLSX.writeFile(wb, `Analisis_Butir_Soal_${safeKelas}_${Date.now()}.xlsx`);
      showNotification("Berhasil", `Analisis butir soal kelas ${kelas} berhasil diekspor (${results.length} siswa).`, "success");
    }

    function handleExcelImportSiswa(e) {
      if (typeof XLSX === 'undefined') return showNotification("Gagal", "Modul Excel sedang dimuat.", "danger");
      if (!firebaseUser) return; const f = e.target.files[0]; if (!f) return;
      const r = new FileReader(); r.onload = async (ev) => {
        toggleLoader(true);
        try {
          const wb = XLSX.read(new Uint8Array(ev.target.result), { type: 'array' });
          const json = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 });
          if (json.length < 2) throw new Error("Kosong");
          let batch = writeBatch(db); let opCount = 0; let l = 0;
          for (let i = 1; i < json.length; i++) {
            if (json[i][0] && json[i][1] && json[i][3]) {
              const nis = String(json[i][0]).trim();
              batch.set(getPublicDoc("Siswa", nis), {
                nis,
                nama: String(json[i][1]).trim(),
                jenis_kelamin: json[i][2] ? String(json[i][2]).trim() : "L",
                kelas: String(json[i][3]).trim(),
                password: json[i][4] ? String(json[i][4]).trim() : "123456"
              });
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
      const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["NIS", "Nama", "Jenis Kelamin", "Kelas", "Password"], ["123", "AR Siswa", "L", "XII MIPA 1", "pass123"]]), "Format"); XLSX.writeFile(wb, "Template.xlsx");
    }

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
        const logoUrl = myLocalStorage.getItem('er_sh_logo') || "https://iili.io/B5MMKiX.png";
        const siteUrl = 'https://arnnon28.github.io/smandacbt';

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
          } catch (_) { }

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
            } catch (_) { }
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
      if (typeof mammoth === 'undefined') { showNotification("Belum Siap", "Pustaka DOCX masih diunduh.", "danger"); e.target.value = ""; return; }
      if (!firebaseUser) return;
      const f = e.target.files[0];
      const packetId = document.getElementById('manual-question-packet').value.trim();
      const isNewPacket = packetId === '__new__';
      const newPacketName = isNewPacket ? document.getElementById('manual-new-packet-name')?.value.trim() : null;
      if (!packetId) { showNotification("Pilih Paket", "Pilih Soal terlebih dahulu", "info"); e.target.value = ""; return; }
      if (isNewPacket && !newPacketName) { showNotification("Nama Soal", "Masukkan nama soal.", "info"); e.target.value = ""; return; }
      if (!f) return;
      const r = new FileReader(); r.onload = function (ev) {
        toggleLoader(true);

        // Konfigurasi Mammoth untuk mengekstrak SEMUA gambar / objek / Math formula dalam base64
        const mammothOptions = {
          convertImage: mammoth.images.imgElement(function (image) {
            return image.read("base64").then(function (imageBuffer) {
              return {
                src: "data:" + image.contentType + ";base64," + imageBuffer
              };
            });
          })
        };

        mammoth.convertToHtml({ arrayBuffer: ev.target.result }, mammothOptions).then(async (res) => {
          const div = document.createElement('div'); div.innerHTML = res.value;
          const qs = [];
          let cq = null;
          let pendingImage = null;
          for (let p of div.querySelectorAll('p')) {
            const imgEl = p.querySelector('img');
            let img = null;
            if (imgEl && imgEl.src.startsWith('data:image')) img = createImageAsset(await compressImageToTargetSize(imgEl.src, 50));

            // Remove images from HTML first, then extract text
            let rawHtml = p.innerHTML.replace(/<img[^>]*>/gi, '').trim();
            let txt = rawHtml.replace(/<[^>]*>/g, '').trim(); // Plain text without any HTML tags

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
              const questionHtml = sanitizeHtmlContent(rawHtml.replace(/^\s*\d+[\.\)\s]+/, '').trim() || qm[2].trim());
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
              const optionHtml = sanitizeHtmlContent(rawHtml.replace(new RegExp(`^\s*${om[1]}[\.\)\s]+`), '').trim() || om[2].trim());
              cq.opsi.push({ key: om[1].toUpperCase(), text: optionHtml, image: pendingImage });
              pendingImage = null;
            } else if (cq) {
              const addedHtml = sanitizeHtmlContent(rawHtml || txt);
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
        <div class="space-y-2 text-left text-slate-800 dark:text-slate-100">
          <input id="m-n" placeholder="NIS" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">
          <input id="m-nm" placeholder="Nama" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">
          <input id="m-k" placeholder="Kelas" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">
          <select id="m-jk" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">
            <option value="">Pilih Jenis Kelamin</option>
            <option value="L">Laki-laki</option>
            <option value="P">Perempuan</option>
          </select>
          <div class="relative">
            <input type="password" id="m-p" placeholder="Password" class="w-full p-2 pr-10 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">
            <button type="button" onclick="const i=document.getElementById('m-p'); i.type=i.type==='password'?'text':'password';" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <i class="fas fa-eye text-sm"></i>
            </button>
          </div>
        </div>
      `, async () => {
        const n = document.getElementById('m-n').value.trim(), nm = document.getElementById('m-nm').value.trim(), k = document.getElementById('m-k').value.trim(), jk = document.getElementById('m-jk').value, p = document.getElementById('m-p').value.trim();
        if (!n || !nm || !k || !jk || !p) { showNotification("Input Gagal", "Semua kolom wajib diisi.", "danger"); return; }
        toggleLoader(true);
        try {
          const newStudent = { nis: n, nama: nm, kelas: k, jenis_kelamin: jk, password: p };
          await setDoc(getPublicDoc("Siswa", n), newStudent);
          ALL_STUDENTS.push(newStudent);
          renderStudentsCards();
          updateClassSelectors();
          showNotification("OK", "Disimpan", "success");
        } catch (e) { showNotification("Gagal", e.message || "Tidak dapat menyimpan siswa.", "danger"); } finally { toggleLoader(false); }
      });
    }

    async function handleAddAdminManual() {
      if (!firebaseUser) return;
      showConfirmation("Tambah Admin", `
        <div class="space-y-2 text-xs text-left text-slate-800 dark:text-slate-100">
          <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">Username</label>
          <input id="new-adm-un" placeholder="Contoh: proktor2" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">

          <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block mt-2">Password</label>
          <div class="relative">
            <input type="password" id="new-adm-p" placeholder="••••••••" class="w-full p-2 pr-10 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">
            <button type="button" onclick="const i=document.getElementById('new-adm-p'); i.type=i.type==='password'?'text':'password';" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <i class="fas fa-eye text-sm"></i>
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
      if (!firebaseUser) return; if (!ALL_PACKETS.length) return showNotification("Kosong", "Buat soal dulu", "danger");
      const uc = [...new Set(ALL_STUDENTS.map(s => s.kelas))].sort(sortClassStrings).map(c => `<label class="flex items-center gap-1"><input type="checkbox" name="sc" value="${c}" class="rounded text-primary"> <span class="text-xs">${c}</span></label>`).join('');

      const globalCheckboxes = `
        <div class="flex flex-wrap gap-2.5 p-2 mb-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          <label class="flex items-center gap-1"><input type="checkbox" onchange="window.toggleGlobalClass('X', this.checked, 'sc')" class="rounded text-primary"> <span class="text-xs font-bold text-blue-500">Pilih Semua X</span></label>
          <label class="flex items-center gap-1"><input type="checkbox" onchange="window.toggleGlobalClass('XI', this.checked, 'sc')" class="rounded text-primary"> <span class="text-xs font-bold text-blue-500">Pilih Semua XI</span></label>
          <label class="flex items-center gap-1"><input type="checkbox" onchange="window.toggleGlobalClass('XII', this.checked, 'sc')" class="rounded text-primary"> <span class="text-xs font-bold text-blue-500">Pilih Semua XII</span></label>
        </div>
      `;

      showConfirmation("Jadwal", `
        <div class="space-y-3 text-sm text-left text-slate-800 dark:text-slate-100">
          <input id="s-m" placeholder="Mata Pelajaran" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50 text-sm">
          <select id="s-p" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50 text-sm">
            <option value="">Pilih Paket Soal</option>
            ${ALL_PACKETS.map(p => `<option value="${p.id_paket}">${p.nama_paket}</option>`).join('')}
          </select>
          <input type="datetime-local" id="s-dt" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50 text-sm">
          <input type="number" id="s-d" placeholder="Durasi (Menit)" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-850 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50 text-sm">
          <div class="flex flex-col p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950">
            ${globalCheckboxes}
            <div class="flex flex-wrap gap-2 text-xs">${uc}</div>
          </div>
          <label class="flex items-center gap-1.5 mt-2">
            <input type="checkbox" id="s-tn" class="rounded text-primary">
            <span class="text-xs font-bold text-slate-700 dark:text-slate-300">Tampilkan Nilai ke Siswa</span>
          </label>
        </div>
      `, async () => {
        const m = document.getElementById('s-m').value.trim();
        const p = document.getElementById('s-p').value;
        const dt = document.getElementById('s-dt').value;
        const dr = parseInt(document.getElementById('s-d').value, 10);
        const cl = Array.from(document.querySelectorAll('input[name="sc"]:checked')).map(cb => cb.value);
        const tn = document.getElementById('s-tn').checked;

        if (!m || !p || !dt || !dr || !cl.length) { showNotification("Input Gagal", "Semua kolom wajib diisi dan pilih kelas.", "danger"); return; }
        const tk = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join(''), id = `sch_${Date.now()}`;
        toggleLoader(true);
        try {
          const newSched = { id, mapel: m, id_paket: p, mulai: dt, durasi: dr, kelas_terpilih: cl, token: tk, tampil_nilai: tn };
          await setDoc(getPublicDoc("Jadwal Ujian", id), newSched);
          ALL_SCHEDULES.push(newSched);
          renderSchedules();
          renderDashboardActiveExamsTable();
          mySessionStorage.removeItem('tokens_generated_session');
          showNotification("OK", "Token: " + tk, "success");
        } catch (e) { showNotification("Gagal", e.message || "Tidak dapat menyimpan jadwal.", "danger"); } finally { toggleLoader(false); }
      });
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
            token: Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join('')
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

      safeAdd('toggle-theme-auth', 'click', toggleTheme); safeAdd('toggle-theme-main', 'click', toggleTheme); safeAdd('toggle-theme-sidebar', 'click', toggleTheme);
      safeAdd('student-login-form', 'submit', handleStudentLogin); safeAdd('admin-login-form', 'submit', handleAdminLogin);
      safeAdd('btn-trigger-admin-modal', 'click', () => document.getElementById('admin-auth-modal').classList.remove('hidden'));
      safeAdd('btn-close-admin-modal', 'click', () => document.getElementById('admin-auth-modal').classList.add('hidden'));

      safeAdd('toggle-auth-password', 'click', () => { const i = document.getElementById('login-password'); if (i) i.type = i.type === 'password' ? 'text' : 'password'; });
      safeAdd('toggle-admin-password', 'click', () => { const i = document.getElementById('admin-password'); if (i) i.type = i.type === 'password' ? 'text' : 'password'; });

      safeAdd('btn-mobile-nav', 'click', () => { if (CURRENT_USER?.role === 'student') toggleMobileSheet(true); });

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

      safeAdd('btn-sidebar-logout', 'click', handleLogout); safeAdd('btn-mobile-logout', 'click', handleLogout);
      safeAdd('excel-import-file', 'change', handleExcelImportSiswa); safeAdd('docx-import-file', 'change', handleDOCXImportSoal); safeAdd('import-database-file', 'change', handleImportDatabase);
      safeAdd('btn-download-template', 'click', downloadSiswaTemplate); safeAdd('btn-download-word-template', 'click', downloadWordTemplate); safeAdd('btn-add-student-manual', 'click', handleAddStudentManual); safeAdd('btn-delete-all-students', 'click', handleDeleteAllStudents);
      safeAdd('btn-download-kartu-ujian', 'click', handleDownloadKartuUjian);
      safeAdd('btn-add-admin', 'click', handleAddAdminManual);
      safeAdd('btn-add-schedule', 'click', handleAddSchedule); safeAdd('btn-export-database', 'click', handleExportDatabase);
      safeAdd('btn-delete-all-questions', 'click', handleDeleteAllQuestions); safeAdd('btn-delete-all-schedules', 'click', handleDeleteAllSchedules); safeAdd('btn-delete-exam-answers', 'click', handleDeleteExamAnswers);
      safeAdd('btn-purge-database', 'click', askPurgeDatabaseTotal); safeAdd('btn-generate-all-tokens', 'click', handleGenerateAllTokens); safeAdd('btn-force-refresh-stats', 'click', () => refreshCachedDashboardStats(true)); safeAdd('btn-refresh-database', 'click', askRefreshDatabase);
      safeAdd('btn-save-manual-question', 'click', (e) => { e.preventDefault(); handleSaveManualQuestion(); });
      safeAdd('btn-clear-manual-question', 'click', (e) => { e.preventDefault(); clearManualQuestionTextarea(); });
      safeAdd('tab-banksoal-create', 'click', () => setBankSoalTab('create'));
      safeAdd('tab-banksoal-packets', 'click', () => setBankSoalTab('packets'));
      safeAdd('tab-banksoal-view', 'click', () => setBankSoalTab('view'));
      safeAdd('btn-reset-all-sessions', 'click', handleResetAllSessions); safeAdd('btn-export-results-excel', 'click', handleExportResultsExcel);
      safeAdd('btn-export-item-analysis-excel', 'click', handleExportItemAnalysisExcel);

      const ss = document.getElementById('search-student'); if (ss) ss.addEventListener('input', () => { resetPageNumber('students'); renderStudentsCards(); });
      const fs = document.getElementById('filter-student-class'); if (fs) fs.addEventListener('change', () => { resetPageNumber('students'); renderStudentsCards(); });
      const sps = document.getElementById('students-page-size'); if (sps) sps.addEventListener('change', () => { resetPageNumber('students'); renderStudentsCards(); });
      const ms = document.getElementById('filter-monitor-search'); if (ms) ms.addEventListener('input', () => { resetPageNumber('monitor'); renderActiveMonitorList(); });
      const mk = document.getElementById('filter-monitor-kelas'); if (mk) mk.addEventListener('change', () => { resetPageNumber('monitor'); renderActiveMonitorList(); });
      const mt = document.getElementById('filter-monitor-status'); if (mt) mt.addEventListener('change', () => { resetPageNumber('monitor'); renderActiveMonitorList(); });
      const mps = document.getElementById('monitor-page-size'); if (mps) mps.addEventListener('change', () => { resetPageNumber('monitor'); renderActiveMonitorList(); });
      const rs = document.getElementById('filter-result-search'); if (rs) rs.addEventListener('input', () => { resetPageNumber('results'); renderResultsCards(); });
      const rk = document.getElementById('filter-result-kelas'); if (rk) rk.addEventListener('change', () => { resetPageNumber('results'); renderResultsCards(); });
      const rm = document.getElementById('filter-result-mapel'); if (rm) rm.addEventListener('change', () => { resetPageNumber('results'); renderResultsCards(); });
      const rsort = document.getElementById('filter-result-sort'); if (rsort) rsort.addEventListener('change', () => { resetPageNumber('results'); renderResultsCards(); });
      const rp = document.getElementById('result-page-size'); if (rp) rp.addEventListener('change', () => { resetPageNumber('results'); renderResultsCards(); });
      const fb = document.getElementById('filter-banksoal-packet'); if (fb) fb.addEventListener('change', () => { resetPageNumber('banksoal'); renderBankSoalQuestionList(); });
      const sq = document.getElementById('search-banksoal-question'); if (sq) sq.addEventListener('input', () => { resetPageNumber('banksoal'); renderBankSoalQuestionList(); });
      const bps = document.getElementById('banksoal-page-size'); if (bps) bps.addEventListener('change', () => { resetPageNumber('banksoal'); renderBankSoalQuestionList(); });
      document.querySelectorAll('.banksoal-image-uploader').forEach(input => input.addEventListener('change', handleBankSoalImageUpload));

      // Dashboard Search Mapel Listener
      const sdm = document.getElementById('search-dashboard-mapel'); if (sdm) sdm.addEventListener('input', () => { resetPageNumber('dashboard'); renderDashboardActiveExamsTable(); });

      // Perubahan: Menghubungkan listener filter kelas di Dashboard
      const fdk = document.getElementById('filter-dashboard-kelas'); if (fdk) fdk.addEventListener('change', () => { resetPageNumber('dashboard'); renderDashboardActiveExamsTable(); });
      const dps = document.getElementById('dashboard-page-size'); if (dps) dps.addEventListener('change', () => { resetPageNumber('dashboard'); renderDashboardActiveExamsTable(); });

      // Student Controls Bindings
      safeAdd('btn-toggle-doubt', 'click', () => { const q = EXAM_STATE.scrambledQuestions[EXAM_STATE.currentIndex]; if (!q) return; EXAM_STATE.doubts[q.id] = !EXAM_STATE.doubts[q.id]; saveExamStateToLocal(); renderExamQuestion(); });
      safeAdd('btn-prev-question', 'click', () => { if (EXAM_STATE.currentIndex > 0) { EXAM_STATE.currentIndex--; saveExamStateToLocal(); renderExamQuestion(); } });
      safeAdd('btn-next-question', 'click', () => { if (EXAM_STATE.currentIndex < EXAM_STATE.scrambledQuestions.length - 1) { EXAM_STATE.currentIndex++; saveExamStateToLocal(); renderExamQuestion(); } });
      safeAdd('btn-finish-exam', 'click', () => {
        const t = EXAM_STATE.scrambledQuestions.length, a = Object.keys(EXAM_STATE.answers).length, d = Object.values(EXAM_STATE.doubts).some(v => v);
        if (d || a < t) return showNotification("Belum Selesai", "Periksa kembali naskah ragu-ragu dan lengkapi jawaban.", "danger");
        showConfirmation("Selesai Ujian", "Yakin ingin menyelesaikan ujian?", async () => { stopAntiCheatEngines(); clearInterval(EXAM_STATE.timerInterval); toggleLoader(true, "Mengirim..."); await finalizeExamAnswersAndGrade("Kirim Manual"); }, "check-check");
      });
      safeAdd('btn-close-sheet', 'click', () => toggleMobileSheet(false));
      safeAdd('btn-close-sheet-drag', 'click', () => toggleMobileSheet(false));

      // Profile Dropdown Bindings
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
        } else {
          showNotification("Ganti Password", "Siswa tidak diizinkan mengubah password mandiri. Silakan hubungi Proktor.", "info");
        }
      });
      safeAdd('btn-profile-logout', 'click', handleLogout);
    }

    async function initStudentExamView() {
      toggleLoader(true, "Mempersiapkan ujian..."); stopAdminRealtimeListeners();
      try {
        const schedDoc = await getDoc(getPublicDoc("Jadwal Ujian", CURRENT_USER.activeScheduleId));
        const pktDoc = await getDoc(getPublicDoc("Bank Soal", CURRENT_USER.activePacketId));
        if (!schedDoc.exists() || !pktDoc.exists()) throw new Error("Sesi ujian tidak tersedia. Silakan hubungi proktor.");
        const sched = schedDoc.data(); const pkt = pktDoc.data();
        sched.id = sched.id || CURRENT_USER.activeScheduleId;
        pkt.id_paket = pkt.id_paket || CURRENT_USER.activePacketId;
        EXAM_STATE.packet = pkt; EXAM_STATE.schedule = sched;
        document.querySelectorAll('.watermark-nis').forEach(w => w.innerText = CURRENT_USER.nis);
        const ls = myLocalStorage.getItem(`ar_cbt_state_${sched.id}_${CURRENT_USER.nis}`);
        if (ls) {
          let s = null;
          try { s = JSON.parse(ls); } catch (err) { s = null; }
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
      if (tEl) tEl.innerHTML = sanitizeHtmlContent(q.soal || '-');
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
          const optTextHtml = sanitizeHtmlContent(opt.text || '-');
          d.innerHTML = `<span class="monospace text-[10px] sm:text-xs font-extrabold w-5 h-5 sm:w-6 sm:h-6 rounded-lg flex items-center justify-center shrink-0 ${chk ? 'bg-primary text-white dark:bg-accent dark:text-slate-950' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}">${opt.key}</span><p class="text-[10px] sm:text-sm font-semibold leading-relaxed mt-0.5">${optTextHtml}</p>`;
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
        await setDoc(getPublicDoc("Session Ujian", `${CURRENT_USER.activeScheduleId}_${CURRENT_USER.nis}`), {
          id: `${CURRENT_USER.activeScheduleId}_${CURRENT_USER.nis}`,
          nis: CURRENT_USER.nis,
          waktu_terakhir: new Date().toISOString(),
          progress_total: Object.keys(EXAM_STATE.answers).length,
          total_soal: EXAM_STATE.scrambledQuestions.length,
          cheat_detected: (EXAM_STATE.cheatTabCount > 0 || EXAM_STATE.cheatFocusCount > 0)
        }, { merge: true });
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

    async function autoSubmitExam(r) { stopAntiCheatEngines(); if (EXAM_STATE.timerInterval) clearInterval(EXAM_STATE.timerInterval); toggleLoader(true, "Mengirim..."); await finalizeExamAnswersAndGrade(r); }

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
      stopAdminRealtimeListeners();
      CURRENT_USER = null;
      window.location.href = 'index.html';
    }

    window.toggleMobileSheet = function (show) {
      const sheet = document.getElementById('mobile-bottom-sheet');
      if (!sheet) return;
      if (show) {
        sheet.classList.remove('hidden', 'translate-y-full');
      } else {
        sheet.classList.add('translate-y-full', 'hidden');
      }
    }
