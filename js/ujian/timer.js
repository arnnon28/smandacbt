function stopExamTimer() {
  if (EXAM_STATE.timerInterval) {
    clearInterval(EXAM_STATE.timerInterval);
    EXAM_STATE.timerInterval = null;
  }
}

function syncTimerDisplay() {
  if (typeof EXAM_STATE.timeRemaining !== 'number' || isNaN(EXAM_STATE.timeRemaining)) {
    EXAM_STATE.timeRemaining = 0;
  }
  const hr = Math.floor(EXAM_STATE.timeRemaining / 3600).toString().padStart(2, '0');
  const mn = Math.floor((EXAM_STATE.timeRemaining % 3600) / 60).toString().padStart(2, '0');
  const sc = (EXAM_STATE.timeRemaining % 60).toString().padStart(2, '0');
  const timeStr = `${hr}:${mn}:${sc}`;
  const tmr = document.getElementById('exam-timer');
  const timerContainer = document.getElementById('timer-container');
  if (tmr) tmr.innerText = timeStr;
  if (timerContainer) {
    if (EXAM_STATE.timeRemaining < 300 && EXAM_STATE.timeRemaining > 0) {
      timerContainer.classList.add('animate-pulse');
    } else {
      timerContainer.classList.remove('animate-pulse');
    }
  }
}

function startExamTimer() {

  if (window.__examTimerPausedForProctor) return;
  stopExamTimer();
  let serverResyncCounter = 0;
  let serverResyncThreshold = 900 + Math.floor(Math.random() * 300);
  const useFrozenTime = window.__examTimerFrozen === true;
  let lastServerTickMs = (typeof getServerNowMs === 'function') ? getServerNowMs() : Date.now();

  if (typeof resolveResumedExamTimeRemaining === 'function' && EXAM_STATE.schedule) {
    EXAM_STATE.timeRemaining = resolveResumedExamTimeRemaining(
      EXAM_STATE.timeRemaining,
      EXAM_STATE.schedule,
      { useFrozenTime }
    );
  }

  window.__examTimerFrozen = false;
  syncTimerDisplay();

  let localStorageWriteCounter = 0;
  let tickAccumMs = 0;
  let tickInProgress = false;
  EXAM_STATE.timerInterval = setInterval(async () => {
    if (tickInProgress) return;
    tickInProgress = true;
    try {
      serverResyncCounter += 1;
      if (serverResyncCounter >= serverResyncThreshold && typeof syncServerTimeOffset === 'function') {
        serverResyncCounter = 0;
        serverResyncThreshold = 900 + Math.floor(Math.random() * 300);
        await syncServerTimeOffset(false).catch(() => {});
      }

      const nowServerMs = (typeof getServerNowMs === 'function') ? getServerNowMs() : Date.now();
      tickAccumMs += Math.max(0, nowServerMs - lastServerTickMs);
      lastServerTickMs = nowServerMs;
      const elapsedSec = Math.floor(tickAccumMs / 1000);
      if (elapsedSec > 0) {
        tickAccumMs -= elapsedSec * 1000;
        EXAM_STATE.timeRemaining -= elapsedSec;
      }

      if (typeof EXAM_STATE.timeRemaining !== 'number' || isNaN(EXAM_STATE.timeRemaining) || EXAM_STATE.timeRemaining <= 0) {
        EXAM_STATE.timeRemaining = 0;
        stopExamTimer();
        syncTimerDisplay();
        if (window.__examFinalized || window.__examSubmitInFlight || window.__examEndSubmitScheduled) return;
        window.__examEndSubmitScheduled = true;
        const staggerMs = typeof computeExamEndSubmitStaggerMs === 'function'
          ? computeExamEndSubmitStaggerMs(CURRENT_USER?.nis)
          : Math.floor(Math.random() * 30000);
        if (typeof toggleLoader === 'function') {
          toggleLoader(true, staggerMs > 1500
            ? 'Waktu habis. Mempersiapkan pengiriman jawaban...'
            : 'Mengirim...');
        }
        setTimeout(() => {
          autoSubmitExam('Durasi Habis');
        }, staggerMs);
        return;
      }
      localStorageWriteCounter += 1;
      if (localStorageWriteCounter % 10 === 0) saveExamStateToLocal({ skipCloudSchedule: true });
      syncTimerDisplay();
    } finally {
      tickInProgress = false;
    }
  }, 1000);
}

function startIdleDetector() {
  stopIdleDetector();
  idleLastActiveMs = Date.now();
  idleCheckInterval = setInterval(() => {
    if (!isStudentExamActive()) return;
    if (!window.__examStarted || window.__examFinalized || window.__examSubmitInFlight || window.__proctorResetLogoutInProgress) return;
    if (isStudentAdminAlertVisible()) return;
    if (Date.now() - idleLastActiveMs >= EXAM_IDLE_TIMEOUT_MS) {
      handleIdleAutoResetLogout();
    }
  }, 5000);
}
