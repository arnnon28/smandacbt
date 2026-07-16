function debounce(fn, delay = 200) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function getPageSizeFromSelect(selectId, defaultSize = 50) {
  const raw = document.getElementById(selectId)?.value || '';
  if (raw === 'all') return Number.MAX_SAFE_INTEGER;
  const parsed = parseInt(raw, 10);
  return Number.isNaN(parsed) ? defaultSize : parsed;
}

function buildPaginationControls(containerId, currentPage, pageCount, onPageChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (pageCount < 2) {
    container.innerHTML = '';
    return;
  }

  let startPage = Math.max(1, currentPage - 2);
  let endPage = Math.min(pageCount, startPage + 4);
  if (endPage - startPage < 4) {
    startPage = Math.max(1, endPage - 4);
  }

  const pages = [];
  for (let i = startPage; i <= endPage; i++) pages.push(i);

  container.innerHTML = `
    <div class="flex flex-wrap items-center gap-2 justify-center text-[10px] sm:text-xs">
      <button data-page="prev" class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Prev</button>
      ${pages.map((page) => `
        <button data-page="${page}" class="px-3 py-1.5 rounded-xl border ${page === currentPage ? 'bg-primary text-white border-primary' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}">${page}</button>
      `).join('')}
      <button data-page="next" class="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800">Next</button>
    </div>
  `;

  container.querySelectorAll('button[data-page]').forEach((button) => {
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

function sortClassStrings(a, b) {
  const parse = (value) => {
    const text = String(value || '').toUpperCase().trim();
    const match = text.match(/(\d+)$/);
    return {
      text,
      num: match ? parseInt(match[1], 10) : null,
      prefix: match ? text.slice(0, match.index).trim() : text
    };
  };
  const xa = parse(a);
  const xb = parse(b);
  if (xa.prefix !== xb.prefix) {
    const rank = (prefix) => {
      if (/^XII\b/.test(prefix)) return 3;
      if (/^XI\b/.test(prefix)) return 2;
      if (/^X\b/.test(prefix)) return 1;
      const numeric = prefix.match(/^(\d+)/);
      return numeric ? parseInt(numeric[1], 10) + 0.1 : 100;
    };
    return rank(xa.prefix) - rank(xb.prefix) || xa.prefix.localeCompare(xb.prefix);
  }
  if (xa.num != null && xb.num != null) return xa.num - xb.num;
  if (xa.num != null) return -1;
  if (xb.num != null) return 1;
  return xa.text.localeCompare(xb.text);
}

function cleanMapelName(v) {
  if (!v && v !== 0) return '';
  try {
    let s = String(v);
    s = s.normalize ? s.normalize('NFC') : s;
    s = s.replace(/[\u200B-\u200D\uFEFF]/g, '');
    s = s.replace(/\u00A0/g, ' ');
    s = s.replace(/\s+/g, ' ').trim();
    return s;
  } catch (e) {
    return String(v).trim();
  }
}

function toggleLoader(show, text = 'MENGOLAH...') {
  const loader = document.getElementById('global-spinner');
  if (!loader) return;
  if (show) {
    const txtEl = document.getElementById('global-spinner-text');
    if (txtEl) txtEl.innerText = text;
    loader.classList.remove('hidden');
  } else {
    loader.classList.add('hidden');
  }
}

function initRealtimeClock() {
  const el = document.getElementById('digital-clock-auth');
  if (!el) return;
  const tick = () => {
    el.innerText = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };
  tick();
  setInterval(tick, 1000);
}

function applyTheme() {
  const root = document.documentElement;
  root.classList.add('no-theme-transition');
  if (myLocalStorage.getItem('cbt-dark-mode') === 'true') {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove('no-theme-transition'));
  });
}

function toggleTheme() {
  const root = document.documentElement;
  root.classList.add('no-theme-transition');
  myLocalStorage.setItem('cbt-dark-mode', root.classList.toggle('dark'));
  requestAnimationFrame(() => {
    requestAnimationFrame(() => root.classList.remove('no-theme-transition'));
  });
}

function normalizeRealtimeSnapshot(snapshot) {
  if (!snapshot) return [];
  if (Array.isArray(snapshot)) return snapshot;
  if (Array.isArray(snapshot.docs)) return snapshot.docs;
  if (typeof snapshot.forEach === 'function') {
    const docs = [];
    snapshot.forEach((doc) => docs.push(doc));
    return docs;
  }
  return [];
}

function createIconsIn(container) {
  if (!window.lucide || typeof window.lucide.createIcons !== 'function') return;
  try {
    if (container) {
      window.lucide.createIcons({ root: container });
      return;
    }
    window.lucide.createIcons();
  } catch (_) {  }
}

function safeCreateIcons(options) {
  if (!window.lucide || typeof window.lucide.createIcons !== 'function') return;
  try {
    if (options) window.lucide.createIcons(options);
    else window.lucide.createIcons();
  } catch (_) {  }
}

function escapeHtmlAttr(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function preserveScrollWhile(fn) {
  const scrollY = window.scrollY;
  fn();
  requestAnimationFrame(() => { window.scrollTo(0, scrollY); });
}

function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  const isDanger = type === 'danger';
  const visibleDuration = Math.max(Number(duration) || 4000, 2200);
  toast.className = `pointer-events-auto max-w-sm w-fit rounded-full px-4 py-2 text-sm font-semibold shadow-lg border border-emerald-500/20 bg-transparent text-emerald-600 dark:text-emerald-400 transition-all duration-500 opacity-0 translate-x-6 ${isDanger ? 'text-rose-600 dark:text-rose-400 border-rose-500/20' : ''}`;
  toast.innerHTML = `<span>${message}</span>`;
  container.appendChild(toast);
  requestAnimationFrame(() => {
    toast.classList.remove('opacity-0', 'translate-x-6');
    toast.classList.add('opacity-100', 'translate-x-0');
  });
  const closeToast = () => {
    toast.classList.remove('opacity-100', 'translate-x-0');
    toast.classList.add('opacity-0', 'translate-x-6');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  };
  const timeoutId = setTimeout(closeToast, visibleDuration);
  toast.addEventListener('click', () => {
    clearTimeout(timeoutId);
    closeToast();
  });
}
