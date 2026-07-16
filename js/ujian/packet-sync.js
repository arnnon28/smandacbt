function applyBankSoalUpdateToExamState(packetData, options = {}) {
  if (!packetData || window.__examFinalized || window.__examSubmitInFlight) return false;
  const sig = typeof getBankSoalContentSignature === 'function'
    ? getBankSoalContentSignature(packetData)
    : '';
  if (sig && sig === window.__lastBankSoalSignature) return false;
  const hadSignature = !!window.__lastBankSoalSignature;
  window.__lastBankSoalSignature = sig;
  if (packetData.konten_versi) {
    window.__lastBankSoalContentVersion = String(packetData.konten_versi);
  }

  const prevIndex = EXAM_STATE.currentIndex || 0;
  const merged = typeof mergeSavedExamWithBankSoal === 'function'
    ? mergeSavedExamWithBankSoal({
      answers: EXAM_STATE.answers,
      doubts: EXAM_STATE.doubts,
      scrambledQuestions: EXAM_STATE.scrambledQuestions,
      scrambledOptions: EXAM_STATE.scrambledOptions,
      currentIndex: EXAM_STATE.currentIndex,
      timeRemaining: EXAM_STATE.timeRemaining
    }, packetData)
    : null;
  if (!merged) return false;

  EXAM_STATE.answers = merged.answers || {};
  EXAM_STATE.doubts = merged.doubts || {};
  EXAM_STATE.scrambledQuestions = merged.scrambledQuestions || [];
  EXAM_STATE.scrambledOptions = merged.scrambledOptions || {};
  EXAM_STATE.currentIndex = Number.isInteger(merged.currentIndex) ? merged.currentIndex : prevIndex;

  saveExamStateToLocal({ skipCloudSchedule: true });
  try {
    if (typeof updateExamProgressUI === 'function') updateExamProgressUI();
    if (typeof renderDesktopMapGrid === 'function') renderDesktopMapGrid();
    renderExamQuestion();
  } catch (e) {  }

  if (options.notify !== false && hadSignature && typeof showNotification === 'function') {
    showNotification('Soal Diperbarui', 'Perubahan soal dari proktor telah diterapkan. Jawaban Anda tetap tersimpan.', 'info');
  }
  return true;
}

async function loadBankSoalPacketMatchingVersion(packetId, remoteVersion) {
  let packetData = typeof loadBankSoalPacket === 'function'
    ? await loadBankSoalPacket(packetId, {
      preferStorage: true,
      forceRefresh: true,
      versionChanged: true,
      cacheBust: true
    })
    : null;
  if (packetData && remoteVersion && String(packetData.konten_versi || '') !== remoteVersion) {
    packetData = await loadBankSoalPacket(packetId, {
      preferStorage: false,
      forceRefresh: true,
      versionChanged: true,
      cacheBust: true
    });
  }
  return packetData;
}

let lastFreshCheckAt = 0;

async function pollStudentBankSoalUpdates() {
  return false;
}

async function ensureExamBankSoalFreshOnAction() {
  if (!CURRENT_USER?.activePacketId) return false;
  const now = Date.now();
  if (now - lastFreshCheckAt < 12000) return false;
  lastFreshCheckAt = now;

  try {
    const packetId = CURRENT_USER.activePacketId;
    const { data, error } = await supabaseClient
      .from('Bank Soal')
      .select('konten_versi')
      .eq('id_paket', packetId)
      .single();

    if (error) {
      console.warn('Freshness check failed:', error);
      return false;
    }

    const remoteVersion = String(data?.konten_versi || '');
    const localVersion = String(window.__lastBankSoalContentVersion || '');

    if (remoteVersion && remoteVersion !== localVersion) {
      const updatedPacket = await loadBankSoalPacketMatchingVersion(packetId, remoteVersion);
      if (updatedPacket) {
        applyBankSoalUpdateToExamState(updatedPacket, { notify: true });
        if (typeof setCachedPacket === 'function') {
          setCachedPacket(packetId, updatedPacket);
        }
        return true;
      }
    }
  } catch (err) {
    console.warn('ensureExamBankSoalFreshOnAction error:', err);
  }
  return false;
}

function stopStudentExamRealtimeUpdates() {
}

async function startStudentExamRealtimeUpdates() {
  if (!CURRENT_USER?.activePacketId) return;
  try {
    const packetId = CURRENT_USER.activePacketId;
    let packetData = typeof getCachedPacket === 'function'
      ? getCachedPacket(packetId)
      : null;

    if (!packetData) {
      packetData = await loadBankSoalPacket(packetId, { preferStorage: true });
    }

    if (packetData) {
      applyBankSoalUpdateToExamState(packetData, { notify: false });
      if (typeof setCachedPacket === 'function') setCachedPacket(packetId, packetData);
    }
  } catch (err) {
    console.warn('Gagal memuat paket soal:', err);
  }
}

function startBankSoalPacketPoller() {
}
