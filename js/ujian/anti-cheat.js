function shouldSkipDuplicateViolation() {
  const now = Date.now();
  if (now - examViolationLastAt < 900) return true;
  examViolationLastAt = now;
  return false;
}

function registerExamTabViolation(source) {
  if (!isStudentExamActive() || window.__examFinalized || window.__examSubmitInFlight || window.__proctorResetLogoutInProgress || isStudentAdminAlertVisible()) return;
  if (shouldSkipDuplicateViolation()) return;
  EXAM_STATE.cheatTabCount = (EXAM_STATE.cheatTabCount || 0) + 1;
  syncStudentActiveProgress(true, { allowHeartbeat: true });
  if (EXAM_STATE.cheatTabCount >= 3) {
    const reason = source === 'fullscreen'
      ? 'Keluar Mode Layar Penuh'
      : source === 'split'
        ? 'Belah Layar'
        : 'Keluar Layar/Tab';
    showNotification('Curang Terdeteksi', 'Ujian otomatis dikirim.', 'danger');
    autoSubmitExam(reason);
    return;
  }
  const msg = source === 'fullscreen'
    ? `Wajib layar penuh! (${EXAM_STATE.cheatTabCount}/3)`
    : source === 'split'
      ? `Belah layar dicegah. Lanjutkan ujian. (${EXAM_STATE.cheatTabCount}/3)`
      : `Jangan keluar halaman! (${EXAM_STATE.cheatTabCount}/3)`;
  showNotification('Peringatan', msg, 'danger');
  if (typeof requestExamFullscreen === 'function') requestExamFullscreen();
}

function registerExamBackgroundViolation() {
  if (!isStudentExamActive() || window.__examFinalized || window.__examSubmitInFlight || window.__proctorResetLogoutInProgress) return;
  if (shouldSkipDuplicateViolation()) return;
  EXAM_STATE.cheatFocusCount = (EXAM_STATE.cheatFocusCount || 0) + 1;
  syncStudentActiveProgress(true, { allowHeartbeat: true });
  showNotification('Peringatan', `Kembali lagi ke ujian. (${EXAM_STATE.cheatFocusCount}x keluar layar)`, 'info');
}

function handleNativeFullscreenExit() {
  const platform = typeof detectExamPlatform === 'function' ? detectExamPlatform() : {};
  if (platform.usesImmersiveFallback && !window.__examNativeFullscreenActive) return;
  registerExamTabViolation('fullscreen');
}

