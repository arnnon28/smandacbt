function getBankSoalPacketById(id) { return ALL_PACKETS.find(p => p.id_paket === id); }

async function ensureAdminPacketLoaded(packetId) {
  if (!packetId) return null;
  let packet = getBankSoalPacketById(packetId);
  if (packet?.daftar_soal) return packet;
  const loaded = typeof loadBankSoalPacket === 'function'
    ? await loadBankSoalPacket(packetId, { preferStorage: true })
    : null;
  if (!loaded) return packet;
  const idx = ALL_PACKETS.findIndex(p => p.id_paket === packetId);
  if (idx >= 0) ALL_PACKETS[idx] = { ...ALL_PACKETS[idx], ...loaded };
  else ALL_PACKETS.push(loaded);
  return loaded;
}

async function publishBankSoalPacket(packetData) {
  if (!packetData?.id_paket) return false;
  const version = packetData.konten_versi || new Date().toISOString();
  const normalized = typeof normalizeBankSoalPacket === 'function'
    ? normalizeBankSoalPacket({ ...packetData, konten_versi: version })
    : { ...packetData, konten_versi: version };
  if (typeof syncBankSoalPacketToStorage === 'function') {
    return syncBankSoalPacketToStorage(normalized);
  }
  return false;
}
function refreshBankSoalDropdowns(force = false, options = {}) {
  const { refreshList = true } = options;
  if (!force && isAdminPortraitMobile()) return;
  const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : (v) => String(v ?? '');
  const packetOptions = ALL_PACKETS.map(p => `<option value="${esc(p.id_paket)}">${esc(p.nama_paket ?? '')}</option>`).join('');
  const createSelect = document.getElementById('manual-question-packet');
  const viewSelect = document.getElementById('filter-banksoal-packet');
  if (createSelect) {
    const current = createSelect.value;
    createSelect.innerHTML = `<option value="">Pilih Soal</option><option value="__new__">--- Buat Soal Baru ---</option>` + packetOptions;
    createSelect.value = current || "";
    updateManualPacketMode();
  }
  if (viewSelect) {
    const current = viewSelect.value;
    viewSelect.innerHTML = `<option value="">Semua Soal</option>` + packetOptions;
    viewSelect.value = current || "";
  }
  const viewTab = document.getElementById('banksoal-tab-view');
  if (refreshList && viewTab && !viewTab.classList.contains('hidden')) {
    renderBankSoalQuestionList();
  }
}

function updateManualPacketMode() {
  const packetSelect = document.getElementById('manual-question-packet');
  const newPacketWrapper = document.getElementById('new-packet-name-wrapper');
  if (!packetSelect || !newPacketWrapper) return;
  const isCreatingNew = packetSelect.value === '__new__';
  newPacketWrapper.classList.toggle('hidden', !isCreatingNew);
  if (!isCreatingNew) {
    const newPacketInput = document.getElementById('manual-new-packet-name');
    if (newPacketInput) newPacketInput.value = '';
  }
}

function resetManualQuestionFormState() {
  window.currentEditingQuestionId = null;
  const saveBtn = document.getElementById('btn-save-manual-question');
  if (saveBtn) saveBtn.textContent = 'Simpan + Tambah Soal';
}

function clearManualQuestionTextarea() {
  const el = document.getElementById('manual-question-text');
  if (el) { el.innerHTML = ''; }

  ['A', 'B', 'C', 'D', 'E'].forEach(letter => {
    const opt = document.getElementById(`manual-option-${letter}`);
    if (opt) opt.innerHTML = '';
  });

  const correctKey = document.getElementById('manual-correct-key');
  if (correctKey) correctKey.value = 'A';
  const packetSelect = document.getElementById('manual-question-packet');
  if (packetSelect) { packetSelect.value = ''; updateManualPacketMode(); }
  const newPacketInput = document.getElementById('manual-new-packet-name');
  if (newPacketInput) newPacketInput.value = '';
  if (el) el.focus();
  resetManualQuestionFormState();
}

