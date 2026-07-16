window.changeExamFontSize = function (size) {
  const qContainer = document.getElementById('exam-question-text');
  const optionTexts = document.querySelectorAll('.option-text');
  if (!qContainer) return;

  let qSizeDesktop, qSizeMobile, optSize;
  if (size === 'small') {
    qSizeDesktop = '14px'; qSizeMobile = '13px'; optSize = '14px';
  } else if (size === 'medium') {
    qSizeDesktop = '16px'; qSizeMobile = '15px'; optSize = '16px';
  } else if (size === 'large') {
    qSizeDesktop = '20px'; qSizeMobile = '18px'; optSize = '19px';
  }

  const isMobileViewport = window.innerWidth < 768;
  qContainer.style.fontSize = isMobileViewport ? qSizeMobile : qSizeDesktop;
  optionTexts.forEach(el => { el.style.fontSize = optSize; });

  myLocalStorage.setItem('fontSizePreference', size);
  myLocalStorage.setItem('unbk-preferred-fontsize', size === 'small' ? 'kecil' : size === 'large' ? 'besar' : 'sedang');

  const fontSizeMenu = document.getElementById('fontSizeMenu');
  if (fontSizeMenu) fontSizeMenu.classList.add('hidden');
};

function isExamReadyToFinish() {
  const questions = Array.isArray(EXAM_STATE.scrambledQuestions) ? EXAM_STATE.scrambledQuestions : [];
  const total = questions.length;
  if (total === 0) return false;

  return questions.every(q => EXAM_STATE.answers[q.id] !== undefined);
}

window.showFinishModal = function () {
  const modal = document.getElementById('finish-modal');
  const content = document.getElementById('finish-modal-content');
  if (!modal || !content) return;
  modal.classList.remove('hidden');
  setTimeout(() => {
    content.classList.remove('scale-95', 'opacity-0');
    content.classList.add('scale-100', 'opacity-100');
  }, 10);
  if (typeof safeCreateIcons === 'function') safeCreateIcons();
  else if (typeof lucide !== 'undefined') lucide.createIcons();
};

window.hideFinishModal = function () {
  const modal = document.getElementById('finish-modal');
  const content = document.getElementById('finish-modal-content');
  if (!modal || !content) return;
  content.classList.remove('scale-100', 'opacity-100');
  content.classList.add('scale-95', 'opacity-0');
  setTimeout(() => modal.classList.add('hidden'), 300);
};

async function navigateExamQuestion(dir) {
  if (typeof ensureExamBankSoalFreshOnAction === 'function') {
    try { await ensureExamBankSoalFreshOnAction(); } catch (_) { }
  }
  if (dir === 1 && isExamReadyToFinish()) {
    showFinishModal();
    return;
  }
  const questions = Array.isArray(EXAM_STATE.scrambledQuestions) ? EXAM_STATE.scrambledQuestions : [];
  const total = questions.length;
  const target = EXAM_STATE.currentIndex + dir;
  if (target >= total) {
    for (let i = 0; i < total; i++) {
      const q = questions[i];
      if (EXAM_STATE.answers[q.id] === undefined || EXAM_STATE.doubts[q.id]) {
        EXAM_STATE.currentIndex = i;
        saveExamStateToLocal({ skipCloudSchedule: true });
        renderExamQuestion();
        return;
      }
    }
  } else if (target >= 0) {
    EXAM_STATE.currentIndex = target;
    saveExamStateToLocal({ skipCloudSchedule: true });
    renderExamQuestion();
  }
}
