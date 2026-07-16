function renderActiveMonitorList() {
  const c = document.getElementById('monitoring-list-container'); if (!c) return;
  const sv = (document.getElementById('filter-monitor-search')?.value || '').toLowerCase();
  const cf = document.getElementById('filter-monitor-kelas')?.value || '';
  const sf = document.getElementById('filter-monitor-status')?.value || '';
  const pageSize = getPageSizeFromSelect('monitor-page-size', 50);
  let pageNumber = getPageNumber('monitor');

  const filtered = ACTIVE_MONITOR_DATA.map(ss => ({ ...ss, prof: ALL_STUDENTS.find(s => s.nis === ss.nis) || { nama: "Unknown", kelas: "-" } }))
    .filter(ss => {
      const nis = String(ss.nis || '').toLowerCase();
      const nama = String(ss.prof.nama || '').toLowerCase();
      return (nis.includes(sv) || nama.includes(sv)) && (!cf || ss.prof.kelas === cf) && (!sf || (sf === 'curang' ? ss.cheat_detected : !ss.cheat_detected));
    })
    .sort((a, b) => {
      const nameA = String(a.prof.nama || '').toLowerCase();
      const nameB = String(b.prof.nama || '').toLowerCase();
      const byName = nameA.localeCompare(nameB, 'id', { sensitivity: 'base' });
      if (byName !== 0) return byName;
      return String(a.nis || '').localeCompare(String(b.nis || ''), 'id', { numeric: true });
    });

  if (!filtered.length) {
    c.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400 font-bold text-xs">Tidak ada data pengerjaan siswa yang sedang aktif</td></tr>`;
    buildPaginationControls('monitor-pagination-controls', 1, 0, () => { });
    return;
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (pageNumber > pageCount) pageNumber = pageCount;
  setPageNumber('monitor', pageNumber);
  const displayItems = filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

  const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : (v) => String(v ?? '');
  c.innerHTML = displayItems.map(ss => {
    const lastActiveSrc = ss.waktu_terakhir;
    const lastActiveMs = lastActiveSrc ? new Date(lastActiveSrc).getTime() : NaN;
    const isInactive = Number.isFinite(lastActiveMs) && (Date.now() - lastActiveMs > 5 * 60 * 1000);

    let statusText = ss.cheat_detected ? 'KELUAR' : 'ONLINE';
    let statusClass = ss.cheat_detected ? 'bg-red-500/10 text-red-500 border-red-500/20' : 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20';
    if (isInactive) {
      statusText = 'MATI / BEKU';
      statusClass = 'bg-slate-500/10 text-slate-500 border-slate-500/20 dark:border-slate-800/40';
    }

    const startSrc = ss.mulai_ujian || ss.waktu_terakhir;
    const startMs = startSrc ? new Date(startSrc).getTime() : NaN;
    const timeStr = Number.isFinite(startMs)
      ? new Date(startMs).toLocaleTimeString('id-ID')
      : '-';

    return `
      <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors border-b border-slate-100 dark:border-slate-800/80">
        <td class="py-3 px-4 font-semibold text-slate-500 dark:text-slate-400 monospace">${esc(ss.nis)}</td>
        <td class="py-3 px-4 font-extrabold text-slate-700 dark:text-slate-100">${esc(formatStudentNameForDisplay(ss.prof.nama))}</td>
        <td class="py-3 px-4 font-bold text-primary dark:text-accent">${esc(ss.prof.kelas)}</td>
        <td class="py-3 px-4 font-semibold text-slate-500 dark:text-slate-400 monospace">${timeStr}</td>
        <td class="py-3 px-4">
          <span class="text-[8px] sm:text-[10px] uppercase tracking-wide border px-2.5 py-0.5 rounded-full font-bold ${statusClass}">
            ${statusText}
          </span>
        </td>
        <td class="py-3 px-4 text-right">
          <div class="inline-flex items-center justify-end gap-1.5">
            <button type="button" data-action="monitor-chat" data-session-id="${String(ss.id).replace(/"/g, '&quot;')}" class="p-1.5 ${isSessionAdminAlertActive(ss) ? 'bg-blue-600 hover:bg-blue-700 text-white ring-2 ring-blue-300/50' : 'bg-blue-500/10 text-blue-600 hover:bg-blue-500/20 dark:text-blue-400'} rounded-lg transition" title="${isSessionAdminAlertActive(ss) ? 'Pesan aktif - klik untuk menutup' : 'Kirim pesan ke layar siswa'}">
              <i data-lucide="message-circle" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
            </button>
            <button type="button" data-action="monitor-finish" data-session-id="${String(ss.id).replace(/"/g, '&quot;')}" class="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] sm:text-[10px] font-bold rounded-lg shadow-sm transition" title="Akhiri sesi ujian dan simpan nilai">
              Selesai
            </button>
            <button type="button" data-action="monitor-reset" data-session-id="${String(ss.id).replace(/"/g, '&quot;')}" class="px-2.5 py-1.5 bg-red-600 hover:bg-red-700 text-white text-[9px] sm:text-[10px] font-bold rounded-lg shadow-sm transition">
              Reset
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  buildPaginationControls('monitor-pagination-controls', pageNumber, pageCount, (newPage) => {
    setPageNumber('monitor', newPage);
    renderActiveMonitorList();
  });
  createIconsIn(c);
  c.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-session-id');
      if (!id) return;
      const action = btn.getAttribute('data-action');
      if (action === 'monitor-chat') triggerMonitorChat(id);
      else if (action === 'monitor-finish') triggerFinishIndividu(id);
      else if (action === 'monitor-reset') triggerResetIndividu(id);
    });
  });
  updateGlobalMonitorChatButton();
}

function updateGlobalMonitorChatButton() {
  const btn = document.getElementById('btn-global-monitor-chat');
  const label = document.getElementById('btn-global-monitor-chat-label');
  if (!btn) return;
  const activeCount = ACTIVE_MONITOR_DATA.filter(isSessionAdminAlertActive).length;
  const hasActive = activeCount > 0;
  btn.className = hasActive
    ? 'px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-700 hover:bg-blue-800 text-white text-[10px] sm:text-xs font-bold rounded-lg shadow-md transition flex items-center gap-1.5 ring-2 ring-blue-300/60'
    : 'px-3 py-1.5 sm:px-4 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white text-[10px] sm:text-xs font-bold rounded-lg shadow-md transition flex items-center gap-1.5';
  if (label) {
    label.textContent = hasActive ? `Tutup Pesan Semua (${activeCount})` : 'Chat Semua Siswa';
  }
  btn.title = hasActive
    ? 'Tutup modal pesan di semua perangkat siswa'
    : 'Kirim pesan fullscreen ke semua siswa aktif';
}
