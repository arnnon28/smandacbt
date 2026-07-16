function setupInteractiveListeners() {
  const safeAdd = (id, event, callback) => { const el = document.getElementById(id); if (el) el.addEventListener(event, callback); };

  safeAdd('chk-ragu', 'change', (e) => {
    markStudentActiveNow();
    const q = EXAM_STATE.scrambledQuestions[EXAM_STATE.currentIndex];
    if (!q) return;
    EXAM_STATE.doubts[q.id] = e.target.checked;
    if (!e.target.checked) delete EXAM_STATE.doubts[q.id];
    saveExamStateToLocal();
    updateExamProgressUI();
    renderDesktopMapGrid();
  });
  safeAdd('btn-prev-question', 'click', () => { markStudentActiveNow(); navigateExamQuestion(-1); });
  safeAdd('btn-next-question', 'click', () => { markStudentActiveNow(); navigateExamQuestion(1); });
  safeAdd('btn-direct-finish-exam', 'click', () => {
    markStudentActiveNow();
    if (isExamReadyToFinish()) {
      showFinishModal();
    }
  });
  safeAdd('btn-direct-finish-exam-mobile', 'click', () => {
    markStudentActiveNow();
    if (isExamReadyToFinish()) {
      showFinishModal();
    }
  });
  safeAdd('btn-confirm-finish-exam', 'click', async () => {
    markStudentActiveNow();
    hideFinishModal();
    toggleLoader(true, "Mengirim...");
    await finalizeExamAnswersAndGrade("Kirim Manual");
  });

  const fontSizeBtn = document.getElementById('fontSizeBtn');
  const fontSizeMenu = document.getElementById('fontSizeMenu');
  if (fontSizeBtn && fontSizeMenu) {
    fontSizeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      fontSizeMenu.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
      if (!fontSizeMenu.classList.contains('hidden') && !fontSizeBtn.contains(e.target) && !fontSizeMenu.contains(e.target)) {
        fontSizeMenu.classList.add('hidden');
      }
    });
  }

  document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleTheme());
  });

  if (!idleBound) {
    idleBound = true;
    const bump = () => markStudentActiveNow();
    ['mousemove', 'mousedown', 'keydown', 'touchstart', 'touchmove', 'scroll'].forEach(ev => {
      window.addEventListener(ev, bump, { passive: true });
    });
    window.addEventListener('focus', bump);
    document.addEventListener('visibilitychange', bump);
  }
}

function handleExamPageHide() {
  if (window.__examSaveOnExitDone) return;
  if (window.__examFinalized || window.__examSubmitInFlight || window.__examCancelRedirect || window.__proctorResetLogoutInProgress) return;
  if (!window.__examStarted || !CURRENT_USER || !EXAM_STATE.schedule?.id) return;
  window.__examSaveOnExitDone = true;
  stopExamTimer();
  if (typeof persistExamPauseKeepalive === 'function') {
    persistExamPauseKeepalive(EXAM_STATE, CURRENT_USER);
  }
}

if (!window.__examPageHideBound) {
  window.__examPageHideBound = true;
  window.addEventListener('pagehide', handleExamPageHide);
}
