function shouldForceExamFullscreenFromDialog() {
  if (typeof requestExamFullscreen !== 'function') return false;
  if (window.__examFinalized || window.__examSubmitInFlight) return false;
  if (!document.body.classList.contains('exam-mode')) return false;
  if (!document.getElementById('view-student-exam')) return false;
  return true;
}

async function forceExamFullscreenFromDialogConfirm() {
  if (!shouldForceExamFullscreenFromDialog()) return;
  try {
    await requestExamFullscreen();
  } catch (_) {  }
}

function resetConfirmationDialogChrome(dialog, titleEl, messageEl) {
  dialog.classList.remove('exam-success-modal', 'warning-modal');
  document.body.classList.remove('warning-modal-open');
  const warningIcon = document.getElementById('dialog-warning-icon');
  if (warningIcon) warningIcon.classList.add('hidden');
  const iconWrapper = document.getElementById('dialog-icon-wrapper');
  if (iconWrapper) iconWrapper.classList.remove('hidden');
  const iconEl = document.getElementById('dialog-icon');
  if (iconEl) iconEl.classList.remove('hidden');
  const btnConfirm = document.getElementById('dialog-btn-confirm');
  if (btnConfirm) btnConfirm.textContent = 'Lanjutkan';
  const btnCancel = document.getElementById('dialog-btn-cancel');
  if (btnCancel) btnCancel.textContent = 'Batal';
  if (titleEl) {
    titleEl.style.fontSize = '';
    titleEl.classList.remove('hidden');
  }
  if (messageEl) {
    messageEl.style.fontSize = '';
    messageEl.querySelectorAll('[style*="font-size"]').forEach((el) => {
      el.style.fontSize = '';
    });
  }
}

function setDialogWarningVisualState(dialog, iconWrapper, iconEl, isWarning) {
  const warningIcon = document.getElementById('dialog-warning-icon');
  let emoticonEl = document.getElementById('dialog-emoticon');

  if (isWarning) {
    dialog.classList.add('warning-modal');
    if (warningIcon) {
      warningIcon.classList.remove('hidden');
      if (emoticonEl) emoticonEl.classList.add('hidden');
      iconEl.classList.add('hidden');
      iconWrapper.classList.add('hidden');
    } else {
      iconWrapper.classList.remove('hidden');
      if (!emoticonEl) {
        emoticonEl = document.createElement('span');
        emoticonEl.id = 'dialog-emoticon';
        emoticonEl.className = 'text-4xl animate-bounce';
        iconWrapper.appendChild(emoticonEl);
      }
      emoticonEl.innerText = '🚨';
      emoticonEl.classList.remove('hidden');
      iconEl.classList.add('hidden');
    }
  } else {
    dialog.classList.remove('warning-modal');
    if (warningIcon) warningIcon.classList.add('hidden');
    if (emoticonEl) emoticonEl.classList.add('hidden');
    iconWrapper.classList.remove('hidden');
    iconEl.classList.remove('hidden');
  }
}

function showNotification(title, message, iconType = 'info', onConfirm = null) {
  const dialog = document.getElementById('confirmation-dialog');
  const titleEl = document.getElementById('dialog-title');
  const messageEl = document.getElementById('dialog-message');
  const iconWrapper = document.getElementById('dialog-icon-wrapper');
  const iconEl = document.getElementById('dialog-icon');
  const btnCancel = document.getElementById('dialog-btn-cancel');
  const btnConfirm = document.getElementById('dialog-btn-confirm');
  if (!dialog || !titleEl || !messageEl || !iconWrapper || !iconEl || !btnConfirm) return;

  resetConfirmationDialogChrome(dialog, titleEl, messageEl);
  titleEl.innerText = title || '';
  if (!title) titleEl.classList.add('hidden');
  messageEl.innerHTML = message;

  const iconStr = String(iconType).toLowerCase();
  const titleStr = String(title).toLowerCase();
  const isWarning = (
    iconStr.includes('danger') ||
    iconStr.includes('warning') ||
    iconStr.includes('alert') ||
    titleStr.includes('peringatan') ||
    titleStr.includes('curang') ||
    titleStr.includes('danger') ||
    titleStr.includes('gagal')
  );

  setDialogWarningVisualState(dialog, iconWrapper, iconEl, isWarning);

  const warningIconEl = document.getElementById('dialog-warning-icon');
  const useWarningSvg = isWarning && warningIconEl && !warningIconEl.classList.contains('hidden');
  if (!useWarningSvg) {
    iconWrapper.className = iconType === 'success' ? 'bg-emerald-500/10 text-emerald-500' : iconType === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary';
    if (iconEl.setAttribute) {
      iconEl.setAttribute('data-lucide', iconType === 'success' ? 'check-circle' : iconType === 'danger' ? 'alert-triangle' : 'help-circle');
    }
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
  }
  if (iconType === 'success' && document.body.classList.contains('exam-mode')) {
    dialog.classList.add('exam-success-modal');
  }
  dialog.classList.remove('hidden');
  if (isWarning) document.body.classList.add('warning-modal-open');
  if (btnCancel) btnCancel.classList.add('hidden');
  btnConfirm.onclick = async () => {
    resetConfirmationDialogChrome(dialog, titleEl, messageEl);
    dialog.classList.add('hidden');
    if (isWarning) {
      await forceExamFullscreenFromDialogConfirm();
    }
    if (typeof onConfirm === 'function') {
      try {
        await onConfirm();
      } catch (err) {
        console.error('Notification confirm callback failed:', err);
      }
    }
  };
}

