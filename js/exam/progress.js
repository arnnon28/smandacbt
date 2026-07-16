function buildExamProgressPayload(examState, options = {}) {
  const frozenSeconds = Math.max(0, Math.floor(Number(examState.timeRemaining) || 0));
  const allAnswers = examState.answers || {};
  const allDoubts = examState.doubts || {};
  let answersPayload = allAnswers;
  let includeDoubts = true;

  if (options.isDelta && options.previousAnswers && typeof options.previousAnswers === 'object') {
    const changed = {};
    Object.keys(allAnswers).forEach((qid) => {
      if (options.previousAnswers[qid] !== allAnswers[qid]) {
        changed[qid] = allAnswers[qid];
      }
    });
    Object.keys(options.previousAnswers).forEach((qid) => {
      if (!(qid in allAnswers)) {
        changed[qid] = null;
      }
    });
    answersPayload = changed;
  }

  if (options.isDelta && options.previousDoubts && typeof options.previousDoubts === 'object') {
    const prev = options.previousDoubts;
    const sameDoubts = Object.keys(allDoubts).length === Object.keys(prev).length
      && Object.keys(allDoubts).every((qid) => !!allDoubts[qid] === !!prev[qid]);
    includeDoubts = !sameDoubts;
  }

  const nowIso = new Date(getServerNowMs()).toISOString();
  const payload = {
    answers: answersPayload,
    currentIndex: examState.currentIndex || 0,
    timeRemaining: frozenSeconds,
    frozenTimeRemaining: frozenSeconds,
    timerFrozen: true,
    clientUpdatedAt: examState.clientUpdatedAt || nowIso,
    serverSyncedAt: nowIso,
    pausedAt: nowIso
  };
  if (includeDoubts) {
    payload.doubts = allDoubts;
  }
  if (options.isDelta) {
    return payload;
  }
  const scrambledQuestions = examState.scrambledQuestions || [];
  const scrambledOptions = examState.scrambledOptions || {};
  payload.scrambledQuestionIds = scrambledQuestions.map((q) => q.id);
  payload.scrambledOptionKeys = Object.fromEntries(
    Object.entries(scrambledOptions).map(([qId, opts]) => [
      qId,
      Array.isArray(opts) ? opts.map((o) => o.key || o) : opts
    ])
  );
  return payload;
}

function extractExamProgressFields(state) {
  if (!state || typeof state !== 'object') return null;
  const frozenTime = typeof state.frozenTimeRemaining === 'number'
    ? state.frozenTimeRemaining
    : (typeof state.timeRemaining === 'number' ? state.timeRemaining : null);
  const result = {
    answers: state.answers || {},
    doubts: state.doubts || {},
    scrambledQuestions: state.scrambledQuestions || [],
    scrambledOptions: state.scrambledOptions || {},
    scrambledQuestionIds: state.scrambledQuestionIds || [],
    scrambledOptionKeys: state.scrambledOptionKeys || {},
    currentIndex: Number.isInteger(state.currentIndex) ? state.currentIndex : 0,
    timeRemaining: frozenTime,
    frozenTimeRemaining: frozenTime,
    timerFrozen: state.timerFrozen !== false,
    clientUpdatedAt: state.clientUpdatedAt || null,
    serverSyncedAt: state.serverSyncedAt || null,
    pausedAt: state.pausedAt || null
  };
  if (!result.scrambledQuestions.length && result.scrambledQuestionIds.length) {
    result.scrambledQuestions = result.scrambledQuestionIds.map((id) => ({ id }));
  }
  return result;
}

