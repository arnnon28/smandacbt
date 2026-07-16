function getPageNumber(key) {
  return PAGINATION_STATE[key] || 1;
}

function setPageNumber(key, page) {
  PAGINATION_STATE[key] = Math.max(1, page);
}

function resetPageNumber(key) {
  PAGINATION_STATE[key] = 1;
}

function isAdminPortraitMobile() {
  return window.matchMedia('(orientation: portrait) and (max-width: 1024px)').matches;
}

function shouldDeferAdminRealtimeRender() {
  if (isAdminPortraitMobile()) return true;
  if (typeof hasActiveTextSelectionIn === 'function' && hasActiveTextSelectionIn()) return true;
  if (typeof hasActiveTokenSelection === 'function' && hasActiveTokenSelection()) return true;
  return false;
}

function runAdminRealtimeDomUpdate(fn) {
  if (isAdminPortraitMobile()) return;
  const fnKey = fn.toString();
  if (adminDomUpdateTimers[fnKey]) return;
  adminDomUpdateTimers[fnKey] = setTimeout(() => {
    delete adminDomUpdateTimers[fnKey];
    fn();
  }, 2000);
}

function renderCurrentAdminView() {
  const viewId = CURRENT_ADMIN_VIEW;
  if (viewId === 'admin-dashboard') {
    renderDashboardActiveExamsTable();
    updateAdminTokenBars(true);
  } else if (viewId === 'admin-monitor') renderActiveMonitorList();
  else if (viewId === 'admin-students') renderStudentsCards();
  else if (viewId === 'admin-results') {
    refreshResultsFromDatabase();
  } else if (viewId === 'admin-banksoal') renderBankSoalQuestionList();
  else if (viewId === 'admin-admins') renderAdminsCards();
  else if (viewId === 'admin-schedule') renderSchedules();
}

function renderIfViewActive(viewId, fn) {
  if (CURRENT_ADMIN_VIEW !== viewId) return;
  if (shouldDeferAdminRealtimeRender()) {
    window.__deferredAdminRender = window.__deferredAdminRender || {};
    window.__deferredAdminRender[viewId] = fn;
    return;
  }
  fn();
}

function flushDeferredAdminRenders() {
  if (shouldDeferAdminRealtimeRender()) return;
  const deferred = window.__deferredAdminRender;
  if (deferred) {
    Object.keys(deferred).forEach((viewId) => {
      if (CURRENT_ADMIN_VIEW === viewId && typeof deferred[viewId] === 'function') {
        deferred[viewId]();
        delete deferred[viewId];
      }
    });
  }
  if (window.__deferredUpdateAdminTokenBars) {
    window.__deferredUpdateAdminTokenBars = false;
    updateAdminTokenBars(true);
  }
}

function initAdminPortraitRenderGuard() {
  if (window.__adminPortraitRenderGuardBound) return;
  window.__adminPortraitRenderGuardBound = true;
  let layoutTimer;
  const handleAdminLayoutChange = () => {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(() => {
      if (!isAdminPortraitMobile() && CURRENT_USER?.role === 'admin') {
        flushDeferredAdminRenders();
        renderCurrentAdminView();
        updateAdminTokenBars(true);
        refreshCachedDashboardStats(true);
      }
    }, 250);
  };
  window.addEventListener('orientationchange', handleAdminLayoutChange);
  window.addEventListener('resize', handleAdminLayoutChange);
}

function handleAdminPortraitRefresh() {
  if (!firebaseUser || CURRENT_USER?.role !== 'admin') return;
  const btn = document.getElementById('btn-admin-portrait-refresh');
  if (btn?.dataset.refreshing === '1') return;
  if (btn) {
    btn.dataset.refreshing = '1';
    btn.disabled = true;
    btn.classList.add('is-refreshing');
  }
  window.__deferredAdminRender = {};
  window.__deferredUpdateAdminTokenBars = false;
  renderCurrentAdminView();
  updateClassSelectors(true);
  refreshCachedDashboardStats(true);
  if (CURRENT_ADMIN_VIEW === 'admin-banksoal') refreshBankSoalDropdowns(true);
  showToast('Tampilan diperbarui.', 'success', 2500);
  setTimeout(() => {
    if (!btn) return;
    btn.dataset.refreshing = '0';
    btn.disabled = false;
    btn.classList.remove('is-refreshing');
  }, 600);
}