function populateManualQuestionForm(packetId, question) {
  const packetSelect = document.getElementById('manual-question-packet');
  if (!packetSelect) return;
  packetSelect.value = packetId || '';
  updateManualPacketMode();

  const questionText = document.getElementById('manual-question-text');
  if (questionText) questionText.innerHTML = stripQuestionKeyFromHtml(question.soal || '');
  const questionImageAsset = normalizeImageAsset(question.image);
  if (questionText && questionImageAsset && !/<img[\s\S]*src=['\"]?data:image/i.test(questionText.innerHTML || '')) {
    questionText.innerHTML += `<div><img src="${questionImageAsset.data}" alt="Gambar" style="max-width:100%; height:auto; display:block; margin-top:0.75rem; border-radius:1rem;"></div>`;
  }

  const correctKeyInput = document.getElementById('manual-correct-key');
  if (correctKeyInput) correctKeyInput.value = question.correct_key || 'A';

  ['A', 'B', 'C', 'D', 'E'].forEach(letter => {
    const optionInput = document.getElementById(`manual-option-${letter}`);
    const optionData = (question.opsi || []).find(opt => opt.key === letter) || {};
    if (optionInput) optionInput.innerHTML = stripQuestionKeyFromHtml(optionData.text || '');
    const optionImageAsset = normalizeImageAsset(optionData.image);
    if (optionInput && optionImageAsset && !/<img[\s\S]*src=['\"]?data:image/i.test(optionInput.innerHTML || '')) {
      optionInput.innerHTML += `<div><img src="${optionImageAsset.data}" alt="Gambar" style="max-width:100%; height:auto; display:block; margin-top:0.5rem; border-radius:1rem;"></div>`;
    }
  });

  window.currentEditingQuestionId = question.id;
  const saveBtn = document.getElementById('btn-save-manual-question');
  if (saveBtn) saveBtn.textContent = 'Simpan Perubahan Soal';
}

function setBankSoalTab(tab) {
  const createTab = document.getElementById('banksoal-tab-create');
  const packetsTab = document.getElementById('banksoal-tab-packets');
  const viewTab = document.getElementById('banksoal-tab-view');
  const createBtn = document.getElementById('tab-banksoal-create');
  const packetsBtn = document.getElementById('tab-banksoal-packets');
  const viewBtn = document.getElementById('tab-banksoal-view');
  if (!createTab || !packetsTab || !viewTab || !createBtn || !packetsBtn || !viewBtn) return;
  const isCreate = tab === 'create';
  const isPackets = tab === 'packets';
  const isView = tab === 'view';
  createTab.classList.toggle('hidden', !isCreate);
  packetsTab.classList.toggle('hidden', !isPackets);
  viewTab.classList.toggle('hidden', !isView);
  createBtn.classList.toggle('bg-primary', isCreate);
  createBtn.classList.toggle('text-white', isCreate);
  createBtn.classList.toggle('bg-white/10', !isCreate);
  createBtn.classList.toggle('text-slate-500', !isCreate);
  packetsBtn.classList.toggle('bg-primary', isPackets);
  packetsBtn.classList.toggle('text-white', isPackets);
  packetsBtn.classList.toggle('bg-white/10', !isPackets);
  packetsBtn.classList.toggle('text-slate-500', !isPackets);
  viewBtn.classList.toggle('bg-primary', isView);
  viewBtn.classList.toggle('text-white', isView);
  viewBtn.classList.toggle('bg-white/10', !isView);
  viewBtn.classList.toggle('text-slate-500', !isView);
  if (isPackets) renderPacketsCards();
  if (isView) renderBankSoalQuestionList();
  if (isCreate && !window.currentEditingQuestionId) resetManualQuestionFormState();
}

function toggleWordFormatExample() {
  const content = document.getElementById('word-format-content');
  const button = document.getElementById('toggle-word-format');
  if (!content || !button) return;
  const isHidden = content.classList.toggle('hidden');
  button.textContent = isHidden ? '+' : '-';
}

document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggle-word-format');
  if (toggleBtn) toggleBtn.addEventListener('click', toggleWordFormatExample);
  const packetSelect = document.getElementById('manual-question-packet');
  if (packetSelect) {
    packetSelect.addEventListener('change', updateManualPacketMode);
    updateManualPacketMode();
  }
  document.querySelectorAll('.manual-contenteditable').forEach(editable => {
    editable.addEventListener('paste', handleContentEditablePaste);
  });
});

