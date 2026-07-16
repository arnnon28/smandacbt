function showExamRulesDialog() {
  showConfirmation("", `<div class="dialog-warning-content text-left space-y-3 leading-relaxed">
      <p class="dialog-warning-heading uppercase tracking-wide">ATURAN KEAMANAN :</p>
      <p>Jika Anda melakukan pelanggaran hingga 3 kali, ujian akan dihentikan secara otomatis dan nilai hanya dihitung dari soal yang sudah dijawab. "Pastikan koneksi internet stabil sebelum memulai."</p>
      <p class="dialog-warning-heading uppercase tracking-wide">JENIS PELANGGARAN :</p>
      <ul class="list-disc pl-5 space-y-0">
        <li>Dilarang buka Tab</li>
        <li>Dilarang buka Aplikasi lain / Notifikasi</li>
        <li>Dilarang keluar layar penuh ( Full Screen )</li>
        <li>Dilarang menutup layar / mengkunci layar otomatis</li>
        <li>Dilarang memutar layar ( Portrait / Landscape )</li>
        <li>Dilarang membelah layar ( Split View )</li>
      </ul>
      <p class="pt-1">Dengan menekan <span class="text-yellow-300 font-bold">Lanjutkan</span>, Layar akan masuk mode Layar Penuh ( Full Screen )</p>
    </div>`, async () => {
    window.__examStarted = true;
    markStudentActiveNow();
    examOrientationBaseline = window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
    if (typeof requestExamFullscreen === 'function') await requestExamFullscreen();
    startAntiCheatEngines();
    startExamTimer();
    startExamCloudSync();
    startIdleDetector();
    if (typeof startBankSoalPacketPoller === 'function') startBankSoalPacketPoller();
    renderExamQuestion();
    syncStudentActiveProgress(true);
    if (typeof safeCreateIcons === 'function') safeCreateIcons();
    else if (typeof lucide !== 'undefined') lucide.createIcons();
  }, "alert-triangle", () => {
    cancelExamSession();
  });
}

