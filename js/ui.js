export function showNotification(title, message, iconType = 'info', onConfirm = null) {
  const dialog = document.getElementById('confirmation-dialog');
  const titleEl = document.getElementById('dialog-title');
  const messageEl = document.getElementById('dialog-message');
  const iconWrapper = document.getElementById('dialog-icon-wrapper');
  const iconEl = document.getElementById('dialog-icon');
  const btnCancel = document.getElementById('dialog-btn-cancel');
  const btnConfirm = document.getElementById('dialog-btn-confirm');
  if (!dialog || !titleEl || !messageEl || !iconWrapper || !iconEl || !btnConfirm) return;
  titleEl.innerText = title;
  messageEl.innerHTML = message;
  
  const iconStr = String(iconType).toLowerCase();
  const titleStr = String(title).toLowerCase();
  const isWarning = (
    iconStr.includes('danger') || 
    iconStr.includes('warning') || 
    iconStr.includes('alert') ||
    titleStr.includes('peringatan') ||
    titleStr.includes('danger') ||
    titleStr.includes('gagal')
  );

  let emoticonEl = document.getElementById('dialog-emoticon');
  if (isWarning) {
    dialog.classList.add('warning-modal');
    if (!emoticonEl) {
      emoticonEl = document.createElement('span');
      emoticonEl.id = 'dialog-emoticon';
      emoticonEl.className = 'text-4xl animate-bounce';
      iconWrapper.appendChild(emoticonEl);
    }
    emoticonEl.innerText = '🚨';
    emoticonEl.classList.remove('hidden');
    iconEl.classList.add('hidden');
  } else {
    dialog.classList.remove('warning-modal');
    if (emoticonEl) emoticonEl.classList.add('hidden');
    iconEl.classList.remove('hidden');
  }

  iconWrapper.className = iconType === 'success' ? 'bg-emerald-500/10 text-emerald-500' : iconType === 'danger' ? 'bg-red-500/10 text-red-500' : 'bg-primary/10 text-primary';
  iconEl.setAttribute('data-lucide', iconType === 'success' ? 'check-circle' : iconType === 'danger' ? 'alert-triangle' : 'help-circle');
  lucide.createIcons();
  dialog.classList.remove('hidden');
  if (btnCancel) btnCancel.classList.add('hidden');
  btnConfirm.onclick = () => {
    dialog.classList.add('hidden');
    if (onConfirm) onConfirm();
  };
}

export function showConfirmation(title, message, onConfirm, iconType = 'help-circle') {
  const dialog = document.getElementById('confirmation-dialog');
  const titleEl = document.getElementById('dialog-title');
  const messageEl = document.getElementById('dialog-message');
  const iconWrapper = document.getElementById('dialog-icon-wrapper');
  const iconEl = document.getElementById('dialog-icon');
  const btnCancel = document.getElementById('dialog-btn-cancel');
  const btnConfirm = document.getElementById('dialog-btn-confirm');
  if (!dialog || !titleEl || !messageEl || !iconWrapper || !iconEl || !btnCancel || !btnConfirm) return;
  titleEl.innerText = title;
  messageEl.innerHTML = message;
  
  const iconStr = String(iconType).toLowerCase();
  const titleStr = String(title).toLowerCase();
  
  let resolvedIcon = iconType;
  if (resolvedIcon === 'help-circle' || !resolvedIcon) {
    if (titleStr.includes('hapus') || titleStr.includes('delete') || titleStr.includes('purge') || titleStr.includes('kosongkan')) {
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
    titleStr.includes('peringatan') || 
    titleStr.includes('danger')
  );

  let emoticonEl = document.getElementById('dialog-emoticon');
  if (isWarning) {
    dialog.classList.add('warning-modal');
    if (!emoticonEl) {
      emoticonEl = document.createElement('span');
      emoticonEl.id = 'dialog-emoticon';
      emoticonEl.className = 'text-4xl animate-bounce';
      iconWrapper.appendChild(emoticonEl);
    }
    emoticonEl.innerText = '🚨';
    emoticonEl.classList.remove('hidden');
    iconEl.classList.add('hidden');
  } else {
    dialog.classList.remove('warning-modal');
    if (emoticonEl) emoticonEl.classList.add('hidden');
    iconEl.classList.remove('hidden');
  }

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
  iconEl.setAttribute('data-lucide', resolvedIcon);
  lucide.createIcons();
  dialog.classList.remove('hidden');
  btnCancel.classList.remove('hidden');
  btnCancel.onclick = () => dialog.classList.add('hidden');
  btnConfirm.onclick = async () => {
    dialog.classList.add('hidden');
    try {
      await onConfirm?.();
    } catch (err) {
      console.error('Confirmation callback failed:', err);
    }
  };
}

export function toggleLoader(show, text = "MENGOLAH...") {
  const loader = document.getElementById('global-spinner');
  if (!loader) return;
  if (show) {
    const txtEl = document.getElementById('global-spinner-text');
    if (txtEl) txtEl.innerText = text;
    loader.classList.remove('hidden');
  } else {
    loader.classList.add('hidden');
  }
}
