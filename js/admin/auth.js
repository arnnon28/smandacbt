function checkSavedSession() {
  const sessionStr = mySessionStorage.getItem('cbt-session');
  if (!sessionStr) { window.location.href = 'index.html'; return; }
  try {
    const user = JSON.parse(sessionStr);
    if (user.role !== 'admin') { window.location.href = 'index.html'; return; }
    setupSessionEnvironment(user);
  } catch (err) {
    mySessionStorage.removeItem('cbt-session');
    window.location.href = 'index.html';
  }
}

function setupSessionEnvironment(user) {
  CURRENT_USER = user;
  const mainView = document.getElementById('main-system-view');
  if (mainView) mainView.classList.remove('hidden');

  const pContainer = document.getElementById('header-profile-container');
  if (pContainer) {
    pContainer.classList.remove('hidden');
    const pName = document.getElementById('header-profile-name');
    const pRole = document.getElementById('header-profile-role');
    if (pName && pRole) {
      pName.textContent = user.username;
      pRole.textContent = 'admin';
    }
  }

  const adminNav = document.getElementById('admin-nav-links');
  if (adminNav) adminNav.classList.remove('hidden');
  const sessionBar = document.getElementById('admin-active-session-bar');
  if (sessionBar) sessionBar.classList.remove('hidden');
  const mobNav = document.getElementById('mobile-admin-nav');
  if (mobNav) {
    mobNav.classList.remove('hidden');
    mobNav.classList.add('flex', 'md:hidden');
  }
  const sidebarFooter = document.getElementById('sidebar-footer');
  if (sidebarFooter) sidebarFooter.classList.remove('hidden');
  const portraitRefreshBtn = document.getElementById('btn-admin-portrait-refresh');
  if (portraitRefreshBtn) portraitRefreshBtn.classList.remove('hidden');
  switchView('admin-dashboard');
  startRealtimeAdminListeners();
}