async function cancelExamSession() {
  window.__examFinalized = true;
  window.__examCancelRedirect = true;

  const dialog = document.getElementById('confirmation-dialog');
  if (dialog) dialog.classList.add('hidden');

  if (syncProgressTimer) {
    clearTimeout(syncProgressTimer);
    syncProgressTimer = null;
  }
  stopAntiCheatEngines();
  stopExamCloudSync();

  for (let i = 0; i < 30 && window.__cloudSyncInFlight; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  if (EXAM_STATE.timerInterval) {
    clearInterval(EXAM_STATE.timerInterval);
    EXAM_STATE.timerInterval = null;
  }

  const scheduleId = CURRENT_USER?.activeScheduleId || EXAM_STATE.schedule?.id;
  const nis = CURRENT_USER?.nis;
  const sessionId = scheduleId && nis ? `${scheduleId}_${nis}` : null;

  if (sessionId) {
    if (typeof deleteStudentExamSessionCompletely === 'function') {
      await deleteStudentExamSessionCompletely(sessionId);
    } else {
      await deleteExamSessionById(sessionId);
    }
    myLocalStorage.removeItem(`ar_cbt_state_${scheduleId}_${nis}`);
  }

  mySessionStorage.removeItem('cbt-session');
  CURRENT_USER = null;
  clearExamPageActive();
  window.location.replace('index.html');
}

async function initStudentExamView() {
  toggleLoader(true, "Mempersiapkan ujian..."); try {
    const cachedPacket = typeof getCachedPacket === 'function'
      ? getCachedPacket(CURRENT_USER.activePacketId)
      : null;
    let sched = null;
    const cachedSchedStr = mySessionStorage.getItem('cbt-schedule');
    if (cachedSchedStr) {
      try {
        sched = JSON.parse(cachedSchedStr);
        mySessionStorage.removeItem('cbt-schedule');
      } catch (e) {}
    }
    if (!sched) {
      const schedCols = 'id,mapel,id_paket,mulai,selesai,durasi,kelas_terpilih,token,tampil_nilai';
      const schedDoc = await getDoc(getPublicDoc("Jadwal Ujian", CURRENT_USER.activeScheduleId, schedCols));
      if (!schedDoc.exists()) throw new Error("Sesi ujian tidak tersedia. Silakan hubungi proktor.");
      sched = schedDoc.data();
    }
    let pkt = cachedPacket;
    if (!pkt) {
      const remotePacketVersion = typeof peekBankSoalContentVersion === 'function'
        ? await peekBankSoalContentVersion(CURRENT_USER.activePacketId)
        : null;
      pkt = typeof loadBankSoalPacketMatchingVersion === 'function' && remotePacketVersion
        ? await loadBankSoalPacketMatchingVersion(CURRENT_USER.activePacketId, remotePacketVersion)
        : await loadBankSoalPacket(CURRENT_USER.activePacketId);
      if (!pkt) throw new Error("Sesi ujian tidak tersedia. Silakan hubungi proktor.");
      setCachedPacket(CURRENT_USER.activePacketId, pkt);
    }
    await prepareServerTimeAndValidateExamWindow(sched);
    if (CURRENT_USER?.kelas) ensureStudentKelasAllowed(sched, CURRENT_USER.kelas);
    const serverRemainingSec = typeof computeExamTimeRemainingSeconds === 'function'
      ? computeExamTimeRemainingSeconds(sched)
      : (sched.durasi || 0) * 60;
    sched.id = sched.id || CURRENT_USER.activeScheduleId;
    pkt.id_paket = pkt.id_paket || CURRENT_USER.activePacketId;
    EXAM_STATE.schedule = sched;
    document.querySelectorAll('.watermark-nis').forEach(w => w.innerText = CURRENT_USER.nis);

    const ls = myLocalStorage.getItem(`ar_cbt_state_${sched.id}_${CURRENT_USER.nis}`);
    let localState = null;
    if (ls) {
      try { localState = JSON.parse(ls); } catch (err) { localState = null; }
    }

    const localProgress = typeof extractExamProgressFields === 'function'
      ? extractExamProgressFields(localState)
      : localState;
    let cloudProgress = null;
    const cachedProgressStr = mySessionStorage.getItem('cbt-resume-progress');
    if (cachedProgressStr) {
      try {
        cloudProgress = JSON.parse(cachedProgressStr);
        mySessionStorage.removeItem('cbt-resume-progress');
      } catch (e) {}
    }
    if (!cloudProgress) {
      cloudProgress = typeof loadCloudExamProgress === 'function'
        ? await loadCloudExamProgress(sched.id, CURRENT_USER.nis)
        : null;
    }

    const forceCloudResume = mySessionStorage.getItem('cbt-resume-exam') === '1';
    if (forceCloudResume) mySessionStorage.removeItem('cbt-resume-exam');

    let savedProgress = typeof pickNewerExamProgress === 'function'
      ? pickNewerExamProgress(localProgress, cloudProgress)
      : (localProgress || cloudProgress);

    if (forceCloudResume && cloudProgress) {
      const base = savedProgress || cloudProgress;
      const cloudTime = typeof cloudProgress.frozenTimeRemaining === 'number'
        ? cloudProgress.frozenTimeRemaining
        : cloudProgress.timeRemaining;
      savedProgress = {
        ...base,
        timeRemaining: typeof cloudTime === 'number' ? cloudTime : base.timeRemaining,
        frozenTimeRemaining: typeof cloudTime === 'number' ? cloudTime : base.frozenTimeRemaining,
        timerFrozen: true,
        scrambledQuestions: (Array.isArray(base.scrambledQuestions) && base.scrambledQuestions.length)
          ? base.scrambledQuestions
          : cloudProgress.scrambledQuestions,
        scrambledOptions: (base.scrambledOptions && Object.keys(base.scrambledOptions).length)
          ? base.scrambledOptions
          : cloudProgress.scrambledOptions
      };
    }

    if (savedProgress) {
      const merged = typeof mergeSavedExamWithBankSoal === 'function'
        ? mergeSavedExamWithBankSoal(savedProgress, pkt)
        : savedProgress;
      EXAM_STATE.answers = merged.answers || {};
      EXAM_STATE.doubts = merged.doubts || {};
      EXAM_STATE.scrambledQuestions = merged.scrambledQuestions || [];
      EXAM_STATE.scrambledOptions = merged.scrambledOptions || {};
      EXAM_STATE.currentIndex = Number.isInteger(merged.currentIndex) ? merged.currentIndex : 0;
      const frozenSeconds = typeof merged.frozenTimeRemaining === 'number'
        ? merged.frozenTimeRemaining
        : merged.timeRemaining;
      EXAM_STATE.timeRemaining = typeof resolveResumedExamTimeRemaining === 'function'
        ? resolveResumedExamTimeRemaining(frozenSeconds, sched, { useFrozenTime: true })
        : Math.max(0, Math.floor(frozenSeconds || 0));
      EXAM_STATE.clientUpdatedAt = merged.clientUpdatedAt || merged.serverSyncedAt || merged.pausedAt || null;
      window.__examTimerFrozen = true;
      saveExamStateToLocal();
    } else {
      EXAM_STATE.scrambledQuestions = [...(pkt.daftar_soal || [])].sort(() => Math.random() - 0.5);
      EXAM_STATE.scrambledQuestions.forEach(q => { EXAM_STATE.scrambledOptions[q.id] = [...(q.opsi || [])].sort((a, b) => String(a.key || '').localeCompare(String(b.key || ''))); });
      EXAM_STATE.currentIndex = 0;
      EXAM_STATE.timeRemaining = serverRemainingSec;
      window.__examTimerFrozen = false;
      saveExamStateToLocal();
    }

    const preferredSize = myLocalStorage.getItem('fontSizePreference')
      || ({ kecil: 'small', sedang: 'medium', besar: 'large' }[myLocalStorage.getItem('unbk-preferred-fontsize')] || 'medium');
    populateExamHeader();
    changeExamFontSize(preferredSize);
    switchView('student-exam');
    if (typeof bindExamViewportSyncListeners === 'function') bindExamViewportSyncListeners();
    if (typeof syncExamViewportLayout === 'function') syncExamViewportLayout();
    startStudentExamRealtimeUpdates();

    if (typeof startStudentSessionAlertListener === 'function') {
      startStudentSessionAlertListener();
    }

    if (isExamPageActiveFlag() && wasPageReloaded() && EXAM_STATE.scrambledQuestions.length > 0) {
      showNotification("Curang Terdeteksi", "Refresh halaman tidak diizinkan. Ujian otomatis dikirim.", "danger");
      autoSubmitExam("Refresh Halaman");
      return;
    }

    syncTimerDisplay();
    showExamRulesDialog();
  } catch (err) {
    mySessionStorage.setItem('cbt-login-status-msg', JSON.stringify({
      variant: 'error',
      title: 'Sesi Error',
      message: err.message || 'Sesi ujian tidak tersedia.'
    }));
    handleLogout();
  } finally {
    toggleLoader(false);
  }
}
