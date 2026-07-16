function updateExamProgressUI() {
  const questions = Array.isArray(EXAM_STATE.scrambledQuestions) ? EXAM_STATE.scrambledQuestions : [];
  const t = questions.length;
  let greenCount = 0;
  let raguCount = 0;
  let belumCount = 0;
  questions.forEach(q => {
    const answered = EXAM_STATE.answers[q.id] !== undefined;
    const flagged = !!EXAM_STATE.doubts[q.id];
    if (!answered) belumCount++;
    else if (flagged) raguCount++;
    else greenCount++;
  });
  const totalAnswered = questions.filter(
    (q) => EXAM_STATE.answers[q.id] !== undefined
  ).length;
  const isReady = isExamReadyToFinish();

  const totalCountEl = document.getElementById('exam-total-count');
  const progressEl = document.getElementById('exam-progress');
  if (totalCountEl) totalCountEl.textContent = `${t} Soal`;
  if (progressEl) progressEl.style.width = t > 0 ? `${Math.round((totalAnswered / t) * 100)}%` : '0%';

  const legDAns = document.getElementById('leg-d-answered');
  const legDFlag = document.getElementById('leg-d-flagged');
  const legDEmpty = document.getElementById('leg-d-empty');
  const legMAns = document.getElementById('leg-m-answered');
  const legMFlag = document.getElementById('leg-m-flagged');
  const legMEmpty = document.getElementById('leg-m-empty');
  if (legDAns) legDAns.textContent = `Dijawab (${greenCount})`;
  if (legDFlag) legDFlag.textContent = `Ragu-ragu (${raguCount})`;
  if (legDEmpty) legDEmpty.textContent = `Belum (${belumCount})`;
  if (legMAns) legMAns.textContent = greenCount;
  if (legMFlag) legMFlag.textContent = raguCount;
  if (legMEmpty) legMEmpty.textContent = belumCount;

  const modalText = document.getElementById('modal-summary-text');
  if (modalText) {
    if (raguCount === 0) {
      modalText.innerHTML = `Anda telah mengerjakan <strong>seluruh soal</strong>. Yakin ingin mengakhiri ujian dan menyimpan jawaban sekarang?`;
    } else {
      modalText.innerHTML = `Semua soal sudah dijawab, tetapi masih ada <strong class="text-accent">${raguCount} soal</strong> bertanda ragu-ragu. Yakin ingin mengakhiri ujian sekarang?`;
    }
  }

  const pb = document.getElementById('btn-prev-question');
  const btnNext = document.getElementById('btn-next-question');
  const txtNextMobile = document.getElementById('txt-next-mobile');
  const txtNextDesktop = document.getElementById('txt-next-desktop');
  const iconNextArrow = document.getElementById('icon-next-arrow');
  const iconNextCheck = document.getElementById('icon-next-check');
  const directFinishBtn = document.getElementById('btn-direct-finish-exam');
  const directFinishBtnMobile = document.getElementById('btn-direct-finish-exam-mobile');

  if (directFinishBtn) {
    if (isReady) {
      directFinishBtn.classList.remove('hidden');
      directFinishBtn.disabled = false;
      directFinishBtn.classList.add('bg-red-600', 'hover:bg-red-700', 'text-white', 'shadow-md', 'shadow-red-600/30');
    } else {
      directFinishBtn.classList.add('hidden');
    }
  }

  if (directFinishBtnMobile) {
    if (isReady) {
      directFinishBtnMobile.classList.remove('hidden');
      directFinishBtnMobile.disabled = false;
      directFinishBtnMobile.classList.add('bg-red-600', 'hover:bg-red-700', 'text-white', 'shadow-md', 'shadow-red-600/30');
    } else {
      directFinishBtnMobile.classList.add('hidden');
    }
  }

  if (pb) {
    if (EXAM_STATE.currentIndex === 0 || t === 0) pb.disabled = true;
    else pb.disabled = false;
  }

  if (btnNext && txtNextMobile && txtNextDesktop && iconNextArrow && iconNextCheck) {
    if (isReady) {
      txtNextMobile.innerText = 'Selesai';
      txtNextDesktop.innerText = 'Selesai';
      iconNextArrow.classList.add('hidden');
      iconNextCheck.classList.remove('hidden');
      btnNext.className = "flex items-center justify-center gap-1 sm:gap-2 py-2.5 px-3 md:px-10 rounded-xl bg-red-600 hover:bg-red-700 text-white font-semibold shadow-md shadow-red-600/30 transition-all active:scale-95 active:translate-y-[1px] duration-100 flex-1 sm:flex-none text-xs sm:text-sm";
    } else {
      txtNextMobile.innerText = 'Next';
      txtNextDesktop.innerText = 'Selanjutnya';
      iconNextArrow.classList.remove('hidden');
      iconNextCheck.classList.add('hidden');
      btnNext.className = "flex items-center justify-center gap-1 sm:gap-2 py-2.5 px-3 md:px-10 rounded-xl text-white font-semibold shadow-md transition-all active:scale-95 active:translate-y-[1px] duration-100 flex-1 sm:flex-none bg-primary hover:bg-blue-800 shadow-primary/30 text-xs sm:text-sm";
    }
  }
}

