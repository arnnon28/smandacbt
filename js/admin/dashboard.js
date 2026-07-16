function renderDashboardActiveExamsTable() {
  const tbody = document.getElementById('dashboard-active-exams-tbody');
  if (!tbody) return;
  tbody.innerHTML = "";

  if (!ALL_SCHEDULES.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400 font-bold text-xs">Belum ada jadwal ujian yang terdaftar</td></tr>`;
    return;
  }

  const todayStr = new Date().toLocaleDateString('en-CA');
  const searchInput = document.getElementById('search-dashboard-mapel');
  const searchVal = searchInput ? searchInput.value.toLowerCase() : "";

  const classFilter = document.getElementById('filter-dashboard-kelas');
  const classVal = classFilter ? classFilter.value : "";

  const pageSize = getPageSizeFromSelect('dashboard-page-size', 50);
  let pageNumber = getPageNumber('dashboard');
  const processedSchedules = ALL_SCHEDULES.map(sch => {
    let status = "Belum Mulai";
    let statusClass = "bg-blue-500/10 text-blue-500 border-blue-500/20";
    let order = 2;

    if (sch.mulai) {
      const nowMs = typeof getServerNowMs === 'function' ? getServerNowMs() : Date.now();
      const startMs = new Date(sch.mulai).getTime();

      const endMs = sch.selesai ? new Date(sch.selesai).getTime() : startMs + (sch.durasi * 60000);

      if (nowMs < startMs) {
        status = "Belum Mulai";
        statusClass = "bg-blue-500/10 text-blue-500 border-blue-500/20";
        order = 2;
      } else if (nowMs >= startMs && nowMs <= endMs) {
        status = "Aktif";
        statusClass = "bg-emerald-500/10 text-emerald-500 border-emerald-500/20 animate-pulse";
        order = 1;
      } else {
        status = "Selesai";
        statusClass = "bg-slate-500/10 text-slate-500 border-slate-500/20";
        order = 3;
      }
    }

    return { ...sch, status, statusClass, order };
  });

  const filteredSchedules = processedSchedules.filter(sch => {
    const matchesMapel = !searchVal || (sch.mapel && sch.mapel.toLowerCase().includes(searchVal));
    const matchesKelas = !classVal || (Array.isArray(sch.kelas_terpilih) && sch.kelas_terpilih.includes(classVal));
    return matchesMapel && matchesKelas;
  });

  filteredSchedules.sort((a, b) => a.order - b.order);

  if (!filteredSchedules.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="py-8 text-center text-slate-400 font-bold text-xs">Jadwal ujian tidak ditemukan</td></tr>`;
    buildPaginationControls('dashboard-pagination-controls', 1, 0, () => { });
    return;
  }

  const pageCount = Math.max(1, Math.ceil(filteredSchedules.length / pageSize));
  if (pageNumber > pageCount) pageNumber = pageCount;
  setPageNumber('dashboard', pageNumber);
  const displaySchedules = filteredSchedules.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);

  displaySchedules.forEach(sch => {
    const tr = document.createElement('tr');
    tr.className = "hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors border-b border-slate-100 dark:border-slate-800/80";

    const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : (v) => String(v ?? '');
    const scheduleIdLit = JSON.stringify(String(sch.id || ''));
    const kelasBadges = Array.isArray(sch.kelas_terpilih) ? sch.kelas_terpilih.map(cls =>
      `<span class="text-[8px] sm:text-[9px] bg-slate-100 dark:bg-slate-800 font-bold px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">${esc(cls)}</span>`
    ).join(' ') : '';

    let formattedDate = '-';
    let formattedTime = '-';
    if (sch.mulai) {
      const d = new Date(sch.mulai);
      const tgl = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      const startTime = d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      const endMs = sch.selesai ? new Date(sch.selesai).getTime() : d.getTime() + ((Number(sch.durasi) || 0) * 60000);
      const endTime = new Date(endMs).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      formattedDate = tgl;
      formattedTime = `${startTime} - ${endTime}`;
    }

    tr.innerHTML = `
      <td class="py-3 px-4 font-bold text-slate-600 dark:text-slate-300 text-[11px] sm:text-xs tracking-wide">${formattedDate}</td>
      <td class="py-3 px-4 font-bold text-slate-600 dark:text-slate-300 text-[11px] sm:text-xs tracking-wide">${formattedTime}</td>
      <td class="py-3 px-4 font-extrabold text-primary dark:text-slate-100 text-left">${esc(sch.mapel || '-')}</td>
      <td class="py-3 px-4"><div class="flex flex-wrap gap-1 w-full">${kelasBadges}</div></td>
      <td class="py-3 px-4">
        <span class="text-[8px] sm:text-[10px] uppercase tracking-wide border px-2 py-0.5 rounded-full font-bold ${sch.statusClass}">
          ${esc(sch.status)}
        </span>
      </td>
      <td class="py-3 px-4 text-right">
        <div class="flex justify-end gap-1.5">
          <button onclick="triggerEditSchedule(${scheduleIdLit})" class="p-1.5 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded-lg transition" title="Edit Jadwal">
            <i data-lucide="edit" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
          </button>
          <button onclick="triggerDeleteSchedule(${scheduleIdLit})" class="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition" title="Hapus Jadwal">
            <i data-lucide="trash-2" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  buildPaginationControls('dashboard-pagination-controls', pageNumber, pageCount, (newPage) => {
    setPageNumber('dashboard', newPage);
    renderDashboardActiveExamsTable();
  });
  if (typeof safeCreateIcons === 'function') safeCreateIcons();
}
