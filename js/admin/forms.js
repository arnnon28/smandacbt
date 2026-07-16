async function handleAddStudentManual() {
  if (!firebaseUser) return;
  showConfirmation("Tambah Siswa Manual", `
    <div class="space-y-2 text-left text-slate-800 dark:text-slate-100">
      <input id="m-n" placeholder="NIS" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">
      <input id="m-nm" placeholder="Nama" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">
      <input id="m-k" placeholder="Kelas" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">
      <select id="m-jk" class="w-full p-2 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">
        <option value="">Pilih Jenis Kelamin</option>
        <option value="L">Laki-laki</option>
        <option value="P">Perempuan</option>
      </select>
      <div class="relative">
        <input type="password" id="m-p" placeholder="Password" class="w-full p-2 pr-10 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50">
        <button type="button" onclick="const i=document.getElementById('m-p'); i.type=i.type==='password'?'text':'password';" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
          <i class="fas fa-eye text-sm"></i>
        </button>
      </div>
    </div>
  `, async () => {
    const n = document.getElementById('m-n').value.trim(), nm = document.getElementById('m-nm').value.trim(), k = document.getElementById('m-k').value.trim(), jk = document.getElementById('m-jk').value, p = document.getElementById('m-p').value.trim();
    if (!n || !nm || !k || !jk || !p) { showNotification("Input Gagal", "Semua kolom wajib diisi.", "danger"); return; }
    toggleLoader(true);
    try {
      const newStudent = { nis: n, nama: nm, kelas: k, jenis_kelamin: jk, password: p };
      await setDoc(getPublicDoc("Siswa", n), newStudent);
      ALL_STUDENTS.push(newStudent);
      renderStudentsCards();
      updateClassSelectors(true);
      showNotification("OK", "Disimpan", "success");
    } catch (e) { showNotification("Gagal", e.message || "Tidak dapat menyimpan siswa.", "danger"); } finally { toggleLoader(false); }
  });
}

async function handleAddAdminManual() {
  if (!firebaseUser) return;
  showConfirmation("Tambah Admin", `
    <div class="space-y-3 text-base text-left text-slate-800 dark:text-slate-100">
      <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">Username</label>
      <input id="new-adm-un" placeholder="Contoh: proktor2" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50 text-base">

      <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block mt-2">Password</label>
      <div class="relative">
        <input type="password" id="new-adm-p" placeholder="Password" class="w-full p-2.5 pr-10 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50 text-base">
        <button type="button" onclick="const i=document.getElementById('new-adm-p'); i.type=i.type==='password'?'text':'password';" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
          <i class="fas fa-eye text-sm"></i>
        </button>
      </div>
    </div>
  `, async () => {
    const un = document.getElementById('new-adm-un').value.trim();
    const p = document.getElementById('new-adm-p').value.trim();
    if (!un || !p) {
      showNotification("Input Gagal", "Username dan password wajib diisi!", "danger");
      return;
    }
    if (ALL_ADMINS.some(a => a.username.toLowerCase() === un.toLowerCase())) {
      showNotification("Input Gagal", "Username admin sudah terdaftar!", "danger");
      return;
    }
    toggleLoader(true, "Menyimpan Admin...");
    try {
      const newAdmin = { username: un, password: p };
      await setDoc(getPublicDoc("Admin", un), newAdmin);
      ALL_ADMINS.push(newAdmin);
      renderAdminsCards();
      showNotification("OK", "Admin berhasil disimpan", "success");
    } catch (e) {
      showNotification("Gagal", e.message || "Gagal menyimpan admin.", "danger");
    } finally {
      toggleLoader(false);
    }
  });
}