function getExamProgressSyncMs(state) {
  if (!state) return 0;
  const raw = state.clientUpdatedAt || state.serverSyncedAt || state.pausedAt;
  if (!raw) return 0;
  const ms = new Date(raw).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

function pickNewerExamProgress(localState, cloudState) {
  if (!localState) return cloudState;
  if (!cloudState) return localState;
  const localMs = getExamProgressSyncMs(localState);
  const cloudMs = getExamProgressSyncMs(cloudState);
  if (localMs === 0 && cloudMs > 0) return cloudState;
  if (cloudMs === 0 && localMs > 0) return localState;
  return cloudMs >= localMs ? cloudState : localState;
}

function resolveResumedExamTimeRemaining(savedTimeRemaining, schedule, options = {}) {
  const useFrozenTime = options.useFrozenTime === true;
  const serverCap = typeof computeExamTimeRemainingSeconds === 'function'
    ? computeExamTimeRemainingSeconds(schedule)
    : (schedule?.durasi || 60) * 60;

  if (typeof savedTimeRemaining === 'number' && !Number.isNaN(savedTimeRemaining)) {
    const savedSec = Math.max(0, Math.floor(savedTimeRemaining));
    if (useFrozenTime) {
      return savedSec;
    }
    return Math.min(savedSec, Math.max(0, serverCap));
  }

  return Math.max(0, serverCap);
}

function isExamProgressRow(row) {
  if (!row || typeof row !== 'object') return false;
  if (isExamResultRow(row)) return false;
  const status = String(row.status || '').trim().toLowerCase();
  if (status === 'proses') return true;
  const jawaban = row.jawaban;
  if (!jawaban || typeof jawaban !== 'object') return false;
  if (Array.isArray(jawaban.scrambledQuestions) && jawaban.scrambledQuestions.length > 0) return true;
  if (Array.isArray(jawaban.scrambledQuestionIds) && jawaban.scrambledQuestionIds.length > 0) return true;
  return false;
}

async function loadCloudExamProgress(scheduleId, nis) {
  if (!scheduleId || !nis) return null;
  try {
    const ansDoc = await getDoc(getPublicDoc('Jawaban Siswa', `${scheduleId}_${nis}`, 'id,status,jawaban'));
    if (!ansDoc.exists()) return null;
    const data = ansDoc.data();
    if (!isExamProgressRow(data)) return null;
    return extractExamProgressFields(data.jawaban || {});
  } catch (err) {
    console.warn('loadCloudExamProgress failed', err);
    return null;
  }
}

function persistExamPauseKeepalive(examState, user) {
  return false;
}

function calculateExamScoreFromState(examState) {
  const questions = examState?.scrambledQuestions || [];
  let benar = 0;
  let salah = 0;
  questions.forEach((q) => {
    const answer = examState?.answers?.[q.id];
    if (answer === undefined) return;
    if (answer === (q.correct_key || 'A')) benar += 1;
    else salah += 1;
  });
  const total = questions.length;
  const nilai = total > 0 ? Math.round((benar / total) * 100) : 0;
  return { benar, salah, total, nilai };
}

function getSupabaseRestConfig() {
  if (!supabaseUrl || !supabaseKey) return null;
  return {
    baseUrl: supabaseUrl.replace(/\/$/, ''),
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      'Content-Type': 'application/json'
    }
  };
}

async function saveExamResultAndDeleteSession(examState, user, reason = 'Kirim Manual') {
  const schedule = examState?.schedule;
  if (!schedule?.id || !user?.nis) return false;
  const id = `${schedule.id}_${user.nis}`;

  try {
    const existing = await getDoc(getPublicDoc('Jawaban Siswa', id, 'id,status,nilai,jumlah_benar,jumlah_salah'));
    if (existing.exists() && isExamResultRow(existing.data())) {
      try { await deleteExamSessionById(id); } catch (_) {  }
      const row = existing.data();
      const total = (Number(row.jumlah_benar) || 0) + (Number(row.jumlah_salah) || 0);
      return {
        ok: true,
        nilai: row.nilai,
        jumlah_benar: row.jumlah_benar,
        total_soal: total || undefined
      };
    }
  } catch (err) {
    console.warn('saveExamResultAndDeleteSession precheck failed', err);
  }

  const progressPayload = buildExamProgressPayload(examState);
  const runFinish = async () => {
    const { data, error } = await supabaseClient.rpc('cbt_compute_and_finish_exam', {
      p_session_id: id,
      p_jawaban: progressPayload,
      p_penjelasan: reason,
      p_delete_session: true
    });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    return data;
  };
  const data = typeof retryWithBackoff === 'function'
    ? await retryWithBackoff(runFinish, { maxAttempts: 4, baseMs: 1000, maxMs: 12000 })
    : await runFinish();
  return {
    ok: true,
    nilai: data.nilai,
    jumlah_benar: data.jumlah_benar,
    total_soal: data.total_soal
  };
}

function normalizeBankSoalPacket(packet) {
  if (!packet || typeof packet !== 'object') return packet;
  const count = Array.isArray(packet.daftar_soal)
    ? packet.daftar_soal.length
    : Number(packet.jumlah_soal) || 0;
  return {
    ...packet,
    jumlah_soal: count,
    konten_versi: packet.konten_versi || ''
  };
}