function renderDesktopMapGrid() {
  const renderGridItems = (containerId) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';
    const isMobile = containerId === 'question-grid-mobile';

    const questions = Array.isArray(EXAM_STATE.scrambledQuestions) ? EXAM_STATE.scrambledQuestions : [];
    questions.forEach((q, idx) => {
      const i = idx + 1;
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.onclick = async () => {
        markStudentActiveNow();
        if (typeof ensureExamBankSoalFreshOnAction === 'function') {
          try { await ensureExamBankSoalFreshOnAction(); } catch (_) { }
        }
        EXAM_STATE.currentIndex = idx;
        saveExamStateToLocal({ skipCloudSchedule: true });
        renderExamQuestion();
        toggleMobileSheet(false);
      };

      let classes = 'relative aspect-square flex items-center justify-center rounded-lg font-bold border transition-all active:scale-90 active:translate-y-[1px] duration-100 ';
      if (idx === EXAM_STATE.currentIndex) {
        classes += 'ring-2 ring-primary dark:ring-blue-500 ring-offset-2 dark:ring-offset-slate-800 ';
      }

      const isAnswered = EXAM_STATE.answers[q.id] !== undefined;
      const isFlagged = !!EXAM_STATE.doubts[q.id];

      if (isFlagged) {
        classes += 'bg-accent text-white border-accent hover:bg-amber-600';
      } else if (isAnswered) {
        classes += 'bg-primary dark:bg-blue-600 text-white border-primary dark:border-blue-600 hover:bg-blue-800 dark:hover:bg-blue-700';
      } else {
        classes += 'bg-white/10 text-slate-200 border-white/15 hover:bg-white/20';
      }

      classes += isMobile ? ' p-1 text-[11px] sm:text-xs ' : ' text-sm ';
      btn.className = classes.trim();
      btn.innerText = i;

      if (isAnswered && !isFlagged) {
        const badge = document.createElement('span');
        const badgeSizeClass = isMobile ? 'w-3.5 h-3.5 text-[8px] -bottom-0.5 -right-0.5' : 'w-4 h-4 text-[9px] -bottom-1 -right-1';
        badge.className = `absolute bg-white dark:bg-slate-800 rounded-full text-primary dark:text-blue-400 flex items-center justify-center font-bold border border-primary dark:border-blue-500 shadow-sm ${badgeSizeClass}`;
        badge.innerText = EXAM_STATE.answers[q.id];
        btn.appendChild(badge);
      }

      container.appendChild(btn);
    });
  };

  renderGridItems('question-grid-desktop');
  renderGridItems('question-grid-mobile');
}