async function handleAddSchedule() {
  if (!firebaseUser) return; if (!ALL_PACKETS.length) return showNotification("Kosong", "Buat soal dulu", "danger");
  const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : (v) => String(v ?? '');
  const allClasses = [...new Set(ALL_STUDENTS.map(s => s.kelas))].sort(sortClassStrings);
  const classesX = allClasses.filter(k => /^X(?!I)/i.test(k));
  const classesXI = allClasses.filter(k => /^XI(?!I)/i.test(k));
  const classesXII = allClasses.filter(k => /^XII/i.test(k));

  const renderClassList = (classes, name) => classes.length
    ? `<div class="schedule-class-grid">${classes.map(c => `<label class="schedule-class-label"><input type="checkbox" name="sc" value="${esc(c)}" class="rounded text-primary"> <span>${esc(c)}</span></label>`).join('')}</div>`
    : `<p class="text-xs text-slate-500 dark:text-slate-400">Tidak ada kelas ${esc(name)}</p>`;

  showConfirmation("Buat Jadwal", `
    <div class="space-y-3 text-base text-left text-slate-800 dark:text-slate-100">
      <input id="s-m" placeholder="Mata Pelajaran" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50 text-base">
      <select id="s-p" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50 text-base">
        <option value="">Pilih Paket Soal</option>
        ${ALL_PACKETS.map(p => `<option value="${esc(p.id_paket)}">${esc(p.nama_paket ?? '')}</option>`).join('')}
      </select>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Waktu Mulai</label>
          <input type="datetime-local" id="s-dt" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50 text-base">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Waktu Selesai</label>
          <input type="datetime-local" id="s-dt-end" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50 text-base">
        </div>
      </div>
      <input type="number" id="s-d" placeholder="Durasi (Menit, referensi)" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50 text-base">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950">
        <div class="space-y-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-visible">
          <label class="flex items-center gap-2">
            <input type="checkbox" onchange="window.toggleGlobalClass('X', this.checked, 'sc')" class="rounded text-primary">
            <span class="text-sm font-bold text-blue-500">Pilih Semua X</span>
          </label>
          <div class="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            ${renderClassList(classesX, 'X')}
          </div>
        </div>
        <div class="space-y-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-visible">
          <label class="flex items-center gap-2">
            <input type="checkbox" onchange="window.toggleGlobalClass('XI', this.checked, 'sc')" class="rounded text-primary">
            <span class="text-sm font-bold text-blue-500">Pilih Semua XI</span>
          </label>
          <div class="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            ${renderClassList(classesXI, 'XI')}
          </div>
        </div>
        <div class="space-y-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-visible">
          <label class="flex items-center gap-2">
            <input type="checkbox" onchange="window.toggleGlobalClass('XII', this.checked, 'sc')" class="rounded text-primary">
            <span class="text-sm font-bold text-blue-500">Pilih Semua XII</span>
          </label>
          <div class="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            ${renderClassList(classesXII, 'XII')}
          </div>
        </div>
      </div>
      <label class="flex items-center gap-3 mt-4 text-base font-bold text-slate-800 dark:text-slate-100">
        <input type="checkbox" id="s-tn" class="rounded text-primary">
        <span>Tampilkan Nilai ke Siswa</span>
      </label>
    </div>
  `, async () => {
    const m = document.getElementById('s-m').value.trim();
    const p = document.getElementById('s-p').value;
    const dt = document.getElementById('s-dt').value;
    const dtEnd = document.getElementById('s-dt-end').value;
    const dr = parseInt(document.getElementById('s-d').value, 10) || 60;
    const cl = Array.from(document.querySelectorAll('input[name="sc"]:checked')).map(cb => cb.value);
    const tn = document.getElementById('s-tn').checked;

    if (!m || !p || !dt || !dtEnd || !cl.length) { showNotification("Input Gagal", "Mapel, paket, waktu mulai, waktu selesai, dan kelas wajib diisi.", "danger"); return; }
    const tk = Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join(''), id = `sch_${Date.now()}`;
    toggleLoader(true);
    try {
      const times = typeof resolveScheduleEndDatetime === 'function'
        ? resolveScheduleEndDatetime(dt, dtEnd, dr)
        : { mulai: dt, selesai: dtEnd, durasi: dr };
      const newSched = { id, mapel: m, id_paket: p, mulai: times.mulai, selesai: times.selesai, durasi: times.durasi, kelas_terpilih: cl, token: tk, tampil_nilai: tn };
      await setDoc(getPublicDoc("Jadwal Ujian", id), newSched);
      ALL_SCHEDULES.push(newSched);
      renderSchedules();
      renderDashboardActiveExamsTable();
      mySessionStorage.removeItem('tokens_generated_session');
      showNotification("OK", "Token: " + tk, "success");
    } catch (e) { showNotification("Gagal", e.message || "Tidak dapat menyimpan jadwal.", "danger"); } finally { toggleLoader(false); }
  });
}

async function handleGenerateAllTokens() {
  if (!firebaseUser) return;
  if (!ALL_SCHEDULES.length) return;

  if (mySessionStorage.getItem('tokens_generated_session') === 'true') {
    showNotification("Akses Dibatasi", "Generate token hanya diizinkan maksimal 1 kali setiap sesi ujian proktor!", "danger");
    return;
  }

  showConfirmation("Token Baru", "Regenerate semua token? Tindakan ini hanya dapat dilakukan 1 kali saja per sesi.", async () => {
    toggleLoader(true);
    try {
      const updatedSchedules = ALL_SCHEDULES.map(s => ({
        ...s,
        token: Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join('')
      }));
      const b = writeBatch();
      updatedSchedules.forEach(s => {
        b.update(getPublicDoc("Jadwal Ujian", s.id), s);
      });
      await b.commit();
      ALL_SCHEDULES = updatedSchedules;
      updateAdminTokenBars(true);
      renderSchedules();
      renderDashboardActiveExamsTable();
      mySessionStorage.setItem('tokens_generated_session', 'true');
      const btn = document.getElementById('btn-generate-all-tokens');
      if (btn) {
        btn.classList.add('opacity-50', 'cursor-not-allowed');
        btn.disabled = true;
      }
      showNotification("OK", "Selesai memperbarui token aktif sesi ini.", "success");
    } catch (e) {
      showNotification("Gagal", e.message, "danger");
    } finally {
      toggleLoader(false);
    }
  });
}
