window.switchView = function (viewId) {
  document.querySelectorAll('.page-view').forEach((view) => view.classList.add('hidden'));
  const activePage = document.getElementById(`view-${viewId}`);
  if (activePage) activePage.classList.remove('hidden');

  if (viewId === 'student-exam') {
    document.body.classList.add('exam-mode');
    if (typeof safeCreateIcons === 'function') safeCreateIcons();
    else if (typeof lucide !== 'undefined') lucide.createIcons();
  }
};