function insertHtmlAtCursor(html) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const fragment = range.createContextualFragment(html);
  range.insertNode(fragment);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

function handleContentEditablePaste(event) {
  const items = event.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      event.preventDefault();
      const file = item.getAsFile();
      if (!file) return;
      const maxKb = typeof BANK_SOAL_IMAGE_MAX_KB === 'number' ? BANK_SOAL_IMAGE_MAX_KB : 50;
      (async () => {
        try {
          const raw = typeof readFileAsDataUrl === 'function'
            ? await readFileAsDataUrl(file)
            : await new Promise((resolve, reject) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result);
              reader.onerror = () => reject(new Error('Gagal membaca gambar.'));
              reader.readAsDataURL(file);
            });
          const compressed = await compressImageToTargetSize(raw, maxKb);
          insertHtmlAtCursor(
            `<img src="${compressed}" alt="Gambar" style="max-width:100%; height:auto; display:block; margin-top:0.5rem; border-radius:1rem;">`
          );
        } catch (_) {
          if (typeof showNotification === 'function') {
            showNotification('Gagal', 'Gagal mengompres gambar tempel.', 'danger');
          }
        }
      })();
      return;
    }
  }
}

async function extractImagesFromHtml(html) {
  if (!html || typeof html !== 'string') return null;
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const imgEl = doc.querySelector('img');
  if (imgEl && imgEl.src && imgEl.src.startsWith('data:')) {
    const maxKb = typeof BANK_SOAL_IMAGE_MAX_KB === 'number' ? BANK_SOAL_IMAGE_MAX_KB : 50;
    const compressed = await ensureImageUnderMaxKb(imgEl.src, maxKb);
    return createImageAsset(compressed);
  }
  return null;
}

