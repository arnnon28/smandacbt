function getScrambledQuestionsFromJawaban(jawaban) {
  if (!jawaban || typeof jawaban !== 'object') return [];
  if (Array.isArray(jawaban.scrambledQuestions) && jawaban.scrambledQuestions.length > 0) {
    return jawaban.scrambledQuestions;
  }
  if (Array.isArray(jawaban.scrambledQuestionIds) && jawaban.scrambledQuestionIds.length > 0) {
    return jawaban.scrambledQuestionIds.map((id) => ({ id }));
  }
  return [];
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
  if (!total && activeResult?.jawaban) {
    const sq = getScrambledQuestionsFromJawaban(activeResult.jawaban);
    if (sq.length) total = sq.length;
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

function calculateMonitorScore(ss) {
  const nilai = Number(ss?.progress_nilai);
  if (Number.isFinite(nilai)) {
    return Math.round(Math.max(0, Math.min(100, nilai)));
  }
  const total = Number(ss?.total_soal);
  if (Number.isFinite(total) && total > 0) return 0;
  return null;
}

function formatMonitorScoreText(score) {
  if (score === null || score === undefined || Number.isNaN(Number(score))) return '-';
  return String(Math.round(Math.max(0, Math.min(100, Number(score)))));
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

function resultHasAnswerMap(result) {
  const answers = normalizeResultAnswerMap(result);
  return Object.keys(answers).length > 0;
}

function buildStudentItemAnalysis(result, schedules = [], packets = []) {
  const answers = normalizeResultAnswerMap(result);
  const schedule = resolveScheduleFromResult(result, schedules);
  const packet = schedule ? packets.find(p => p.id_paket === schedule.id_paket) : null;
  const questionMap = new Map((packet?.daftar_soal || []).map(q => [q.id, q]));

  let questionIds = [];
  if (packet?.daftar_soal?.length) {
    questionIds = packet.daftar_soal.map(q => q.id);
  } else if (result?.jawaban) {
    const sq = getScrambledQuestionsFromJawaban(result.jawaban);
    if (sq.length) questionIds = sq.map(q => q.id);
  }
  if (!questionIds.length) {
    questionIds = Object.keys(answers);
  }

  const items = questionIds.map((qId, index) => {
    const q = questionMap.get(qId);
    const studentAnswer = answers[qId] ?? null;
    const correctKey = q?.correct_key || (q ? 'A' : '-');
    let status = 'kosong';
    if (studentAnswer) {
      status = (correctKey !== '-' && studentAnswer === correctKey) ? 'benar' : 'salah';
    }
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
  if (!html || typeof html !== 'string') return html || '';
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const keyRegex = /(?:kunci(?: jawaban)?|jawaban|answer)\s*[:\-]?\s*[A-Ea-e]/i;
  doc.body.querySelectorAll('*').forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const text = node.textContent.trim();
      if (keyRegex.test(text) && text.replace(keyRegex, '').trim() === '') {
        node.remove();
      }
    }
  });
  return doc.body.innerHTML.replace(new RegExp(keyRegex.source, 'gi'), '').trim();
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

function formatStudentNameForDisplay(name, options = {}) {
  const maxLength = options.maxLength ?? 28;
  const raw = String(name || '').trim();
  if (!raw) return 'Siswa';

  const titleCase = (word) => {
    const lower = String(word || '').toLowerCase();
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  };

  const isMuhammadName = (word) => /^muhamm?ad$/i.test(String(word || '').trim());
  const parts = raw.split(/\s+/).filter(Boolean);
  const fullFormatted = parts.map((part) => (isMuhammadName(part) ? 'Muhammad' : titleCase(part))).join(' ');

  const isPortraitMobile = typeof options.isPortraitMobile === 'boolean'
    ? options.isPortraitMobile
    : window.matchMedia('(orientation: portrait) and (max-width: 768px)').matches;

  const shouldShorten = isPortraitMobile && (parts.length >= 3 || fullFormatted.length > maxLength);
  if (!shouldShorten) return fullFormatted;

  if (parts.length === 1) return titleCase(parts[0]);

  const displayParts = [];
  let index = 0;

  if (isMuhammadName(parts[0])) {
    displayParts.push('M.');
    index = 1;
    if (index < parts.length) {
      displayParts.push(titleCase(parts[index]));
      index += 1;
    }
  } else {
    displayParts.push(titleCase(parts[0]));
    index = 1;
  }

  const remaining = parts.slice(index);
  if (!remaining.length) return displayParts.join(' ');

  if (remaining.length === 1) {
    displayParts.push(remaining[0].charAt(0).toUpperCase());
    return displayParts.join(' ');
  }

  displayParts.push(remaining.map((part) => part.charAt(0).toUpperCase()).join('.'));
  return displayParts.join(' ');
}

function isExamResultRow(result) {
  if (!result || typeof result !== 'object') return false;
  const status = String(result.status || '').trim().toLowerCase();
  if (status === 'selesai') return true;
  if (result.nilai !== null && result.nilai !== undefined && String(result.nilai).trim() !== '') return true;
  if (result.jumlah_benar !== null && result.jumlah_benar !== undefined) return true;
  return false;
}

function normalizeJawabanRow(row, fallbackId) {
  if (!row || typeof row !== 'object') return null;
  const normalized = { ...row };
  if (!normalized.id && fallbackId) normalized.id = fallbackId;

  const status = String(normalized.status || '').trim().toLowerCase();
  if (status === 'selesai') normalized.status = 'Selesai';
  else if (status === 'proses') normalized.status = 'Proses';

  if (isExamResultRow(normalized) && normalized.status !== 'Selesai') {
    normalized.status = 'Selesai';
  }

  if ((normalized.nilai === null || normalized.nilai === undefined) && normalized.jumlah_benar != null) {
    const benar = Number(normalized.jumlah_benar) || 0;
    const salah = Number(normalized.jumlah_salah) || 0;
    const total = benar + salah;
    if (total > 0) normalized.nilai = Math.round((benar / total) * 100);
  }

  return normalized;
}

function mapJawabanSnapshotRows(snapshot) {
  return normalizeRealtimeSnapshot(snapshot)
    .map((doc) => normalizeJawabanRow(
      typeof doc?.data === 'function' ? doc.data() : doc,
      doc?.id
    ))
    .filter(Boolean);
}

function isExamResultSaved(result) {
  return isExamResultRow(result);
}

async function deleteExamSessionById(sessionId) {
  if (!sessionId) return false;
  try {
    await deleteDoc(getPublicDoc('Session Ujian', sessionId));
    return true;
  } catch (err) {
    console.warn(`deleteExamSessionById failed for ${sessionId}`, err);
    return false;
  }
}

async function deleteStudentExamSessionCompletely(sessionId) {
  if (!sessionId) return;
  await deleteExamSessionById(sessionId);
  try {
    const ansDoc = await getDoc(getPublicDoc('Jawaban Siswa', sessionId, 'id,status'));
    if (ansDoc.exists() && ansDoc.data().status === 'Proses') {
      await deleteDoc(getPublicDoc('Jawaban Siswa', sessionId));
    }
  } catch (err) {
    console.warn(`deleteStudentExamSessionCompletely jawaban cleanup failed for ${sessionId}`, err);
  }
}

async function cleanupExamSessionForResult(result) {
  if (!isExamResultSaved(result) || !result.id) return false;
  return deleteExamSessionById(result.id);
}

async function cleanupCompletedExamSessions(results = []) {
  const completed = (results || []).filter(isExamResultSaved);
  if (!completed.length) return 0;
  const ids = completed.map(r => r.id).filter(Boolean);
  if (!ids.length) return 0;
  try {
    const { data, error } = await supabaseClient.rpc('cbt_cleanup_sessions', { p_session_ids: ids });
    if (error) throw error;
    return data || 0;
  } catch (e) {
    if (e.message?.includes('does not exist') || e.code === 'PGRST202') {
      console.warn('cleanupCompletedExamSessions: RPC cbt_cleanup_sessions belum tersedia. Jatuh ke mode individual.');
      const cleaned = await Promise.all(completed.map(cleanupExamSessionForResult));
      return cleaned.filter(Boolean).length;
    }
    console.warn('cleanupCompletedExamSessions failed', e);
    return 0;
  }
}

function createImageAsset(dataUrl) {
  return {
    name: `img_${Math.random().toString(36).substring(2, 7)}`,
    data: dataUrl
  };
}

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

function compactExamHtmlSpacing(html) {
  if (!html || typeof html !== 'string') return '';
  let out = String(html)
    .replace(/\r\n|\r/g, '\n')
    .replace(/\n{2,}/g, ' ')
    .replace(/\n/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\u00a0/g, ' ');

  out = out
    .replace(/(\s*<br\s*\/?>\s*){2,}/gi, ' ')
    .replace(/<p>\s*(?:<br\s*\/?>)?\s*<\/p>/gi, '')
    .replace(/<div>\s*(?:<br\s*\/?>)?\s*<\/div>/gi, '')
    .replace(/<\/p>\s*<p[^>]*>/gi, ' ')
    .replace(/<\/?p[^>]*>/gi, '')
    .replace(/<\/?div[^>]*>/gi, '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return out;
}

function sanitizeHtmlContent(html) {
  if (!html || typeof html !== 'string') return '';
  html = String(html).replace(/\r\n|\r/g, '\n').replace(/\n{2,}/g, '\n');
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
    [...node.attributes].forEach((attr) => {
      const name = attr.name.toLowerCase();
      if (!allowedAttrs.includes(name)) {
        node.removeAttribute(attr.name);
        return;
      }
      if (name === 'style') {
        const sanitizedStyles = attr.value.split(';').map((rule) => rule.trim()).filter((rule) => {
          return /^(font-weight|font-style|text-decoration|vertical-align|color|background-color|max-width|height|display|margin|padding)$/.test(rule);
        }).join('; ');
        if (sanitizedStyles) node.setAttribute('style', sanitizedStyles);
        else node.removeAttribute('style');
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
  return compactExamHtmlSpacing(doc.body.innerHTML);
}
