function populateExamHeader() {
  const settings = typeof readAppSettingsFromLocal === 'function'
    ? readAppSettingsFromLocal()
    : { schoolName: '', examTitle: '', schoolLogo: '' };
  const logoEl = document.getElementById('exam-header-logo');
  const nameEl = document.getElementById('exam-header-school-name');
  const titleEl = document.getElementById('exam-header-exam-title');
  const studentNameEl = document.getElementById('exam-header-student-name');
  const studentNameMobileEl = document.getElementById('exam-header-student-name-mobile');
  const studentClassEl = document.getElementById('exam-header-student-class');
  const subjectEl = document.getElementById('exam-subject-badge');

  if (logoEl) logoEl.src = typeof resolveSchoolLogoUrl === 'function'
    ? resolveSchoolLogoUrl(settings.schoolLogo)
    : (settings.schoolLogo || logoEl.src);
  if (nameEl) nameEl.textContent = (settings.schoolName || nameEl.textContent).toUpperCase();
  if (titleEl) titleEl.textContent = settings.examTitle || titleEl.textContent;
  if (CURRENT_USER) {
    const displayName = formatStudentNameForDisplay(CURRENT_USER.nama || 'Siswa');
    if (studentNameEl) studentNameEl.textContent = displayName;
    if (studentNameMobileEl) studentNameMobileEl.textContent = displayName;
    if (studentClassEl) studentClassEl.textContent = `Kelas : ${CURRENT_USER.kelas || '-'}`;
  }
  if (subjectEl && EXAM_STATE.schedule) {
    subjectEl.textContent = (EXAM_STATE.schedule.mapel || 'MAPEL').toUpperCase();
  }
}

if (!window.__studentNamePortraitRefreshBound) {
  window.__studentNamePortraitRefreshBound = true;
  const refreshStudentNameDisplays = () => {
    if (typeof populateExamHeader === 'function') populateExamHeader();
  };
  window.addEventListener('orientationchange', () => setTimeout(refreshStudentNameDisplays, 150));
  window.addEventListener('resize', () => setTimeout(refreshStudentNameDisplays, 150));
}