function startAntiCheatEngines() {
  if (window.__antiCheatEnginesActive) {
    markExamPageActive();
    return;
  }
  window.__antiCheatEnginesActive = true;
  EXAM_STATE.cheatTabCount = 0; EXAM_STATE.cheatFocusCount = 0; EXAM_STATE.splitScreenDetected = false;
  window.__examNativeFullscreenActive = false;
  examViolationLastAt = 0;
  markExamPageActive();
  document.addEventListener('contextmenu', blockEvent);
  document.addEventListener('keydown', blockInspections);
  window.addEventListener('beforeunload', handleBeforeUnload);
  window.addEventListener('pageshow', handleExamPageShow);

  window.onblur = () => {
    if (!CURRENT_USER || CURRENT_USER.role === 'admin') return;
    const platform = typeof detectExamPlatform === 'function' ? detectExamPlatform() : {};
    if (platform.isMobile) return;
    if (document.visibilityState === 'hidden') {
      registerExamBackgroundViolation();
    } else {
      registerExamTabViolation('blur');
    }
  };

  window._examFocusHandler = function () {
    EXAM_STATE.cheatFocusCount = 0;
    try { updateExamProgressUI(); } catch (e) {  }
    try { if (typeof toggleMobileSheet === 'function') toggleMobileSheet(false); } catch (e) {}
    if (typeof requestExamFullscreen === 'function') requestExamFullscreen();
    if (typeof syncExamViewportLayout === 'function') syncExamViewportLayout();
  };
  window.onfocus = window._examFocusHandler;

  window._examVisibilityHandler = function () {
    if (!isStudentExamActive() || window.__examFinalized) return;
    const platform = typeof detectExamPlatform === 'function' ? detectExamPlatform() : {};
    if (document.visibilityState === 'hidden') {
      if (platform.isMobile) {
        registerExamTabViolation('visibility');
      } else if (!document.hasFocus()) {
        registerExamTabViolation('visibility');
      } else {
        registerExamBackgroundViolation();
      }
    } else {
      EXAM_STATE.cheatFocusCount = 0;
      try { updateExamProgressUI(); } catch (e) {  }
      try { if (typeof toggleMobileSheet === 'function') toggleMobileSheet(false); } catch (e) {}
      if (platform.isMobile && typeof requestExamFullscreen === 'function') {
        requestExamFullscreen();
      }
      if (typeof syncExamViewportLayout === 'function') syncExamViewportLayout();
    }
  };
  document.addEventListener('visibilitychange', window._examVisibilityHandler);

  if (typeof bindExamFullscreenListeners === 'function') {
    bindExamFullscreenListeners(handleNativeFullscreenExit);
  }
  if (typeof bindExamMobileSecurityListeners === 'function') {
    bindExamMobileSecurityListeners();
  }
  if (typeof bindExamViewportSyncListeners === 'function') {
    bindExamViewportSyncListeners();
  }

  startSplitScreenMonitor();
  startStudentSessionAlertListener();

  if (!window.__examRotateBound) {
    window.__examRotateBound = true;
    window._examOrientationHandler = () => {
      if (!isStudentExamActive() || window.__examFinalized || window.__proctorResetLogoutInProgress) return;
      if (!window.__examStarted) return;
      const nowOri = window.matchMedia('(orientation: portrait)').matches ? 'portrait' : 'landscape';
      if (!examOrientationBaseline) examOrientationBaseline = nowOri;
      if (nowOri !== examOrientationBaseline) {
        registerExamTabViolation('rotate');
        examOrientationBaseline = nowOri;
      }
      if (typeof syncExamViewportLayout === 'function') syncExamViewportLayout();
    };
    window.addEventListener('orientationchange', window._examOrientationHandler);
  }
}

function stopAntiCheatEngines() {
  window.__antiCheatEnginesActive = false;
  document.removeEventListener('contextmenu', blockEvent);
  document.removeEventListener('keydown', blockInspections);
  window.removeEventListener('beforeunload', handleBeforeUnload);
  window.removeEventListener('pageshow', handleExamPageShow);
  window.onblur = null;
  if (window._examFocusHandler) {
    window.onfocus = null;
    delete window._examFocusHandler;
  }
  if (window._examVisibilityHandler) {
    document.removeEventListener('visibilitychange', window._examVisibilityHandler);
    delete window._examVisibilityHandler;
  }
  if (window._examOrientationHandler) {
    window.removeEventListener('orientationchange', window._examOrientationHandler);
    delete window._examOrientationHandler;
    window.__examRotateBound = false;
  }
  if (typeof unbindExamFullscreenListeners === 'function') unbindExamFullscreenListeners();
  if (typeof unbindExamMobileSecurityListeners === 'function') unbindExamMobileSecurityListeners();
  if (typeof unbindExamViewportSyncListeners === 'function') unbindExamViewportSyncListeners();
  if (typeof exitExamFullscreen === 'function') exitExamFullscreen();
  stopSplitScreenMonitor();
  stopStudentExamListeners();
  clearExamPageActive();
}
function blockEvent(e) { e.preventDefault(); }

function blockInspections(e) {
  if (isStudentAdminAlertVisible()) {
    e.preventDefault();
    return false;
  }
  const key = e.key || '';
  const keyCode = e.keyCode || e.which;
  if (keyCode === 123 || (e.ctrlKey && e.shiftKey && (keyCode === 73 || keyCode === 74)) || (e.ctrlKey && keyCode === 85)) {
    e.preventDefault();
    return false;
  }
  if (keyCode === 116 || ((e.ctrlKey || e.metaKey) && (key.toLowerCase() === 'r' || keyCode === 82))) {
    e.preventDefault();
    showRefreshBlockedWarning();
    return false;
  }
}
