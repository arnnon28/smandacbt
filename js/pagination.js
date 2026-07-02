const PAGINATION_STATE = {
  students: 1,
  monitor: 1,
  banksoal: 1,
  results: 1,
  dashboard: 1,
};

export function getPageSize(selectId, defaultSize = 50) {
  const raw = document.getElementById(selectId)?.value || '';
  if (raw === 'all') return Number.MAX_SAFE_INTEGER;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? defaultSize : parsed;
}

export function getPageNumber(stateKey) {
  return PAGINATION_STATE[stateKey] || 1;
}

export function setPageNumber(stateKey, value) {
  PAGINATION_STATE[stateKey] = Math.max(1, value);
}

export function resetPageNumber(stateKey) {
  if (PAGINATION_STATE[stateKey] != null) {
    PAGINATION_STATE[stateKey] = 1;
  }
}

export function buildPaginationControls(containerId, currentPage, pageCount, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (pageCount < 2) {
    container.innerHTML = '';
    return;
  }

  const pages = Array.from({ length: pageCount }, (_, i) => i + 1);
  container.innerHTML = `
    <div class="flex flex-wrap items-center gap-2 justify-center text-[10px] sm:text-xs">
      <button data-page="prev" class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Prev</button>
      ${pages.map(page => `
        <button data-page="${page}" class="px-3 py-1.5 rounded-xl border ${page === currentPage ? 'bg-primary text-white border-primary' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">${page}</button>
      `).join('')}
      <button data-page="next" class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Next</button>
    </div>
  `;

  container.querySelectorAll('button[data-page]').forEach(button => {
    button.addEventListener('click', () => {
      const pageValue = button.getAttribute('data-page');
      if (!pageValue) return;
      let targetPage = currentPage;
      if (pageValue === 'prev') targetPage = Math.max(1, currentPage - 1);
      else if (pageValue === 'next') targetPage = Math.min(pageCount, currentPage + 1);
      else targetPage = Number(pageValue);
      if (targetPage !== currentPage) onPageChange(targetPage);
    });
  });
}
