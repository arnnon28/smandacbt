function renderStudentsCards() {
  const tbody = document.getElementById('students-table-body');
  if (!tbody) return;
  const sv = (document.getElementById('search-student')?.value || '').toLowerCase();
  const cf = document.getElementById('filter-student-class')?.value || '';
  const pageSize = getPageSizeFromSelect('students-page-size', 50);
  let pageNumber = getPageNumber('students');

  const filtered = ALL_STUDENTS.filter(s => {
    const nis = String(s.nis || '').toLowerCase();
    const nama = String(s.nama || '').toLowerCase();
    return (nis.includes(sv) || nama.includes(sv)) && (!cf || s.kelas === cf);
  }).sort((a, b) => {
    const kelasComp = sortClassStrings(a.kelas || '', b.kelas || '');
    if (kelasComp !== 0) return kelasComp;
    return String(a.nama || '').localeCompare(String(b.nama || ''), 'id');
  });
  const disp = document.getElementById('student-count-display'); if (disp) disp.innerText = filtered.length;

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-8 text-center text-slate-400 font-bold text-xs">Data siswa tidak ditemukan</td></tr>`;
    buildPaginationControls('students-pagination-controls', 1, 0, () => { });
    return;
  }

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  if (pageNumber > pageCount) pageNumber = pageCount;
  setPageNumber('students', pageNumber);
  const pageItems = filtered.slice((pageNumber - 1) * pageSize, pageNumber * pageSize);
  const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : (v) => String(v ?? '');

  tbody.innerHTML = pageItems.map((s, index) => {
    const nis = esc(s.nis);
    const nama = esc(formatStudentNameForDisplay(s.nama));
    const kelas = esc(s.kelas);
    const password = esc(s.password);
    return `
      <tr class="hover:bg-slate-50/50 dark:hover:bg-slate-900/30 transition-colors border-b border-slate-100 dark:border-slate-800/80">
        <td class="py-3 px-4 font-bold text-slate-500 text-center">${(pageNumber - 1) * pageSize + index + 1}</td>
        <td class="py-3 px-4 font-semibold text-slate-500 dark:text-slate-400 monospace tracking-wide">${nis}</td>
        <td class="py-3 px-4 font-extrabold text-slate-700 dark:text-slate-100">${nama}</td>
        <td class="py-3 px-4 font-semibold text-slate-700 dark:text-slate-200">${s.jenis_kelamin === 'L' ? 'Laki-Laki' : s.jenis_kelamin === 'P' ? 'Perempuan' : esc(s.jenis_kelamin || '-')}</td>
        <td class="py-3 px-4 font-bold text-primary dark:text-accent">${kelas}</td>
        <td class="py-3 px-4 font-semibold text-slate-500 dark:text-slate-400 monospace">
          <div class="flex items-center gap-2">
            <span id="pwd-text-${nis}">\u2022\u2022\u2022\u2022\u2022\u2022</span>
            <span id="pwd-val-${nis}" class="hidden">${password}</span>
            <button type="button" data-action="toggle-pwd" data-nis="${nis}" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition" title="Lihat/Sembunyikan Password">
              <i data-lucide="eye" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
            </button>
          </div>
        </td>
        <td class="py-3 px-4 text-right">
          <div class="flex justify-end gap-1.5">
            <button type="button" data-action="edit-student" data-nis="${nis}" class="p-1.5 bg-blue-500/10 text-blue-500 hover:bg-blue-500/20 rounded-lg transition" title="Edit Siswa">
              <i data-lucide="edit" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
            </button>
            <button type="button" data-action="delete-student" data-nis="${nis}" class="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-lg transition" title="Hapus Siswa">
              <i data-lucide="trash-2" class="w-3.5 h-3.5 sm:w-4 sm:h-4"></i>
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('[data-action]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nis = btn.getAttribute('data-nis');
      if (!nis) return;
      const action = btn.getAttribute('data-action');
      if (action === 'toggle-pwd') toggleStudentPassword(nis);
      else if (action === 'edit-student') triggerEditStudent(nis);
      else if (action === 'delete-student') triggerStudentDelete(nis);
    });
  });

  buildPaginationControls('students-pagination-controls', pageNumber, pageCount, (newPage) => {
    setPageNumber('students', newPage);
    renderStudentsCards();
  });
  createIconsIn(tbody);
}

window.toggleStudentPassword = function (nis) {
  const textSpan = document.getElementById(`pwd-text-${nis}`);
  const valSpan = document.getElementById(`pwd-val-${nis}`);
  if (textSpan && valSpan) {
    if (textSpan.classList.contains('hidden')) {
      textSpan.classList.remove('hidden');
      valSpan.classList.add('hidden');
    } else {
      textSpan.classList.add('hidden');
      valSpan.classList.remove('hidden');
    }
  }
};

window.triggerEditStudent = function (nis) {
  if (!firebaseUser) return;
  const student = ALL_STUDENTS.find(s => s.nis === nis);
  if (!student) return;
  const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : (v) => String(v ?? '');

  showConfirmation("Edit Data Siswa", `
    <div class="space-y-3 text-base text-left text-slate-800 dark:text-slate-100">
      <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">NIS</label>
      <input id="e-n" value="${esc(student.nis)}" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-base text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">

      <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block mt-2">Nama Siswa</label>
      <input id="e-nm" value="${esc(student.nama)}" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-base text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">

      <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block mt-2">Kelas</label>
      <input id="e-k" value="${esc(student.kelas)}" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-base text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">

      <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block mt-2">Jenis Kelamin</label>
      <select id="e-jk" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-base text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">
        <option value="L" ${student.jenis_kelamin === 'L' ? 'selected' : ''}>Laki-laki</option>
        <option value="P" ${student.jenis_kelamin === 'P' ? 'selected' : ''}>Perempuan</option>
      </select>

      <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block mt-2">Password</label>
      <div class="relative">
        <input type="password" id="e-p" value="${esc(student.password)}" class="w-full p-2.5 pr-10 border border-slate-200 dark:border-slate-800 rounded-xl text-base text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">
        <button type="button" onclick="const i=document.getElementById('e-p'); i.type=i.type==='password'?'text':'password';" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
          <i class="fas fa-eye text-sm"></i>
        </button>
      </div>
    </div>
  `, async () => {
    const newNis = document.getElementById('e-n').value.trim();
    const nm = document.getElementById('e-nm').value.trim();
    const k = document.getElementById('e-k').value.trim();
    const jk = document.getElementById('e-jk').value;
    const p = document.getElementById('e-p').value.trim();

    if (!newNis || !nm || !k || !jk || !p) {
      showNotification("Input Gagal", "Semua kolom wajib diisi!", "danger");
      return;
    }

    if (newNis !== nis && ALL_STUDENTS.some(s => s.nis === newNis)) {
      showNotification("Input Gagal", "NIS sudah terdaftar!", "danger");
      return;
    }

    toggleLoader(true, "Mengupdate Siswa...");
    try {
      const updatedStudent = {
        nis: newNis,
        nama: nm,
        kelas: k,
        jenis_kelamin: jk,
        password: p
      };
      if (newNis !== nis) {
        await deleteDoc(getPublicDoc("Siswa", nis));
      }
      await setDoc(getPublicDoc("Siswa", newNis), updatedStudent);
      const idx = ALL_STUDENTS.findIndex(s => s.nis === nis);
      if (idx >= 0) {
        if (newNis !== nis) {
          ALL_STUDENTS.splice(idx, 1);
          ALL_STUDENTS.push(updatedStudent);
        } else {
          ALL_STUDENTS[idx] = updatedStudent;
        }
      }
      renderStudentsCards();
      updateClassSelectors(true);
      showNotification("Sukses", "Data siswa berhasil diperbarui!", "success");
    } catch (e) {
      showNotification("Gagal", e.message, "danger");
    } finally {
      toggleLoader(false);
    }
  });
};
