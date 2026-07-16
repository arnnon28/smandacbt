function toggleLoader(show, text = "MENGOLAH...") {
  const loader = document.getElementById('global-spinner');
  if (!loader) return;
  if (show) {
    const lowerText = String(text || '').toLowerCase();
    const isAuth = lowerText.includes('autentikasi')
      || lowerText.includes('login')
      || lowerText.includes('masuk')
      || lowerText.includes('menghubungkan')
      || lowerText.includes('mempersiapkan')
      || lowerText.includes('menyiapkan');
    const isSend = lowerText.includes('mengirim')
      || lowerText.includes('kirim')
      || lowerText.includes('submit')
      || lowerText.includes('waktu habis');
    if (!isAuth && !isSend) {
      return;
    }
    const txtEl = document.getElementById('global-spinner-text');
    if (txtEl) txtEl.innerText = text;
    loader.classList.remove('hidden');
  } else {
    loader.classList.add('hidden');
  }
}
window.toggleLoader = toggleLoader;
