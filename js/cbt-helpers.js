const getSafeStorage = (storageType) => {
  try {
    const storage = window[storageType];
    const testKey = '__google_sites_test__';
    storage.setItem(testKey, testKey);
    storage.removeItem(testKey);
    return storage;
  } catch (e) {
    console.warn(`[ARCBT-SECURITY] ${storageType} diblokir. Menggunakan memori sementara.`);
    const memoryStore = {};
    return {
      getItem: (key) => memoryStore[key] || null,
      setItem: (key, val) => { memoryStore[key] = String(val); },
      removeItem: (key) => { delete memoryStore[key]; },
      clear: () => { for (let k in memoryStore) delete memoryStore[k]; }
    };
  }
};

const myLocalStorage = getSafeStorage('localStorage');
const mySessionStorage = getSafeStorage('sessionStorage');

const { supabaseUrl, supabaseKey } = window.__ARCBT_CONFIG__ || {};
const supabaseClient = (window.supabase || supabase).createClient(supabaseUrl, supabaseKey);

function getPrimaryKeyColumn(table) {
  if (table === 'Admin') return 'username';
  if (table === 'Siswa') return 'nis';
  if (table === 'Bank Soal') return 'id_paket';
  return 'id';
}

function getPublicCollection(collectionName) {
  return { collectionName };
}

function getPublicDoc(collectionName, docId) {
  if (!collectionName || !docId) {
    throw new Error(`Invalid document reference: collectionName="${collectionName}" docId="${docId}"`);
  }
  return { collectionName, docId };
}

async function getDoc(ref) {
  const pk = getPrimaryKeyColumn(ref.collectionName);
  const { data, error } = await supabaseClient
    .from(ref.collectionName)
    .select('*')
    .eq(pk, ref.docId)
    .maybeSingle();
  if (error) {
    console.error("getDoc error:", error);
    throw error;
  }
  return {
    exists: () => data !== null,
    data: () => data
  };
}

async function getDocs(collectionRef) {
  const { data, error } = await supabaseClient
    .from(collectionRef.collectionName)
    .select('*');
  if (error) {
    console.error("getDocs error:", error);
    throw error;
  }
  return {
    docs: data.map(row => ({
      id: row[getPrimaryKeyColumn(collectionRef.collectionName)],
      data: () => row
    }))
  };
}

async function setDoc(ref, payload, options = {}) {
  const pk = getPrimaryKeyColumn(ref.collectionName);
  let dataToSave = { [pk]: ref.docId, ...payload };
  if (options.merge) {
    try {
      const existing = await getDoc(ref);
      if (existing.exists()) {
        dataToSave = { ...existing.data(), ...dataToSave };
      }
    } catch (e) {
      console.warn('setDoc merge read failed, continuing with partial payload', e);
    }
  }
  const { error } = await supabaseClient
    .from(ref.collectionName)
    .upsert(dataToSave);
  if (error) {
    console.error("setDoc error:", error);
    throw error;
  }
}

async function deleteDoc(ref) {
  const pk = getPrimaryKeyColumn(ref.collectionName);
  const { error } = await supabaseClient
    .from(ref.collectionName)
    .delete()
    .eq(pk, ref.docId);
  if (error) {
    console.error("deleteDoc error:", error);
    throw error;
  }
}

function writeBatch(db) {
  const sets = {};
  const deletes = {};
  return {
    set: (ref, payload) => {
      const table = ref.collectionName;
      const pk = getPrimaryKeyColumn(table);
      if (!sets[table]) sets[table] = [];
      sets[table].push({ [pk]: ref.docId, ...payload });
    },
    update: (ref, payload) => {
      const table = ref.collectionName;
      const pk = getPrimaryKeyColumn(table);
      if (!sets[table]) sets[table] = [];
      sets[table].push({ [pk]: ref.docId, ...payload });
    },
    delete: (ref) => {
      const table = ref.collectionName;
      if (!deletes[table]) deletes[table] = [];
      deletes[table].push(ref.docId);
    },
    commit: async () => {
      const promises = [];
      for (const [table, rows] of Object.entries(sets)) {
        if (rows.length === 0) continue;
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          promises.push(
            supabaseClient.from(table).upsert(chunk).then(({ error }) => {
              if (error) throw error;
            })
          );
        }
      }
      for (const [table, ids] of Object.entries(deletes)) {
        if (ids.length === 0) continue;
        const pk = getPrimaryKeyColumn(table);
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          promises.push(
            supabaseClient.from(table).delete().in(pk, chunk).then(({ error }) => {
              if (error) throw error;
            })
          );
        }
      }
      await Promise.all(promises);
    }
  };
}