async function handleSaveManualQuestion() {
  if (!firebaseUser) return;
  const packetId = document.getElementById('manual-question-packet')?.value;
  const questionTextEl = document.getElementById('manual-question-text');
  const questionTextHtmlRaw = questionTextEl ? questionTextEl.innerHTML.trim() : '';
  const questionTextPlain = questionTextEl ? questionTextEl.textContent.trim() : '';
  const correctKey = document.getElementById('manual-correct-key')?.value;
  const isNewPacket = packetId === '__new__';
  const newPacketName = isNewPacket ? document.getElementById('manual-new-packet-name')?.value.trim() : null;
  const editingQuestionId = window.currentEditingQuestionId;
  const isEditing = !!editingQuestionId;
  if (!packetId) return showNotification('Pilih Paket', 'Pilih Soal terlebih dahulu.', 'danger');
  if (isNewPacket && !newPacketName) return showNotification('Nama Soal', 'Masukkan nama soal.', 'danger');
  if (!questionTextPlain && !/<img[\s\S]*src=['\"]?data:image/i.test(questionTextHtmlRaw)) return showNotification('Isi Soal', 'Pertanyaan wajib diisi.', 'danger');
  const existingName = ALL_PACKETS.find(p => String(p?.nama_paket || '').toLowerCase() === (newPacketName || '').toLowerCase());
  if (isNewPacket && existingName) return showNotification('Duplikat Paket', 'Nama soal sudah ada.', 'danger');
  const opsiKeys = ['A', 'B', 'C', 'D', 'E'];
  const opsi = [];
  const maxKb = typeof BANK_SOAL_IMAGE_MAX_KB === 'number' ? BANK_SOAL_IMAGE_MAX_KB : 50;
  for (const letter of opsiKeys) {
    const optionEl = document.getElementById(`manual-option-${letter}`);
    let textRaw = optionEl ? optionEl.innerHTML.trim() : '';
    if (textRaw && typeof compressDataUrlsInHtml === 'function') {
      textRaw = await compressDataUrlsInHtml(textRaw, maxKb);
      if (optionEl) optionEl.innerHTML = textRaw;
    }
    const optionTextPlain = optionEl ? optionEl.textContent.trim() : '';
    const optionImageAsset = await extractImagesFromHtml(textRaw);
    if (!optionTextPlain && !optionImageAsset) return showNotification('Isi Jawaban', `Jawaban ${letter} wajib diisi.`, 'danger');
    const textWithoutImages = textRaw.replace(/<img[^>]*>/gi, '').trim();
    const text = textWithoutImages ? sanitizeHtmlContent(stripQuestionKeyFromHtml(textWithoutImages)) : '';
    opsi.push({ key: letter, text, image: optionImageAsset });
  }
  let questionTextHtmlRawCompressed = questionTextHtmlRaw;
  if (questionTextHtmlRawCompressed && typeof compressDataUrlsInHtml === 'function') {
    questionTextHtmlRawCompressed = await compressDataUrlsInHtml(questionTextHtmlRawCompressed, maxKb);
    if (questionTextEl) questionTextEl.innerHTML = questionTextHtmlRawCompressed;
  }
  const questionTextHtml = sanitizeHtmlContent(stripQuestionKeyFromHtml(questionTextHtmlRawCompressed));
  const packet = isNewPacket
    ? { id_paket: `pkt_${Date.now()}`, nama_paket: newPacketName, daftar_soal: [] }
    : await ensureAdminPacketLoaded(packetId);
  if (!packet) return showNotification('Paket Tidak Ditemukan', 'Paket soal tidak tersedia.', 'danger');
  const updatedPacket = { ...packet };
  if (isEditing && !isNewPacket) {
    updatedPacket.daftar_soal = (packet.daftar_soal || []).map(q => q.id === editingQuestionId ? {
      ...q,
      soal: questionTextHtml,
      image: null,
      opsi,
      correct_key: correctKey
    } : q);
  } else {
    const newQuestion = {
      id: editingQuestionId || `q_${Date.now()}`,
      nomer: (packet.daftar_soal?.length || 0) + 1,
      soal: questionTextHtml,
      image: null,
      opsi,
      correct_key: correctKey
    };
    updatedPacket.daftar_soal = [...(packet.daftar_soal || []), newQuestion];
  }
  const targetPacketId = isNewPacket ? packet.id_paket : packetId;
  toggleLoader(true, 'Menyimpan soal...');
  try {
    const record = typeof normalizeBankSoalPacket === 'function'
      ? normalizeBankSoalPacket({ ...updatedPacket, konten_versi: new Date().toISOString() })
      : { ...updatedPacket, konten_versi: new Date().toISOString() };

    const published = await publishBankSoalPacket(record);
    if (!published) console.warn('publishBankSoalPacket: storage sync failed');
    await setDoc(getPublicDoc('Bank Soal', targetPacketId), record);
    if (isNewPacket) {
      ALL_PACKETS.push(record);
    } else {
      const idx = ALL_PACKETS.findIndex(p => p.id_paket === targetPacketId);
      if (idx >= 0) ALL_PACKETS[idx] = record;
    }
    const packetSelectEl = document.getElementById('manual-question-packet');
    if (packetSelectEl) packetSelectEl.value = targetPacketId;
    packet.daftar_soal = record.daftar_soal;
    showNotification('Sukses', 'Soal berhasil disimpan.', 'success');
    renderPacketsCards();
    refreshBankSoalDropdowns(true);
    updateManualPacketMode();
    if (document.getElementById('banksoal-tab-create')?.classList.contains('hidden')) {
      renderBankSoalQuestionList();
    }
    const questionTextEl = document.getElementById('manual-question-text');
    if (questionTextEl) questionTextEl.innerHTML = '';
    window.currentEditingQuestionId = null;
    const saveBtn = document.getElementById('btn-save-manual-question');
    if (saveBtn) saveBtn.textContent = 'Simpan + Tambah Soal';

    ['A', 'B', 'C', 'D', 'E'].forEach(letter => {
      const opt = document.getElementById(`manual-option-${letter}`);
      if (opt) opt.innerHTML = '';
    });
    const correctKeyInput = document.getElementById('manual-correct-key');
    if (correctKeyInput) correctKeyInput.value = 'A';
  } catch (err) {
    showNotification('Gagal', err.message, 'danger');
  } finally {
    toggleLoader(false);
  }
}

function getBankSoalQuestionSearchText(question) {
  const parts = [];
  if (question?.soal) {
    parts.push(stripHtmlToText(stripQuestionKeyFromHtml(question.soal)));
  }
  (question?.opsi || []).forEach((opt) => {
    if (opt?.text) parts.push(stripHtmlToText(stripQuestionKeyFromHtml(opt.text)));
  });
  return parts.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
}

function renderBankSoalQuestionList() {
  const container = document.getElementById('banksoal-question-list');
  if (!container) return;
  const searchValue = document.getElementById('search-banksoal-question')?.value.toLowerCase() || '';
  const selectedPacket = document.getElementById('filter-banksoal-packet')?.value;
  const pageSize = getPageSizeFromSelect('banksoal-page-size', 50);
  let pageNumber = getPageNumber('banksoal');

  const packetIdsNeeded = selectedPacket
    ? [selectedPacket]
    : ALL_PACKETS.map((p) => p.id_paket).filter(Boolean);
  const missingDetailIds = packetIdsNeeded.filter((id) => {
    const pkt = getBankSoalPacketById(id);
    return pkt && !Array.isArray(pkt.daftar_soal);
  });
  if (missingDetailIds.length && typeof ensureAdminPacketLoaded === 'function' && !window.__bankSoalViewHydrating) {
    window.__bankSoalViewHydrating = true;
    Promise.all(missingDetailIds.map((id) => ensureAdminPacketLoaded(id)))
      .catch((e) => console.warn('renderBankSoalQuestionList hydrate failed', e))
      .finally(() => {
        window.__bankSoalViewHydrating = false;
        renderBankSoalQuestionList();
      });
  }

  const questions = [];
  if (selectedPacket) {
    const packet = getBankSoalPacketById(selectedPacket);
    if (packet?.daftar_soal?.length) packet.daftar_soal.forEach(q => questions.push({ ...q, packetName: packet.nama_paket, packetId: packet.id_paket }));
  } else {
    ALL_PACKETS.forEach(pkt => { (pkt.daftar_soal || []).forEach(q => questions.push({ ...q, packetName: pkt.nama_paket, packetId: pkt.id_paket })); });
  }
  const filtered = questions.filter((q) => {
    if (!searchValue) return true;
    return getBankSoalQuestionSearchText(q).includes(searchValue);
  });
  if (!filtered.length) {
    container.innerHTML = `<div class="p-6 text-center text-slate-400 rounded-lg text-sm">Soal tidak ditemukan.</div>`;
    buildPaginationControls('banksoal-pagination-controls', 1, 0, () => { });
    return;
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (pageNumber > pageCount) pageNumber = pageCount;
  setPageNumber('banksoal', pageNumber);
  const pageItems = filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
  const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : (v) => String(v ?? '');

  container.innerHTML = '';
  pageItems.forEach((q, idx) => {
    const card = document.createElement('div');
    card.className = 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 hover:shadow-lg transition space-y-4';

    const optionsHtml = (q.opsi || []).map(opt => {
      const isCorrect = opt.key === q.correct_key;
      const optionHtml = sanitizeHtmlContent(opt.text || '-');
      const optionImageAsset = normalizeImageAsset(opt.image);
      const optionImageHtml = optionImageAsset && !/<img[\s\S]*src=['\"]?data:image/i.test(optionHtml)
        ? `<div class="mt-2"><img src="${optionImageAsset.data}" alt="Opsi ${opt.key}" class="max-w-full h-auto rounded-xl object-contain"></div>`
        : '';
      return `
        <div class="flex gap-3 p-3 rounded-xl cursor-default transition ${isCorrect ? 'bg-transparent text-emerald-800 dark:text-emerald-200' : 'bg-transparent text-slate-700 dark:text-slate-300'}">
          <span class="font-extrabold w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0 text-xs monospace ${isCorrect ? 'bg-emerald-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'}">${opt.key}</span>
          <div class="flex-1">
            <p class="text-sm font-semibold leading-relaxed mt-0.5">${optionHtml}</p>
            ${optionImageHtml}
          </div>
        </div>`;
    }).join('');
    const questionImageAsset = normalizeImageAsset(q.image);

    card.innerHTML = `
      <div class="flex justify-between items-start gap-3">
        <div>
          <span class="text-xs font-extrabold uppercase text-slate-400">Soal ke: <span class="text-primary dark:text-accent font-black">${esc(q.nomer)}</span></span>
          <p class="text-xs font-semibold text-slate-500 dark:text-slate-400 mt-0.5">${esc(q.packetName ?? '')}</p>
        </div>
        <div class="flex gap-2 flex-shrink-0">
          <button onclick="event.stopPropagation(); triggerEditBankSoalQuestion('${esc(q.packetId || '')}', '${esc(q.id || '')}')" class="text-xs px-3 py-1.5 rounded-lg border border-blue-300 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 font-semibold">Edit</button>
          <button onclick="event.stopPropagation(); triggerDeleteBankSoalQuestion('${esc(q.packetId || '')}', '${esc(q.id || '')}')" class="text-xs px-3 py-1.5 rounded-lg border border-red-300 text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 font-semibold">Hapus</button>
        </div>
      </div>
      <p class="question-card-text text-sm md:text-base font-semibold leading-relaxed text-slate-700 dark:text-slate-300">${sanitizeHtmlContent(stripQuestionKeyFromHtml(q.soal || '-'))}</p>
      ${questionImageAsset ? `<div class="question-image-wrapper rounded-xl"><img src="${questionImageAsset.data}" alt="Soal" class="object-contain"></div>` : ''}
      <div class="question-options-group space-y-2">
        ${optionsHtml}
      </div>
    `;
    container.appendChild(card);
  });

  buildPaginationControls('banksoal-pagination-controls', pageNumber, pageCount, (newPage) => {
    setPageNumber('banksoal', newPage);
    renderBankSoalQuestionList();
  });
  if (typeof safeCreateIcons === 'function') safeCreateIcons();
  else if (typeof lucide !== 'undefined') lucide.createIcons();
}

window.triggerEditBankSoalQuestion = function (packetId, questionId) {
  if (!firebaseUser) return;
  const packet = getBankSoalPacketById(packetId);
  const question = packet?.daftar_soal?.find(q => q.id === questionId);
  if (!packet || !question) return;
  populateManualQuestionForm(packetId, question);
  setBankSoalTab('create');
  window.currentEditingQuestionId = questionId;
};

window.triggerDeleteBankSoalQuestion = function (packetId, questionId) {
  if (!firebaseUser) return;
  showConfirmation('Hapus Soal', 'Yakin ingin menghapus soal ini?', async () => {
    toggleLoader(true, 'Menghapus soal...');
    try {
      const packet = await ensureAdminPacketLoaded(packetId);
      if (!packet) throw new Error('Paket tidak ditemukan');
      const updatedQuestions = (packet.daftar_soal || []).filter(q => q.id !== questionId).map((q, idx) => ({ ...q, nomer: idx + 1 }));
      const updatedPacket = typeof normalizeBankSoalPacket === 'function'
        ? normalizeBankSoalPacket({ ...packet, daftar_soal: updatedQuestions, konten_versi: new Date().toISOString() })
        : { ...packet, daftar_soal: updatedQuestions, konten_versi: new Date().toISOString() };
      const published = await publishBankSoalPacket(updatedPacket);
      if (!published) console.warn('publishBankSoalPacket: storage sync failed');
      await setDoc(getPublicDoc('Bank Soal', packetId), updatedPacket);
      const idx = ALL_PACKETS.findIndex(p => p.id_paket === packetId);
      if (idx >= 0) ALL_PACKETS[idx] = updatedPacket;
      showNotification('OK', 'Soal dihapus.', 'success');
      renderBankSoalQuestionList();
    } catch (err) {
      showNotification('Gagal', err.message, 'danger');
    } finally { toggleLoader(false); }
  });
};