function showConfirmation(title, message, onConfirm, iconType = 'help-circle', onCancel = null, confirmLabel = 'Lanjutkan') {
  const dialog = document.getElementById('confirmation-dialog');
  const titleEl = document.getElementById('dialog-title');
  const messageEl = document.getElementById('dialog-message');
  const iconWrapper = document.getElementById('dialog-icon-wrapper');
  const iconEl = document.getElementById('dialog-icon');
  const btnCancel = document.getElementById('dialog-btn-cancel');
  const btnConfirm = document.getElementById('dialog-btn-confirm');
  if (!dialog || !titleEl || !messageEl || !iconWrapper || !iconEl || !btnCancel || !btnConfirm) return;

  resetConfirmationDialogChrome(dialog, titleEl, messageEl);
  if (confirmLabel) btnConfirm.textContent = confirmLabel;
  titleEl.innerText = title || '';
  if (!title) titleEl.classList.add('hidden');
  messageEl.innerHTML = message;

  const iconStr = String(iconType).toLowerCase();
  const titleStr = String(title).toLowerCase();

  let resolvedIcon = iconType;
  if (resolvedIcon === 'help-circle' || !resolvedIcon) {
    if (titleStr.includes('hapus') || titleStr.includes('delete') || titleStr.includes('kosongkan')) {
      resolvedIcon = 'trash-2';
    } else if (titleStr.includes('edit') || titleStr.includes('ubah') || titleStr.includes('tambah') || titleStr.includes('simpan')) {
      resolvedIcon = 'edit-3';
    } else if (titleStr.includes('selesai') || titleStr.includes('kirim') || titleStr.includes('sukses') || titleStr.includes('berhasil')) {
      resolvedIcon = 'check-circle';
    } else if (titleStr.includes('reset') || titleStr.includes('putar') || titleStr.includes('ulang')) {
      resolvedIcon = 'refresh-cw';
    }
  }

  const isWarning = (
    iconStr.includes('alert') ||
    iconStr.includes('triangle') ||
    iconStr.includes('octagon') ||
    iconStr.includes('trash') ||
    iconStr.includes('delete') ||
    resolvedIcon === 'trash-2' ||
    titleStr.includes('hapus') ||
    titleStr.includes('bersihkan') ||
    titleStr.includes('peringatan') ||
    titleStr.includes('curang') ||
    titleStr.includes('danger')
  );

  setDialogWarningVisualState(dialog, iconWrapper, iconEl, isWarning);

  const warningIconEl = document.getElementById('dialog-warning-icon');
  const useWarningSvg = isWarning && warningIconEl && !warningIconEl.classList.contains('hidden');
  if (!useWarningSvg) {
    let colorClass = 'bg-blue-500/10 text-blue-500 dark:bg-blue-500/20 dark:text-blue-400';
    if (isWarning) {
      colorClass = 'bg-rose-500/10 text-rose-500 dark:bg-rose-500/20 dark:text-rose-400';
    } else if (
      iconStr.includes('check') ||
      iconStr.includes('success') ||
      resolvedIcon === 'check-circle' ||
      titleStr.includes('selesai') ||
      titleStr.includes('sukses') ||
      titleStr.includes('berhasil')
    ) {
      colorClass = 'bg-emerald-500/10 text-emerald-500 dark:bg-emerald-500/20 dark:text-emerald-400';
    } else if (
      iconStr.includes('help') ||
      iconStr.includes('question') ||
      resolvedIcon === 'help-circle' ||
      titleStr.includes('tanya') ||
      titleStr.includes('konfirmasi')
    ) {
      colorClass = 'bg-amber-500/10 text-amber-500 dark:bg-amber-500/20 dark:text-accent';
    }

    iconWrapper.className = colorClass;
    if (iconEl.setAttribute) iconEl.setAttribute('data-lucide', resolvedIcon);
    if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
  }
  dialog.classList.remove('hidden');
  if (isWarning) document.body.classList.add('warning-modal-open');
  btnCancel.classList.remove('hidden');
  btnCancel.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    resetConfirmationDialogChrome(dialog, titleEl, messageEl);
    dialog.classList.add('hidden');
    if (typeof onCancel === 'function') {
      try {
        await onCancel();
      } catch (err) {
        console.error('Cancel callback failed:', err);
      }
    }
  };
  btnConfirm.onclick = async () => {
    resetConfirmationDialogChrome(dialog, titleEl, messageEl);
    dialog.classList.add('hidden');
    if (isWarning || shouldForceExamFullscreenFromDialog()) {
      await forceExamFullscreenFromDialogConfirm();
    }
    try {
      await onConfirm?.();
    } catch (err) {
      console.error('Confirmation callback failed:', err);
    }
  };
  if (typeof fitConfirmationDialogText === 'function') {
    requestAnimationFrame(() => fitConfirmationDialogText());
  }
}
