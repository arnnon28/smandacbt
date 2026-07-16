let heartbeatInterval = null;

async function sendExamHeartbeat() {
  if (!EXAM_STATE.schedule?.id || !CURRENT_USER?.nis) return;
  const id = `${EXAM_STATE.schedule.id}_${CURRENT_USER.nis}`;
  try {
    const { error } = await supabaseClient
      .from('Session Ujian')
      .update({ waktu_terakhir: new Date().toISOString() })
      .eq('id', id);
    if (error) console.warn('Heartbeat failed', error);
  } catch (err) {
    console.warn('Heartbeat error', err);
  }
}

function startExamCloudSync() {
  if (heartbeatInterval) clearInterval(heartbeatInterval);
  sendExamHeartbeat();
  heartbeatInterval = setInterval(sendExamHeartbeat, 60000);
}

function stopExamCloudSync() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function touchExamClientUpdatedAt() {
  const nowIso = new Date(typeof getServerNowMs === 'function' ? getServerNowMs() : Date.now()).toISOString();
  EXAM_STATE.clientUpdatedAt = nowIso;
  return nowIso;
}

function saveExamStateToLocal(options = {}) {
  if (!EXAM_STATE.schedule?.id || !CURRENT_USER?.nis) return;
  touchExamClientUpdatedAt();
  const key = `ar_cbt_state_${EXAM_STATE.schedule.id}_${CURRENT_USER.nis}`;
  const slim = {
    answers: EXAM_STATE.answers || {},
    doubts: EXAM_STATE.doubts || {},
    scrambledQuestionIds: (EXAM_STATE.scrambledQuestions || []).map((q) => q.id),
    scrambledOptionKeys: Object.fromEntries(
      Object.entries(EXAM_STATE.scrambledOptions || {}).map(([qId, opts]) => [
        qId,
        Array.isArray(opts) ? opts.map((o) => o.key || o) : opts
      ])
    ),
    currentIndex: EXAM_STATE.currentIndex || 0,
    timeRemaining: EXAM_STATE.timeRemaining || 0,
    frozenTimeRemaining: EXAM_STATE.timeRemaining || 0,
    timerFrozen: !!window.__examTimerFrozen,
    clientUpdatedAt: EXAM_STATE.clientUpdatedAt || null,
    serverSyncedAt: EXAM_STATE.serverSyncedAt || null
  };
  try {
    myLocalStorage.setItem(key, JSON.stringify(slim));
  } catch (err) {
    console.warn('saveExamStateToLocal failed', err);
  }
}

async function flushExamProgressToCloud(maxWaitMs = 4000) {
}

async function syncStudentActiveProgress(force = false, options = {}) {
  return;
}
