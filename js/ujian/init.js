window.addEventListener('DOMContentLoaded', async () => {
  if (typeof safeCreateIcons === 'function') safeCreateIcons();
  applyTheme();
  initAppSettingsElements({
    headerLogo: 'exam-header-logo',
    headerName: 'exam-header-school-name',
    headerExam: 'exam-header-exam-title'
  });
  try {
    if (typeof initAppSettings === 'function') await initAppSettings();
  } catch (err) {
    console.warn('initAppSettings failed', err);
  }
  renderAppSettingsUI();
  populateExamHeader();
  setupInteractiveListeners();
  toggleLoader(true, 'MENGHUBUNGKAN...');
  try {
    firebaseUser = await initAuth();
    await checkSavedSession();
  } catch (err) {
    showNotification('Koneksi Gagal', 'Gagal menghubungi server.', 'danger');
  } finally {

    if (!window.__examStarted && !window.__examSubmitInFlight) {
      toggleLoader(false);
    }
  }
});

window.toggleMobileSheet = function (show) {
  const sheet = document.getElementById('mobile-bottom-sheet');
  if (!sheet) return;
  if (show) {
    sheet.classList.remove('hidden');
    setTimeout(() => sheet.classList.remove('translate-y-full'), 10);
    document.body.style.overflow = 'hidden';
  } else {
    sheet.classList.add('translate-y-full');
    setTimeout(() => {
      if (sheet.classList.contains('translate-y-full')) sheet.classList.add('hidden');
    }, 300);
    if (document.body.classList.contains('exam-mode')) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }
}
