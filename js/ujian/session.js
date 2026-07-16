function checkSavedSession() {
  const sessionStr = mySessionStorage.getItem('cbt-session');
  if (!sessionStr) {
    window.location.href = 'index.html';
    return Promise.resolve();
  }

  try {
    const user = JSON.parse(sessionStr);
    if (user.role !== 'student') {
      window.location.href = 'index.html';
      return Promise.resolve();
    }
    return setupSessionEnvironment(user);
  } catch (err) {
    mySessionStorage.removeItem('cbt-session');
    window.location.href = 'index.html';
    return Promise.resolve();
  }
}

function setupSessionEnvironment(user) {
  CURRENT_USER = user;
  window.__examFinalized = false;
  window.__examStarted = false;
  window.__examSaveOnExitDone = false;

  const mainSystemView = document.getElementById('main-system-view');
  document.body.classList.add('exam-mode');
  if (mainSystemView) {
    mainSystemView.classList.remove('hidden');
  }

  return initStudentExamView();
}

function isStudentExamActive() {
  return CURRENT_USER && CURRENT_USER.role === 'student' && isExamPageActiveFlag();
}

function markExamPageActive() {
  markExamPageActiveFlag();
}

function clearExamPageActive() {
  clearExamPageActiveFlag();
}

function wasPageReloaded() {
  const navEntry = performance.getEntriesByType('navigation')[0];
  return navEntry?.type === 'reload';
}

function showRefreshBlockedWarning() {
  if (!isStudentExamActive()) return;
  showNotification("Peringatan", "Refresh halaman dilarang selama ujian berlangsung!", "danger");
}

function handleBeforeUnload(e) {
  if (!isStudentExamActive()) return;
  e.preventDefault();
  e.returnValue = 'Ujian sedang berlangsung. Refresh halaman dilarang dan dapat mengakhiri ujian.';
  return e.returnValue;
}

function handleExamPageShow(e) {
  if (e.persisted && isStudentExamActive()) {
    showNotification("Curang Terdeteksi", "Refresh halaman tidak diizinkan. Ujian otomatis dikirim.", "danger");
    autoSubmitExam("Refresh Halaman");
  }
}