function onSnapshot(collectionRef, callback) {
  const tableName = collectionRef.collectionName;
  const pk = getPrimaryKeyColumn(tableName);
  let activeData = [];

  const loadData = async () => {
    try {
      const { data, error } = await supabaseClient.from(tableName).select('*');
      if (error) throw error;
      activeData = data;
      triggerCallback();
    } catch (e) {
      console.error("onSnapshot load error:", e);
    }
  };

  const triggerCallback = () => {
    callback({
      forEach: (fn) => {
        activeData.forEach(row => {
          fn({
            id: row[pk],
            data: () => row
          });
        });
      }
    });
  };

  const channel = supabaseClient
    .channel(`public:${tableName}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, async (payload) => {
      await loadData();
    })
    .subscribe();

  const pollInterval = setInterval(loadData, 2000);

  loadData();

  return () => {
    clearInterval(pollInterval);
    supabaseClient.removeChannel(channel);
  };
}

async function initAuth() {
  return { uid: "anonymous" };
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
  if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
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
  if (isWarning) {
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
  if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
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

function fitAdminHeaderText() {
  const container = document.getElementById('header-text-container');
  if (!container) return;

  const isPortraitMobile = window.matchMedia('(orientation: portrait) and (max-width: 768px)').matches;
  const configs = [
    { el: document.getElementById('header-school-name'), max: isPortraitMobile ? 13 : 18, min: 6 },
    { el: document.getElementById('header-exam-title'), max: isPortraitMobile ? 9 : 12, min: 6 }
  ];

  configs.forEach(({ el, max, min }) => {
    if (!el) return;
    el.style.whiteSpace = 'nowrap';
    el.style.overflow = 'hidden';
    el.style.textOverflow = 'clip';
    el.style.lineHeight = '1.15';
    el.style.maxWidth = '100%';
    let size = max;
    el.style.fontSize = `${size}px`;
    while (size > min && el.scrollWidth > container.clientWidth) {
      size -= 0.5;
      el.style.fontSize = `${size}px`;
    }
    if (el.scrollWidth > container.clientWidth) {
      el.style.whiteSpace = 'normal';
      el.style.wordBreak = 'break-word';
      el.style.lineHeight = '1.2';
    }
  });
}

function fitConfirmationDialogText() {
  const panel = document.querySelector('#confirmation-dialog .confirmation-dialog-panel');
  const messageEl = document.getElementById('dialog-message');
  const titleEl = document.getElementById('dialog-title');
  if (!panel || !messageEl) return;

  const isPortraitMobile = window.matchMedia('(orientation: portrait) and (max-width: 768px)').matches;
  if (!isPortraitMobile) {
    if (titleEl) titleEl.style.fontSize = '';
    messageEl.style.fontSize = '';
    panel.style.overflowY = '';
    messageEl.style.overflowY = '';
    return;
  }

  panel.style.overflowY = 'hidden';
  messageEl.style.overflowY = 'hidden';

  let titleSize = 18;
  let msgSize = 12;
  if (titleEl) titleEl.style.fontSize = `${titleSize}px`;
  messageEl.style.fontSize = `${msgSize}px`;

  const minTitle = 13;
  const minMsg = 9;
  while ((panel.scrollHeight > panel.clientHeight || messageEl.scrollHeight > messageEl.clientHeight) && (titleSize > minTitle || msgSize > minMsg)) {
    if (titleSize > minTitle) {
      titleSize -= 0.5;
      if (titleEl) titleEl.style.fontSize = `${titleSize}px`;
    }
    if (msgSize > minMsg) {
      msgSize -= 0.5;
      messageEl.style.fontSize = `${msgSize}px`;
    }
  }
}

function initAdminHeaderAutoFit() {
  fitAdminHeaderText();
  if (window.__adminHeaderFitBound) return;
  window.__adminHeaderFitBound = true;
  window.addEventListener('resize', fitAdminHeaderText);
  window.addEventListener('orientationchange', () => setTimeout(fitAdminHeaderText, 120));
  window.addEventListener('resize', fitConfirmationDialogText);
  window.addEventListener('orientationchange', () => setTimeout(fitConfirmationDialogText, 120));
}

function countLiveExamAnswers(activeResult) {
  if (!activeResult || activeResult.status !== 'Proses') return null;
  const jawaban = activeResult.jawaban;
  if (!jawaban || typeof jawaban !== 'object') return null;
  if (jawaban.answers && typeof jawaban.answers === 'object' && !Array.isArray(jawaban.answers)) {
    return Object.keys(jawaban.answers).length;
  }
  return null;
}

function formatMonitorProgress(ss, schedules = [], packets = [], activeResult = null) {
  const liveAnswered = countLiveExamAnswers(activeResult);
  const sessionAnswered = Number(ss?.progress_total);
  const answered = liveAnswered !== null
    ? liveAnswered
    : (Number.isFinite(sessionAnswered) ? sessionAnswered : 0);

  let total = Number(ss?.total_soal) || 0;
  if (!total && activeResult?.jawaban?.scrambledQuestions?.length) {
    total = activeResult.jawaban.scrambledQuestions.length;
  }
  if (!total && schedules.length && packets.length) {
    const sched = schedules.find(s => ss?.id && String(ss.id).startsWith(String(s.id) + '_'));
    if (sched) {
      const pkt = packets.find(p => p.id_paket === sched.id_paket);
      total = pkt?.daftar_soal?.length || 0;
    }
  }
  if (total > 0) return `${answered}/${total} soal`;
  return answered > 0 ? `${answered} soal` : '0 soal';
}

function calculateMonitorScore(ss, activeResult, schedules = [], packets = []) {
  if (!activeResult) return '-';
  
  if (activeResult.status === 'Selesai') {
    return activeResult.nilai !== undefined ? activeResult.nilai : '-';
  }

  const answers = activeResult.jawaban?.answers || {};
  const scrambledQuestions = activeResult.jawaban?.scrambledQuestions || [];
  
  let questions = scrambledQuestions;
  if (!questions || questions.length === 0) {
    const sched = schedules.find(s => ss?.id && String(ss.id).startsWith(String(s.id) + '_'));
    const pkt = sched ? packets.find(p => p.id_paket === sched.id_paket) : null;
    questions = pkt?.daftar_soal || [];
  }
  
  if (questions.length === 0) return '-';
  
  let correctCount = 0;
  questions.forEach(q => {
    const answeredValue = answers[q.id];
    if (answeredValue !== undefined) {
      if (answeredValue === (q.correct_key || 'A')) {
        correctCount++;
      }
    }
  });
  
  const total = questions.length;
  return total > 0 ? Math.round((correctCount / total) * 100) : 0;
}


function stripHtmlToText(html) {
  if (!html || typeof html !== 'string') return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
}

function truncateText(text, maxLen = 100) {
  const value = String(text || '').trim();
  if (value.length <= maxLen) return value;
  return `${value.slice(0, maxLen).trim()}...`;
}

function normalizeResultAnswerMap(result) {
  const jawaban = result?.jawaban;
  if (!jawaban || typeof jawaban !== 'object' || Array.isArray(jawaban)) return {};
  if (jawaban.answers && typeof jawaban.answers === 'object' && !Array.isArray(jawaban.answers)) {
    return jawaban.answers;
  }
  return jawaban;
}

function resolveScheduleFromResult(result, schedules = []) {
  if (!result?.id) return null;
  const direct = schedules.find(s => String(result.id).startsWith(String(s.id) + '_'));
  if (direct) return direct;
  const scheduleId = String(result.id).includes('_')
    ? String(result.id).slice(0, String(result.id).lastIndexOf('_'))
    : null;
  return schedules.find(s => String(s.id) === String(scheduleId)) || null;
}

function buildStudentItemAnalysis(result, schedules = [], packets = []) {
  const answers = normalizeResultAnswerMap(result);
  const schedule = resolveScheduleFromResult(result, schedules);
  const packet = schedule ? packets.find(p => p.id_paket === schedule.id_paket) : null;
  const questionMap = new Map((packet?.daftar_soal || []).map(q => [q.id, q]));

  let questionIds = Array.isArray(result?.urutan_soal) ? [...result.urutan_soal] : [];
  if (!questionIds.length && result?.jawaban?.scrambledQuestions?.length) {
    questionIds = result.jawaban.scrambledQuestions.map(q => q.id);
  }
  if (!questionIds.length) {
    questionIds = Object.keys(answers);
  }
  if (!questionIds.length) {
    questionIds = (packet?.daftar_soal || []).map(q => q.id);
  }

  const items = questionIds.map((qId, index) => {
    const q = questionMap.get(qId);
    const studentAnswer = answers[qId] ?? null;
    const correctKey = q?.correct_key || 'A';
    let status = 'kosong';
    if (studentAnswer) status = studentAnswer === correctKey ? 'benar' : 'salah';
    return {
      no: index + 1,
      id: qId,
      soal: q?.soal || '-',
      studentAnswer,
      correctKey,
      status,
      opsi: q?.opsi || []
    };
  });

  return {
    student: {
      nis: result?.nis || '-',
      nama: result?.nama || '-',
      kelas: result?.kelas || '-',
      mapel: result?.mapel || '-',
      nilai: result?.nilai ?? '-'
    },
    summary: {
      total: items.length,
      benar: items.filter(i => i.status === 'benar').length,
      salah: items.filter(i => i.status === 'salah').length,
      kosong: items.filter(i => i.status === 'kosong').length
    },
    items,
    packetName: packet?.nama_paket || '-'
  };
}

function stripQuestionKeyFromHtml(html) {
  return String(html || '').replace(/kunci\s*(?:jawaban)?\s*[:\-]?\s*[A-E]/gi, '');
}

function getItemAnalysisStatusText(status) {
  if (status === 'benar') return 'Benar';
  if (status === 'salah') return 'Salah';
  return 'Kosong';
}

function downloadItemAnalysisPdf(analysis) {
  if (!analysis) {
    if (typeof showNotification === 'function') showNotification('Gagal', 'Data analisis tidak tersedia.', 'danger');
    return;
  }
  if (typeof window.jspdf === 'undefined') {
    if (typeof showNotification === 'function') showNotification('Gagal', 'Modul PDF belum siap. Muat ulang halaman.', 'danger');
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF('p', 'mm', 'a4');
  const schoolName = (typeof myLocalStorage !== 'undefined' && myLocalStorage.getItem('er_sh_name')) || 'SMA NEGERI 2 KUNINGAN';
  const { student, summary, items, packetName } = analysis;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('Analisis Butir Soal', 14, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  doc.text(String(schoolName), 14, 21);
  doc.text(`${student.nama} (${student.nis})`, 14, 27);
  doc.text(`${student.kelas} • ${student.mapel} • ${packetName}`, 14, 33);
  doc.text(`Nilai: ${student.nilai}  |  Benar: ${summary.benar}  |  Salah: ${summary.salah}  |  Kosong: ${summary.kosong}`, 14, 39);

  const rows = (items || []).map(item => [
    item.no,
    truncateText(stripHtmlToText(stripQuestionKeyFromHtml(item.soal)), 220),
    item.studentAnswer || '-',
    item.correctKey,
    getItemAnalysisStatusText(item.status)
  ]);

  if (typeof doc.autoTable === 'function') {
    doc.autoTable({
      startY: 44,
      head: [['No', 'Butir Soal', 'Jawaban', 'Kunci', 'Status']],
      body: rows.length ? rows : [['-', 'Data butir soal tidak tersedia', '-', '-', '-']],
      styles: { fontSize: 8, cellPadding: 2.2, valign: 'top', overflow: 'linebreak' },
      headStyles: { fillColor: [35, 65, 152], textColor: 255, fontStyle: 'bold' },
      columnStyles: {
        0: { cellWidth: 10, halign: 'center' },
        1: { cellWidth: 95, halign: 'left' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 20, halign: 'center' },
        4: { cellWidth: 22, halign: 'center' }
      },
      margin: { left: 14, right: 14 }
    });
  }

  const safeName = String(student.nis || 'siswa').replace(/[^\w-]+/g, '_');
  doc.save(`Analisis_Butir_Soal_${safeName}.pdf`);
}

function downloadCurrentItemAnalysisPdf() {
  downloadItemAnalysisPdf(window.__currentItemAnalysis);
}

// Bind to window to allow global access
window.getSafeStorage = getSafeStorage;
window.myLocalStorage = myLocalStorage;
window.mySessionStorage = mySessionStorage;
window.supabaseClient = supabaseClient;
window.getPrimaryKeyColumn = getPrimaryKeyColumn;
window.getPublicCollection = getPublicCollection;
window.getPublicDoc = getPublicDoc;
window.getDoc = getDoc;
window.getDocs = getDocs;
window.setDoc = setDoc;
window.deleteDoc = deleteDoc;
window.writeBatch = writeBatch;
window.onSnapshot = onSnapshot;
window.initAuth = initAuth;
window.showNotification = showNotification;
window.showConfirmation = showConfirmation;
window.compressImageToTargetSize = compressImageToTargetSize;
window.fitAdminHeaderText = fitAdminHeaderText;
window.fitConfirmationDialogText = fitConfirmationDialogText;
window.initAdminHeaderAutoFit = initAdminHeaderAutoFit;
window.countLiveExamAnswers = countLiveExamAnswers;
window.formatMonitorProgress = formatMonitorProgress;
window.calculateMonitorScore = calculateMonitorScore;
window.stripHtmlToText = stripHtmlToText;
window.truncateText = truncateText;
window.normalizeResultAnswerMap = normalizeResultAnswerMap;
window.resolveScheduleFromResult = resolveScheduleFromResult;
window.buildStudentItemAnalysis = buildStudentItemAnalysis;
window.downloadItemAnalysisPdf = downloadItemAnalysisPdf;
window.downloadCurrentItemAnalysisPdf = downloadCurrentItemAnalysisPdf;
window.db = {};