function getBankSoalContentSignature(packetData) {
  const list = packetData?.daftar_soal;
  if (!Array.isArray(list)) return '';
  return list.map((q) => JSON.stringify({
    id: q.id,
    soal: q.soal || '',
    correct_key: q.correct_key || 'A',
    opsi: (q.opsi || []).map((o) => ({
      key: o.key || o,
      text: o.text || '',
      img: o.image?.id || (typeof o.image === 'string' ? o.image : (o.image?.data?.length || 0))
    })),
    image: q.image?.id || (typeof q.image === 'string' ? q.image : (q.image?.data?.length || 0))
  })).join('\n');
}

function mergeSavedExamWithBankSoal(savedState, packetData) {
  if (!savedState || !packetData?.daftar_soal || !Array.isArray(packetData.daftar_soal)) return savedState;

  const bankMap = Object.fromEntries(packetData.daftar_soal.map((q) => [q.id, q]));
  const oldQuestions = savedState.scrambledQuestions || [];
  const oldQuestionIds = savedState.scrambledQuestionIds || [];
  const hasCompactFormat = oldQuestions.length === 0 && oldQuestionIds.length > 0;
  const questionIds = hasCompactFormat ? oldQuestionIds : oldQuestions.map((q) => q.id);

  const scrambledQuestions = questionIds
    .map((id) => {
      const bankQ = bankMap[id];
      return bankQ ? { ...bankQ } : null;
    })
    .filter(Boolean);

  const existingIds = new Set(scrambledQuestions.map((q) => q.id));
  packetData.daftar_soal.forEach((q) => {
    if (!existingIds.has(q.id)) {
      scrambledQuestions.push({ ...q });
      existingIds.add(q.id);
    }
  });

  const answers = { ...(savedState.answers || {}) };
  const doubts = { ...(savedState.doubts || {}) };
  Object.keys(answers).forEach((qid) => {
    if (!existingIds.has(qid)) delete answers[qid];
  });
  Object.keys(doubts).forEach((qid) => {
    if (!existingIds.has(qid)) delete doubts[qid];
  });

  const scrambledOptionKeys = savedState.scrambledOptionKeys || {};
  const scrambledOptions = { ...(savedState.scrambledOptions || {}) };
  Object.keys(scrambledOptions).forEach((qid) => {
    if (!existingIds.has(qid)) delete scrambledOptions[qid];
  });

  scrambledQuestions.forEach((q) => {
    const bankQuestion = bankMap[q.id];
    if (!bankQuestion) return;
    const bankOpsi = Array.isArray(bankQuestion.opsi) ? bankQuestion.opsi : [];
    const bankKeys = new Set(bankOpsi.map((o) => o.key || o));

    if (scrambledOptionKeys[q.id] && !scrambledOptions[q.id]) {
      scrambledOptions[q.id] = scrambledOptionKeys[q.id]
        .map((key) => bankOpsi.find((o) => (o.key || o) === key) || null)
        .filter(Boolean);
      bankOpsi.forEach((opt) => {
        if (!scrambledOptions[q.id].some((o) => o.key === opt.key)) {
          scrambledOptions[q.id].push(opt);
        }
      });
      return;
    }

    if (!scrambledOptions[q.id]) {
      scrambledOptions[q.id] = [...bankOpsi].sort((a, b) =>
        String(a.key || '').localeCompare(String(b.key || ''))
      );
      return;
    }

    const previousAnswer = answers[q.id];
    const rebuilt = scrambledOptions[q.id]
      .map((opt) => {
        const key = opt.key || opt;
        return bankOpsi.find((o) => (o.key || o) === key) || null;
      })
      .filter(Boolean);
    bankOpsi.forEach((opt) => {
      if (!rebuilt.some((o) => o.key === opt.key)) rebuilt.push(opt);
    });
    scrambledOptions[q.id] = rebuilt.length ? rebuilt : [...bankOpsi];

    if (previousAnswer && !bankKeys.has(previousAnswer)) {
      delete answers[q.id];
    }
  });

  let currentIndex = Number.isInteger(savedState.currentIndex) ? savedState.currentIndex : 0;
  if (scrambledQuestions.length === 0) currentIndex = 0;
  else if (currentIndex >= scrambledQuestions.length) currentIndex = scrambledQuestions.length - 1;
  else if (currentIndex < 0) currentIndex = 0;

  return {
    ...savedState,
    answers,
    doubts,
    scrambledQuestions,
    scrambledOptions,
    currentIndex
  };
}
