function updateExamAnswerSelection() {
  document.querySelectorAll('#exam-options-container .option-input').forEach((radio) => {
    const q = EXAM_STATE.scrambledQuestions[EXAM_STATE.currentIndex];
    if (!q) return;
    radio.checked = EXAM_STATE.answers[q.id] === radio.value;
  });
  updateExamProgressUI();
  renderDesktopMapGrid();
}

function renderExamQuestion() {
  const q = EXAM_STATE.scrambledQuestions[EXAM_STATE.currentIndex];
  const qNumDesktop = document.getElementById('current-q-num-desktop');
  const qNumMobile = document.getElementById('current-q-num-mobile');
  const tEl = document.getElementById('exam-question-text');
  const mb = document.getElementById('exam-media-placeholder');
  const mi = document.getElementById('exam-question-image');
  const chkRagu = document.getElementById('chk-ragu');
  const oc = document.getElementById('exam-options-container');
  const qNum = EXAM_STATE.currentIndex + 1;

  if (qNumDesktop) qNumDesktop.innerText = q ? qNum : '0';
  if (qNumMobile) qNumMobile.innerText = q ? qNum : '0';

  if (!q) {
    if (tEl) tEl.innerText = 'Tidak ada soal tersedia.';
    if (mb) mb.classList.add('hidden');
    if (chkRagu) chkRagu.disabled = true;
    if (oc) oc.innerHTML = `<div class="p-4 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 text-sm">Belum ada soal pada paket ini.</div>`;
    updateExamProgressUI(); renderDesktopMapGrid();
    return;
  }

  if (tEl) {
    let cleanSoal = q.soal || '-';
    cleanSoal = stripQuestionKeyFromHtml(cleanSoal);
    tEl.innerHTML = sanitizeHtmlContent(cleanSoal);
  }
  const currentQuestionImageAsset = normalizeImageAsset(q.image);
  if (currentQuestionImageAsset && mi && mb) {
    mi.src = currentQuestionImageAsset.data;
    mb.classList.remove('hidden');
  } else if (mb) mb.classList.add('hidden');

  if (chkRagu) {
    chkRagu.disabled = false;
    chkRagu.checked = !!EXAM_STATE.doubts[q.id];
  }

  if (oc) {
    oc.innerHTML = "";
    const so = (EXAM_STATE.scrambledOptions && EXAM_STATE.scrambledOptions[q.id]) ? EXAM_STATE.scrambledOptions[q.id] : (q.opsi || []);
    so.forEach(opt => {
      const isChecked = EXAM_STATE.answers[q.id] === opt.key;
      const optId = `opt-${q.id}-${opt.key}`;
      const optTextHtml = sanitizeHtmlContent(opt.text || '');
      const optionImageAsset = typeof normalizeImageAsset === 'function'
        ? normalizeImageAsset(opt.image)
        : null;
      const hasText = !!(opt.text && String(opt.text).replace(/<[^>]*>/g, '').trim());
      const optionImageHtml = optionImageAsset && !/<img[\s\S]*src=['\"]?data:image/i.test(optTextHtml)
        ? `<div class="mt-2"><img src="${optionImageAsset.data}" alt="Opsi ${opt.key}" class="max-w-full h-auto rounded-xl object-contain"></div>`
        : '';
      const bodyHtml = hasText || optionImageHtml
        ? `${hasText ? optTextHtml : ''}${optionImageHtml}`
        : '-';
      const wrapper = document.createElement('div');
      wrapper.className = 'relative w-full';
      wrapper.innerHTML = `
        <input type="radio" name="answer" id="${optId}" class="option-input peer sr-only" value="${opt.key}" ${isChecked ? 'checked' : ''}>
        <label for="${optId}" class="group option-label flex items-start py-3 px-4 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 cursor-pointer active:scale-[0.99] active:translate-y-[1px] duration-100 w-full">
          <span class="option-letter shrink-0 w-8 h-8 rounded-full border-2 border-slate-200 dark:border-slate-600 flex items-center justify-center font-bold text-slate-600 dark:text-slate-400 mr-4 group-hover:border-primary group-hover:text-primary dark:group-hover:border-blue-400 dark:group-hover:text-blue-400">${opt.key}</span>
          <div class="option-text text-base font-medium pt-0.5 leading-normal text-justify">${bodyHtml}</div>
        </label>`;
      const radio = wrapper.querySelector('input');
      radio.addEventListener('change', () => {
        const currentQ = EXAM_STATE.scrambledQuestions[EXAM_STATE.currentIndex];
        if (!currentQ) return;
        EXAM_STATE.answers[currentQ.id] = opt.key;
        saveExamStateToLocal();
        updateExamAnswerSelection();
      });
      oc.appendChild(wrapper);
    });
  }

  const preferredSize = myLocalStorage.getItem('fontSizePreference')
    || ({ kecil: 'small', sedang: 'medium', besar: 'large' }[myLocalStorage.getItem('unbk-preferred-fontsize')] || 'medium');
  changeExamFontSize(preferredSize);
  updateExamProgressUI();
  renderDesktopMapGrid();
  const scrollArea = document.querySelector('.exam-scroll-area');
  if (scrollArea) scrollArea.scrollTop = 0;
  if (typeof safeCreateIcons === 'function') safeCreateIcons();
  else if (typeof lucide !== 'undefined') lucide.createIcons();
}
