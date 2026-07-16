function renderSchedules() {
  const c = document.getElementById('schedules-table-body');
  if (!c) return;
  if (!ALL_SCHEDULES.length) {
    c.innerHTML = `
      <tr class="border-t border-slate-200 dark:border-slate-800">
        <td colspan="7" class="px-3 py-6 text-center text-slate-400 font-bold text-xs">Kosong</td>
      </tr>
    `;
    buildPaginationControls('schedules-pagination-controls', 1, 0, () => { });
    return;
  }

  const pageSize = 10;
  let pageNumber = getPageNumber('schedules');
  c.innerHTML = '';
  const sortedSchedules = [...ALL_SCHEDULES].sort((a, b) => {
    const aMs = a.mulai ? new Date(a.mulai).getTime() : 0;
    const bMs = b.mulai ? new Date(b.mulai).getTime() : 0;
    return aMs - bMs;
  });

  const pageCount = Math.max(1, Math.ceil(sortedSchedules.length / pageSize));
  if (pageNumber > pageCount) pageNumber = pageCount;
  setPageNumber('schedules', pageNumber);
  const displayItems = sortedSchedules.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

  const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : (v) => String(v ?? '');
  displayItems.forEach(sch => {
    const kelasList = Array.isArray(sch.kelas_terpilih) ? sch.kelas_terpilih.join(', ') : (sch.kelas_terpilih || '-');
    const startDate = sch.mulai ? new Date(sch.mulai) : null;
    const isValidStart = startDate && !Number.isNaN(startDate.getTime());
    const endDate = sch.selesai
      ? new Date(sch.selesai)
      : (isValidStart ? new Date(startDate.getTime() + (Number(sch.durasi) || 0) * 60000) : null);
    const isValidEnd = endDate && !Number.isNaN(endDate.getTime());
    const dateLabel = isValidStart ? startDate.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' }) : '-';
    const startTime = isValidStart ? startDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
    const endTime = isValidEnd ? endDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : '-';
    const timeLabel = `${startTime} - ${endTime}`;
    const scheduleIdLit = JSON.stringify(String(sch.id || ''));

    c.innerHTML += `
      <tr class="border-t border-slate-200 dark:border-slate-800">
        <td class="px-3 py-3 text-slate-600 dark:text-slate-300">${dateLabel}</td>
        <td class="px-3 py-3 text-slate-600 dark:text-slate-300">${timeLabel}</td>
        <td class="px-3 py-3 font-semibold text-slate-800 dark:text-slate-200 text-left">${esc(sch.mapel)}</td>
        <td class="px-3 py-3 text-slate-600 dark:text-slate-300 break-words">${esc(kelasList)}</td>
        <td class="px-3 py-3"><span class="inline-flex items-center px-2.5 py-1 rounded-full bg-accent text-white text-[9px] font-semibold">${esc(sch.token)}</span></td>
        <td class="px-3 py-3 text-slate-600 dark:text-slate-300">${esc(sch.durasi)} Menit</td>
        <td class="px-3 py-3 text-right">
          <div class="flex justify-end gap-1.5">
            <button onclick="triggerEditSchedule(${scheduleIdLit})" class="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 text-[9px] sm:text-[10px] font-semibold">
              <i data-lucide="pencil" class="w-3.5 h-3.5"></i>
            </button>
            <button onclick="triggerDeleteSchedule(${scheduleIdLit})" class="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-red-500/10 text-red-500 hover:bg-red-500/20 text-[9px] sm:text-[10px] font-semibold">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  });

  buildPaginationControls('schedules-pagination-controls', pageNumber, pageCount, (newPage) => {
    setPageNumber('schedules', newPage);
    renderSchedules();
  });
  if (typeof safeCreateIcons === 'function') safeCreateIcons();
}
