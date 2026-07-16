function isStudentAdminAlertVisible() {
  const modal = document.getElementById('student-admin-alert-modal');
  return modal && !modal.classList.contains('hidden');
}

function pauseExamTimerForProctorAlert() {
  if (!window.__examStarted || window.__examFinalized || window.__examTimerPausedForProctor) return;
  if (!EXAM_STATE.timerInterval) return;
  window.__examTimerPausedForProctor = true;
  window.__examTimerFrozen = true;
  stopExamTimer();
  saveExamStateToLocal();
  syncStudentActiveProgress(true);
}

function resumeExamTimerAfterProctorAlert() {
  if (!window.__examTimerPausedForProctor) return;
  window.__examTimerPausedForProctor = false;
  if (!window.__examStarted || window.__examFinalized || !isStudentExamActive()) return;
  window.__examTimerFrozen = true;
  startExamTimer();
}

function showStudentAdminAlert(message, alertId) {
  const modal = document.getElementById('student-admin-alert-modal');
  const messageEl = document.getElementById('student-admin-alert-message');
  if (!modal || !messageEl) return;
  const nextAlertId = alertId || String(Date.now());
  const wasVisible = isStudentAdminAlertVisible();
  if (currentStudentAlertId === nextAlertId && wasVisible) return;
  currentStudentAlertId = nextAlertId;
  messageEl.textContent = String(message || '').trim();
  modal.classList.remove('hidden');
  document.body.classList.add('student-admin-alert-open');
  document.body.style.overflow = 'hidden';
  if (!wasVisible) pauseExamTimerForProctorAlert();
  if (typeof requestExamFullscreen === 'function') requestExamFullscreen();
}

function hideStudentAdminAlert() {
  const modal = document.getElementById('student-admin-alert-modal');
  if (!modal) return;
  const wasVisible = isStudentAdminAlertVisible();
  currentStudentAlertId = null;
  modal.classList.add('hidden');
  document.body.classList.remove('student-admin-alert-open');
  if (!isStudentExamActive() || window.__examFinalized) {
    document.body.style.overflow = '';
  }
  if (wasVisible) resumeExamTimerAfterProctorAlert();
}

function stopStudentExamListeners() {
  stopStudentSessionAlertListener();
  stopIdleDetector();
  if (typeof stopStudentExamRealtimeUpdates === 'function') stopStudentExamRealtimeUpdates();
}

function markStudentActiveNow() {
  idleLastActiveMs = Date.now();
}

function stopIdleDetector() {
  if (idleCheckInterval) {
    clearInterval(idleCheckInterval);
    idleCheckInterval = null;
  }
}

async function handleIdleAutoResetLogout() {
  if (window.__idleAutoLogoutInProgress || window.__proctorResetLogoutInProgress || window.__examSubmitInFlight || window.__examFinalized) return;
  window.__idleAutoLogoutInProgress = true;
  window.__proctorResetLogoutInProgress = true;
  stopExamTimer();
  window.__examTimerFrozen = true;
  try {
    if (typeof flushExamProgressToCloud === 'function') {
      await flushExamProgressToCloud(4000);
    } else {
      await syncStudentActiveProgress(true, { forceJawaban: true });
    }
  } catch (_) {  }

  try {

    const sessionId = `${CURRENT_USER.activeScheduleId}_${CURRENT_USER.nis}`;
    await setDoc(getPublicDoc("Session Ujian", sessionId), {
      force_reset: true,
      force_reset_reason: 'idle_5m',
      force_reset_at: new Date(typeof getServerNowMs === 'function' ? getServerNowMs() : Date.now()).toISOString()
    }, { merge: true });
  } catch (_) {  }

  window.__proctorForcedLogout = true;
  clearExamPageActive();
  stopAntiCheatEngines();
  stopSplitScreenMonitor();
  hideSplitScreenWarningModal();
  if (unsubscribeSessionAlert) {
    unsubscribeSessionAlert();
    unsubscribeSessionAlert = null;
  }
  hideStudentAdminAlert();
  mySessionStorage.setItem(
    'cbt-proctor-reset-msg',
    'Perangkat tidak aktif selama 5 menit. Waktu ujian dibekukan dan Anda dikeluarkan dari sesi. Login kembali untuk melanjutkan dengan jawaban dan sisa waktu yang tersimpan.'
  );
  mySessionStorage.setItem('cbt-resume-exam', '1');
  mySessionStorage.removeItem('cbt-session');
  CURRENT_USER = null;
  if (typeof exitExamFullscreen === 'function') {
    try { await exitExamFullscreen(); } catch (_) {  }
  } else if (document.fullscreenElement) {
    try { await document.exitFullscreen(); } catch (_) {  }
  }
  setTimeout(() => {
    window.location.href = 'index.html';
  }, 350);
}

