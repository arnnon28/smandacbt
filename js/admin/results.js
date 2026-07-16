function renderResultsCards() {
  const c = document.getElementById('results-table-body');
  const table = document.getElementById('results-table');
  if (!c || !table) return;
  const sv = (document.getElementById('filter-result-search')?.value || '').toLowerCase();
  const cf = document.getElementById('filter-result-kelas')?.value || '';
  const mf = document.getElementById('filter-result-mapel')?.value || '';
  const sortVal = document.getElementById('filter-result-sort')?.value || 'kelas-nama';
  const pageSize = getPageSizeFromSelect('result-page-size', 50);
  let pageNumber = getPageNumber('results');
  const filtered = ALL_RESULTS.filter(r => {
    const nis = String(r.nis || '').toLowerCase();
    const nama = String(r.nama || '').toLowerCase();
    const mapelKey = cleanMapelName(r.mapel || '');
    const filterMapel = String(mf || '').trim();
    const mapelMatch = !filterMapel || mapelKey === filterMapel || String(r.mapel || '').trim() === filterMapel;
    const finished = typeof isExamResultRow === 'function' ? isExamResultRow(r) : r.status === 'Selesai';
    return finished && (nis.includes(sv) || nama.includes(sv)) && (!cf || r.kelas === cf) && mapelMatch;
  }).sort((a, b) => {
    if (sortVal === 'nilai-desc') {
      return (Number(b.nilai) || 0) - (Number(a.nilai) || 0);
    } else if (sortVal === 'nilai-asc') {
      return (Number(a.nilai) || 0) - (Number(b.nilai) || 0);
    } else if (sortVal === 'nama-asc') {
      return String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
    } else if (sortVal === 'nama-desc') {
      return String(b.nama || '').localeCompare(String(a.nama || ''), 'id');
    } else {

      const kelasComp = sortClassStrings(a.kelas || '', b.kelas || '');
      if (kelasComp !== 0) return kelasComp;
      const namaComp = String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
      if (namaComp !== 0) return namaComp;
      return new Date(b.waktu_kirim || 0) - new Date(a.waktu_kirim || 0);
    }
  });

  if (!filtered.length) {
    c.innerHTML = `<tr><td colspan="9" class="p-6 text-center text-slate-400 font-bold text-xs">Kosong</td></tr>`;
    buildPaginationControls('results-pagination-controls', 1, 0, () => { });
    return;
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (pageNumber > pageCount) pageNumber = pageCount;
  setPageNumber('results', pageNumber);
  const displayItems = filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

  const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : (v) => String(v ?? '');
  c.innerHTML = displayItems.map(r => {
    const penjelasanRaw = r.penjelasan || '-';
    const penjelasanColor = penjelasanRaw === 'Keluar Layar/Tab' ? 'text-red-500' : penjelasanRaw === 'Durasi Habis' ? 'text-amber-500' : penjelasanRaw === 'Kirim Manual' ? 'text-emerald-500' : penjelasanRaw === 'Auto Submit' ? 'text-orange-500' : 'text-slate-500';
    const penjelasanText = esc(penjelasanRaw);
    const waktuMs = r.waktu_kirim ? new Date(r.waktu_kirim).getTime() : NaN;
    const waktuText = Number.isFinite(waktuMs)
      ? new Date(waktuMs).toLocaleTimeString('id-ID')
      : '-';
    return `
      <tr class="border-t border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/30 transition-colors">
        <td class="px-3 py-3 text-slate-600 dark:text-slate-300">${esc(r.nis)}</td>
        <td class="px-3 py-3 font-semibold text-slate-800 dark:text-slate-200">${esc(formatStudentNameForDisplay(r.nama))}</td>
        <td class="px-3 py-3 text-slate-600 dark:text-slate-300">${esc(r.kelas)}</td>
        <td class="px-3 py-3 text-slate-600 dark:text-slate-300 text-left">${esc(r.mapel)}</td>
        <td class="px-3 py-3 text-slate-800 dark:text-slate-100 font-black">${esc(r.nilai)}</td>
        <td class="px-3 py-3 text-slate-600 dark:text-slate-300">${esc(r.jumlah_benar)}/${esc(r.jumlah_salah)}</td>
        <td class="px-3 py-3 text-slate-600 dark:text-slate-300">${waktuText}</td>
        <td class="px-3 py-3 text-[10px] sm:text-xs font-semibold ${penjelasanColor}">${penjelasanText}</td>
        <td class="px-3 py-3 text-right">
          <div class="inline-flex items-center justify-end gap-1.5">
            <button onclick='showResultItemAnalysis(${JSON.stringify(String(r.id || ''))})' class="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 dark:text-accent dark:bg-accent/10 dark:hover:bg-accent/20 text-[9px] sm:text-[10px] font-semibold">
              Detail
            </button>
            <button onclick='triggerResetAnswer(${JSON.stringify(String(r.nis || ''))}, ${JSON.stringify(String(r.mapel || ''))})' class="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[9px] sm:text-[10px] font-semibold">
              Hapus
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  buildPaginationControls('results-pagination-controls', pageNumber, pageCount, (newPage) => {
    setPageNumber('results', newPage);
    renderResultsCards();
  });
  createIconsIn(c);
}

window.renderResultsCards = renderResultsCards;

function getItemAnalysisStatusLabel(status) {
  if (status === 'benar') return { text: 'Benar', className: 'item-analysis-status-benar' };
  if (status === 'salah') return { text: 'Salah', className: 'item-analysis-status-salah' };
  return { text: 'Kosong', className: 'item-analysis-status-kosong' };
}

async function hydrateResultJawabanByIds(ids) {
  const uniqueIds = [...new Set((ids || []).filter(Boolean))];
  if (!uniqueIds.length || typeof supabaseClient === 'undefined') return 0;
  let hydrated = 0;
  const chunkSize = 100;
  for (let i = 0; i < uniqueIds.length; i += chunkSize) {
    const chunk = uniqueIds.slice(i, i + chunkSize);
    const { data, error } = await supabaseClient
      .from('Jawaban Siswa')
      .select('id,jawaban')
      .in('id', chunk);
    if (error) throw error;
    (data || []).forEach((row) => {
      if (!row?.id) return;
      const idx = ALL_RESULTS.findIndex((r) => r.id === row.id);
      if (idx >= 0) {
        ALL_RESULTS[idx] = { ...ALL_RESULTS[idx], jawaban: row.jawaban };
        hydrated++;
      } else {
        ALL_RESULTS.push(row);
        hydrated++;
      }
    });
  }
  return hydrated;
}

async function ensurePacketsLoadedForResults(results, schedules = ALL_SCHEDULES) {
  if (typeof ensureAdminPacketLoaded !== 'function') return;
  const packetIds = new Set();
  (results || []).forEach((result) => {
    const schedule = typeof resolveScheduleFromResult === 'function'
      ? resolveScheduleFromResult(result, schedules)
      : schedules.find(s => result?.id && String(result.id).startsWith(String(s.id) + '_'));
    if (schedule?.id_paket) packetIds.add(schedule.id_paket);
  });
  for (const packetId of packetIds) {
    await ensureAdminPacketLoaded(packetId);
  }
}

window.showResultItemAnalysis = async function (resultId) {
  const result = ALL_RESULTS.find(r => r.id === resultId);
  if (!result) return showNotification('Tidak Ditemukan', 'Data hasil ujian tidak ditemukan.', 'danger');

  toggleLoader(true, "Memuat Detail Jawaban...");
  try {
    if (typeof resultHasAnswerMap !== 'function' || !resultHasAnswerMap(result)) {
      await hydrateResultJawabanByIds([resultId]);
    }

    const fresh = ALL_RESULTS.find(r => r.id === resultId) || result;
    await ensurePacketsLoadedForResults([fresh]);

    if (typeof resultHasAnswerMap === 'function' && !resultHasAnswerMap(fresh)) {
      return showNotification(
        'Detail Tidak Tersedia',
        'Jawaban per butir tidak ditemukan untuk hasil ini. Hasil yang dikumpulkan setelah pembaruan sistem akan menampilkan analisis butir.',
        'info'
      );
    }

    const analysis = buildStudentItemAnalysis(fresh, ALL_SCHEDULES, ALL_PACKETS);
    window.__currentItemAnalysis = analysis;
    const modal = document.getElementById('result-item-analysis-modal');
    const titleEl = document.getElementById('item-analysis-title');
    const subtitleEl = document.getElementById('item-analysis-subtitle');
    const summaryEl = document.getElementById('item-analysis-summary');
    const tbody = document.getElementById('item-analysis-table-body');
    if (!modal || !titleEl || !subtitleEl || !summaryEl || !tbody) return;

    titleEl.textContent = `${analysis.student.nama} (${analysis.student.nis})`;
    subtitleEl.textContent = `${analysis.student.kelas} · ${analysis.student.mapel} · ${analysis.packetName}`;

    summaryEl.innerHTML = `
      <div class="item-analysis-summary-card">
        <p class="text-[10px] uppercase font-bold text-slate-400">Nilai</p>
        <p class="text-lg font-black text-primary dark:text-accent">${analysis.student.nilai}</p>
      </div>
      <div class="item-analysis-summary-card">
        <p class="text-[10px] uppercase font-bold text-slate-400">Total Soal</p>
        <p class="text-lg font-black text-slate-700 dark:text-slate-100">${analysis.summary.total}</p>
      </div>
      <div class="item-analysis-summary-card">
        <p class="text-[10px] uppercase font-bold text-slate-400">Benar</p>
        <p class="text-lg font-black text-emerald-600">${analysis.summary.benar}</p>
      </div>
      <div class="item-analysis-summary-card">
        <p class="text-[10px] uppercase font-bold text-slate-400">Salah</p>
        <p class="text-lg font-black text-red-500">${analysis.summary.salah}</p>
      </div>
      <div class="item-analysis-summary-card">
        <p class="text-[10px] uppercase font-bold text-slate-400">Kosong</p>
        <p class="text-lg font-black text-slate-500">${analysis.summary.kosong}</p>
      </div>
    `;

    if (!analysis.items.length) {
      tbody.innerHTML = `<tr><td colspan="5" class="py-6 text-center text-slate-400 font-bold text-xs">Data butir soal tidak tersedia untuk hasil ini.</td></tr>`;
    } else {
      tbody.innerHTML = analysis.items.map(item => {
        const statusMeta = getItemAnalysisStatusLabel(item.status);
        const preview = truncateText(stripHtmlToText(typeof stripQuestionKeyFromHtml === 'function' ? stripQuestionKeyFromHtml(item.soal) : item.soal), 140);
        return `
          <tr class="hover:bg-slate-50/70 dark:hover:bg-slate-900/40">
            <td class="font-bold text-slate-500">${item.no}</td>
            <td class="item-analysis-col-soal text-slate-700 dark:text-slate-200 leading-relaxed">${preview}</td>
            <td class="text-center font-black monospace">${item.studentAnswer || '-'}</td>
            <td class="text-center font-black monospace text-emerald-600">${item.correctKey}</td>
            <td class="text-center ${statusMeta.className}">${statusMeta.text}</td>
          </tr>
        `;
      }).join('');
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    if (typeof safeCreateIcons === 'function') safeCreateIcons();
    else if (typeof lucide !== 'undefined') lucide.createIcons();
  } catch (e) {
    console.error('showResultItemAnalysis failed', e);
    showNotification('Error', e.message || 'Terjadi kesalahan jaringan.', 'danger');
  } finally {
    toggleLoader(false);
  }
};

window.closeResultItemAnalysis = function () {
  const modal = document.getElementById('result-item-analysis-modal');
  if (modal) modal.classList.add('hidden');
  document.body.style.overflow = '';
  window.__currentItemAnalysis = null;
};

window.hydrateResultJawabanByIds = hydrateResultJawabanByIds;
window.ensurePacketsLoadedForResults = ensurePacketsLoadedForResults;