function initAdminSelectionGuard() {
  if (window.__adminSelectionGuardBound) return;
  window.__adminSelectionGuardBound = true;
  let selectionFlushTimer;
  document.addEventListener('selectionchange', () => {
    clearTimeout(selectionFlushTimer);
    selectionFlushTimer = setTimeout(flushDeferredAdminRenders, 120);
  });
}

function runAdminFilterRender(key, renderFn) {
  preserveScrollWhile(() => {
    resetPageNumber(key);
    renderFn();
  });
}

window.processLocalLogo = processLocalLogoUpload;
window.commitSettings = () => commitAppSettingsFromForm();
window.resetSettingsToDefault = () => resetAppSettingsToDefault();
window.toggleGlobalClass = function (grade, checked, nameAttr) {
  const checkboxes = document.querySelectorAll(`input[name="${nameAttr}"]`);
  checkboxes.forEach(cb => {
    const val = cb.value.toUpperCase().trim();
    let match = false;
    if (grade === 'X') {
      match = (val.startsWith('X') && !val.startsWith('XI') && !val.startsWith('XII')) || val.startsWith('10') || val.startsWith('KLS X') || val.startsWith('KLS 10');
    } else if (grade === 'XI') {
      match = (val.startsWith('XI') && !val.startsWith('XII')) || val.startsWith('11') || val.startsWith('KLS XI') || val.startsWith('KLS 11');
    } else if (grade === 'XII') {
      match = val.startsWith('XII') || val.startsWith('12') || val.startsWith('KLS XII') || val.startsWith('KLS 12');
    }
    if (match) {
      cb.checked = checked;
    }
  });
};

window.switchView = function (viewId) {
  document.querySelectorAll('.page-view').forEach(view => view.classList.add('hidden'));
  const activePage = document.getElementById(`view-${viewId}`);
  if (activePage) activePage.classList.remove('hidden');

  document.querySelectorAll('.nav-btn').forEach(btn => {
    const isMobileNav = btn.closest('#mobile-admin-nav');
    const icon = btn.querySelector('i');
    if (btn.getAttribute('data-nav') === viewId) {
      if (isMobileNav) {
        btn.className = "nav-btn flex flex-col items-center justify-center w-full h-full text-[#3b82f6] transition-colors relative pt-1 active:scale-95";
      } else {
        btn.className = `nav-btn flex items-center px-3 py-2.5 mx-3 mb-1 bg-white/20 text-white rounded-md border border-white/30 shadow-md transition-all duration-300 ${sidebarCollapsed ? 'justify-center px-0' : ''}`;
        if (icon) {
          icon.classList.remove('text-[#9db9d8]');
          icon.classList.add('text-[#3b82f6]');
        }
      }
    } else {
      if (isMobileNav) {
        btn.className = "nav-btn flex flex-col items-center justify-center w-full h-full text-[#b5cbdf] transition-colors relative pt-1 active:scale-95";
      } else {
        btn.className = `nav-btn sidebar-menu-link group flex items-center px-3 py-2.5 mx-3 mb-1 rounded-md text-[#b5cbdf] hover:text-white ${sidebarCollapsed ? 'justify-center px-0' : ''}`;
        if (icon) {
          icon.classList.remove('text-[#3b82f6]');
          icon.classList.add('text-[#9db9d8]');
        }
      }
    }
  });
  const safeViewId = viewId || '';
  CURRENT_ADMIN_VIEW = safeViewId;

  const activeSessionBar = document.getElementById('admin-active-session-bar');
  if (activeSessionBar) {
    if (CURRENT_USER && CURRENT_USER.role === 'admin' && safeViewId === 'admin-dashboard') {
      activeSessionBar.classList.remove('hidden');
    } else {
      activeSessionBar.classList.add('hidden');
    }
  }

  renderCurrentAdminView();
  if (isAdminPortraitMobile()) {
    updateClassSelectors(true);
    refreshCachedDashboardStats(true);
  }
}