function startStudentSessionAlertListener() {
  if (!firebaseUser || !CURRENT_USER || CURRENT_USER.role === 'admin') return;
  const sessionId = `${CURRENT_USER.activeScheduleId}_${CURRENT_USER.nis}`;
  if (!CURRENT_USER.activeScheduleId || !CURRENT_USER.nis) return;
  if (unsubscribeSessionAlert) unsubscribeSessionAlert();
  if (typeof restPollSessionById === 'function') {
    unsubscribeSessionAlert = restPollSessionById(sessionId, (snap) => {

      const canHandleForceSignal = () =>
        !window.__examFinalized
        && !window.__proctorResetLogoutInProgress;
      const isSubmitBusy = () =>
        !!window.__examSubmitInFlight || !!window.__examSubmitPreparing;

      const canShowProctorChat = () =>
        isStudentExamActive()
        && canHandleForceSignal()
        && !isSubmitBusy();

      if (snap.exists()) {
        const data = snap.data() || {};
        if (data.force_finished === true) {
          hideStudentAdminAlert();
          if (isSubmitBusy()) {
            window.__pendingProctorFinishBy = data.force_finished_by || 'proktor';
            return;
          }
          if (canHandleForceSignal()) {
            handleProctorFinishLogout(data.force_finished_by);
          }
          return;
        }
        if (data.force_reset === true) {
          hideStudentAdminAlert();
          if (isSubmitBusy()) {
            window.__pendingProctorReset = true;
            return;
          }
          if (canHandleForceSignal()) {
            handleProctorResetLogout();
          }
          return;
        }
        if (isSessionAdminAlertActive(data)) {
          if (canShowProctorChat()) {
            showStudentAdminAlert(data.admin_alert_message, data.admin_alert_id);
          }
        } else {
          hideStudentAdminAlert();
        }
        return;
      }

      hideStudentAdminAlert();
      if (!canHandleForceSignal() || isSubmitBusy()) {
        if (isSubmitBusy()) window.__pendingProctorReset = true;
        return;
      }
      let settled = false;
      const finishAsReset = () => {
        if (settled || !canHandleForceSignal()) return;
        settled = true;
        handleProctorResetLogout();
      };
      const finishAsDone = () => {
        if (settled || !canHandleForceSignal()) return;
        settled = true;
        handleProctorFinishLogout('proktor');
      };

      const fallbackTimer = setTimeout(finishAsReset, 600);
      if (typeof getDoc === 'function' && typeof getPublicDoc === 'function') {
        getDoc(getPublicDoc('Jawaban Siswa', sessionId, 'id,status'))
          .then((ansDoc) => {
            clearTimeout(fallbackTimer);
            const finished = ansDoc.exists()
              && String(ansDoc.data()?.status || '').trim().toLowerCase() === 'selesai';
            if (finished) finishAsDone();
            else finishAsReset();
          })
          .catch(() => {
            clearTimeout(fallbackTimer);
            finishAsReset();
          });
      } else {
        clearTimeout(fallbackTimer);
        finishAsReset();
      }
    }, (err) => {
      console.warn('startStudentSessionAlertListener failed', err);
    }, {

      pollIntervalMs: (typeof EXAM_SESSION_ALERT_USE_REALTIME === 'boolean' && EXAM_SESSION_ALERT_USE_REALTIME)
        ? (typeof EXAM_SESSION_ALERT_FALLBACK_MS === 'number' ? EXAM_SESSION_ALERT_FALLBACK_MS : 15000)
        : (typeof REST_ALERT_POLL_MS === 'number' ? REST_ALERT_POLL_MS : 120000),
      useRealtime: typeof EXAM_SESSION_ALERT_USE_REALTIME === 'boolean'
        ? EXAM_SESSION_ALERT_USE_REALTIME
        : true
    });
  }
}

function stopStudentSessionAlertListener() {
  if (unsubscribeSessionAlert) {
    unsubscribeSessionAlert();
    unsubscribeSessionAlert = null;
  }
  hideStudentAdminAlert();
}
