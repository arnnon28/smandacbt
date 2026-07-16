window.triggerStudentDelete = function (nis) {
  if (!firebaseUser) return;
  const student = ALL_STUDENTS.find(s => s.nis === nis);
  const displayName = student?.nama || nis;
  const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : (v) => String(v ?? '');
  showConfirmation("Hapus", `Hapus Siswa <strong>${esc(displayName)}</strong>?`, async () => {
    toggleLoader(true);
    try {
      await deleteDoc(getPublicDoc("Siswa", nis));
      ALL_STUDENTS = ALL_STUDENTS.filter(s => s.nis !== nis);
      renderStudentsCards();
      updateClassSelectors(true);
      showNotification("OK", "Dihapus", "success");
    } catch (e) { console.error('triggerStudentDelete failed', e); showNotification("Gagal", e.message || "Gagal menghapus siswa.", "danger"); } finally { toggleLoader(false); }
  });
};

window.toggleAdminDbPassword = function (username) {
  const idSuffix = encodeURIComponent(String(username || '')).replace(/%/g, '_');
  const textSpan = document.getElementById(`adm-pwd-text-${idSuffix}`);
  const valSpan = document.getElementById(`adm-pwd-val-${idSuffix}`);
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

window.triggerEditAdmin = function (username) {
  if (!firebaseUser) return;
  const admin = ALL_ADMINS.find(a => a.username === username);
  if (!admin) return;
  const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : (v) => String(v ?? '');
  showConfirmation("Edit Data Admin", `
    <div class="space-y-3 text-base text-left text-slate-800 dark:text-slate-100">
      <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block">Username</label>
      <input id="e-adm-un" value="${esc(admin.username)}" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50 text-base">

      <label class="font-extrabold text-slate-800 dark:text-slate-200 uppercase tracking-wider block mt-2">Password Baru</label>
      <div class="relative">
        <input type="password" id="e-adm-p" value="${esc(admin.password)}" class="w-full p-2.5 pr-10 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-900 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50 text-base">
        <button type="button" onclick="const i=document.getElementById('e-adm-p'); i.type=i.type==='password'?'text':'password';" class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
          <i class="fas fa-eye text-sm"></i>
        </button>
      </div>
    </div>
  `, async () => {
    const newUsername = document.getElementById('e-adm-un').value.trim();
    const p = document.getElementById('e-adm-p').value.trim();
    if (!newUsername || !p) {
      showNotification("Input Gagal", "Username dan password wajib diisi!", "danger");
      return;
    }
    if (newUsername.toLowerCase() !== username.toLowerCase() && ALL_ADMINS.some(a => a.username.toLowerCase() === newUsername.toLowerCase())) {
      showNotification("Input Gagal", "Username admin sudah terdaftar!", "danger");
      return;
    }
    toggleLoader(true, "Mengupdate Admin...");
    try {
      const updatedAdmin = { ...admin, username: newUsername, password: p };
      if (newUsername !== username) {
        await deleteDoc(getPublicDoc("Admin", username));
      }
      await setDoc(getPublicDoc("Admin", newUsername), updatedAdmin);

      const isSelf = CURRENT_USER && CURRENT_USER.username === username;
      if (isSelf && newUsername !== username) {
        CURRENT_USER.username = newUsername;
        mySessionStorage.setItem('cbt-session', JSON.stringify(CURRENT_USER));
        const selfNameEl = document.getElementById('header-profile-name');
        if (selfNameEl) selfNameEl.innerText = newUsername;
      }

      const idx = ALL_ADMINS.findIndex(a => a.username === username);
      if (idx >= 0) {
        if (newUsername !== username) {
          ALL_ADMINS.splice(idx, 1);
          ALL_ADMINS.push(updatedAdmin);
        } else {
          ALL_ADMINS[idx] = updatedAdmin;
        }
      }
      renderAdminsCards();
      showNotification("Sukses", "Data admin berhasil diperbarui!", "success");
    } catch (e) {
      showNotification("Gagal", e.message, "danger");
    } finally {
      toggleLoader(false);
    }
  });
};

window.triggerAdminDelete = function (username) {
  if (!firebaseUser) return;
  if (CURRENT_USER && CURRENT_USER.username === username) {
    showNotification("Gagal", "Anda tidak dapat menghapus akun Anda sendiri yang sedang aktif!", "danger");
    return;
  }
  showConfirmation("Hapus Admin", `Yakin ingin menghapus administrator ${username}?`, async () => {
    toggleLoader(true, "Menghapus Admin...");
    try {
      await deleteDoc(getPublicDoc("Admin", username));
      ALL_ADMINS = ALL_ADMINS.filter(a => a.username !== username);
      renderAdminsCards();
      showNotification("OK", "Admin berhasil dihapus.", "success");
    } catch (e) {
      showNotification("Gagal", e.message || "Gagal menghapus admin.", "danger");
    } finally {
      toggleLoader(false);
    }
  });
};

window.triggerDeleteSchedule = function (id) {
  if (!firebaseUser) return;
  showConfirmation("Hapus", "Hapus jadwal?", async () => {
    toggleLoader(true);
    try {
      await deleteDoc(getPublicDoc("Jadwal Ujian", id));
      ALL_SCHEDULES = ALL_SCHEDULES.filter(s => s.id !== id);
      renderSchedules();
      renderDashboardActiveExamsTable();
      mySessionStorage.removeItem('tokens_generated_session');
      showNotification("OK", "Dihapus", "success");
    } catch (e) { console.error('triggerDeleteSchedule failed', e); showNotification("Gagal", e.message || "Gagal menghapus jadwal.", "danger"); } finally { toggleLoader(false); }
  });
}

window.triggerEditSchedule = function (id) {
  if (!firebaseUser) return;
  const sch = ALL_SCHEDULES.find(s => s.id === id);
  if (!sch) return;

  const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : (v) => String(v ?? '');
  const allClasses = [...new Set(ALL_STUDENTS.map(s => s.kelas))].sort(sortClassStrings);
  const classesX = allClasses.filter(k => /^X(?!I)/i.test(k));
  const classesXI = allClasses.filter(k => /^XI(?!I)/i.test(k));
  const classesXII = allClasses.filter(k => /^XII/i.test(k));

  const renderClassList = (classes, name) => classes.length
    ? `<div class="schedule-class-grid">${classes.map(c => {
        const selected = Array.isArray(sch.kelas_terpilih) ? sch.kelas_terpilih : [];
        const checked = selected.includes(c) ? 'checked' : '';
        return `<label class="schedule-class-label"><input type="checkbox" name="sc-edit" value="${esc(c)}" ${checked} class="rounded text-primary"> <span>${esc(c)}</span></label>`;
      }).join('')}</div>`
    : `<p class="text-xs text-slate-500 dark:text-slate-400">Tidak ada kelas ${esc(name)}</p>`;

  const tnChecked = sch.tampil_nilai ? 'checked' : '';
  const mulaiVal = typeof formatDatetimeLocalValue === 'function' ? formatDatetimeLocalValue(sch.mulai) : (sch.mulai || '');
  const selesaiVal = typeof getScheduleSelesaiForForm === 'function' ? getScheduleSelesaiForForm(sch) : '';
  showConfirmation("Edit Jadwal", `
    <div class="space-y-3 text-base text-left text-slate-800 dark:text-slate-100">
      <input id="s-m-edit" value="${esc(sch.mapel || '')}" placeholder="Mata Pelajaran" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50 text-base">
      <select id="s-p-edit" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50 text-base">
        ${ALL_PACKETS.map(p => `<option value="${esc(p.id_paket)}" ${p.id_paket === sch.id_paket ? 'selected' : ''}>${esc(p.nama_paket ?? '')}</option>`).join('')}
      </select>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label class="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Waktu Mulai</label>
          <input type="datetime-local" id="s-dt-edit" value="${esc(mulaiVal)}" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50 text-base">
        </div>
        <div>
          <label class="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1">Waktu Selesai</label>
          <input type="datetime-local" id="s-dt-end-edit" value="${esc(selesaiVal)}" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50 text-base">
        </div>
      </div>
      <input type="number" id="s-d-edit" value="${esc(sch.durasi || 60)}" placeholder="Durasi (Menit, referensi)" class="w-full p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-800 dark:text-slate-100 bg-white dark:bg-slate-900 outline-none focus:ring-2 focus:ring-primary/50 text-base">
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 p-2.5 border border-slate-200 dark:border-slate-800 rounded-xl bg-slate-50 dark:bg-slate-950">
        <div class="space-y-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-visible">
          <label class="flex items-center gap-2">
            <input type="checkbox" onchange="window.toggleGlobalClass('X', this.checked, 'sc-edit')" class="rounded text-primary">
            <span class="text-sm font-bold text-blue-500">Pilih Semua X</span>
          </label>
          <div class="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            ${renderClassList(classesX, 'X')}
          </div>
        </div>
        <div class="space-y-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-visible">
          <label class="flex items-center gap-2">
            <input type="checkbox" onchange="window.toggleGlobalClass('XI', this.checked, 'sc-edit')" class="rounded text-primary">
            <span class="text-sm font-bold text-blue-500">Pilih Semua XI</span>
          </label>
          <div class="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            ${renderClassList(classesXI, 'XI')}
          </div>
        </div>
        <div class="space-y-3 p-3 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-visible">
          <label class="flex items-center gap-2">
            <input type="checkbox" onchange="window.toggleGlobalClass('XII', this.checked, 'sc-edit')" class="rounded text-primary">
            <span class="text-sm font-bold text-blue-500">Pilih Semua XII</span>
          </label>
          <div class="space-y-2 text-sm text-slate-700 dark:text-slate-200">
            ${renderClassList(classesXII, 'XII')}
          </div>
        </div>
      </div>
      <label class="flex items-center gap-3 mt-4 text-base font-bold text-slate-800 dark:text-slate-100">
        <input type="checkbox" id="s-tn-edit" ${tnChecked} class="rounded text-primary">
        <span>Tampilkan Nilai ke Siswa</span>
      </label>
    </div>
  `, async () => {
    const m = document.getElementById('s-m-edit').value.trim();
    const p = document.getElementById('s-p-edit').value;
    const dt = document.getElementById('s-dt-edit').value;
    const dtEnd = document.getElementById('s-dt-end-edit').value;
    const dr = parseInt(document.getElementById('s-d-edit').value, 10);
    const cl = Array.from(document.querySelectorAll('input[name="sc-edit"]:checked')).map(cb => cb.value);
    const tn = document.getElementById('s-tn-edit').checked;

    if (!m || !p || !dt || !dtEnd || !cl.length) {
      showNotification("Input Gagal", "Mapel, paket, waktu mulai, waktu selesai, dan kelas wajib diisi!", "danger");
      return;
    }

    toggleLoader(true, "Mengupdate Jadwal...");
    try {
      const times = typeof resolveScheduleEndDatetime === 'function'
        ? resolveScheduleEndDatetime(dt, dtEnd, dr)
        : { mulai: dt, selesai: dtEnd, durasi: dr };
      const updatedSch = {
        ...sch,
        mapel: m,
        id_paket: p,
        mulai: times.mulai,
        selesai: times.selesai,
        durasi: times.durasi,
        kelas_terpilih: cl,
        tampil_nilai: tn
      };
      await setDoc(getPublicDoc("Jadwal Ujian", id), updatedSch);
      const idx = ALL_SCHEDULES.findIndex(s => s.id === id);
      if (idx >= 0) ALL_SCHEDULES[idx] = updatedSch;
      renderSchedules();
      renderDashboardActiveExamsTable();
      mySessionStorage.removeItem('tokens_generated_session');
      showNotification("Sukses", "Jadwal berhasil diperbarui!", "success");
    } catch (e) {
      showNotification("Gagal", e.message, "danger");
    } finally {
      toggleLoader(false);
    }
  });
};

window.triggerDeletePacket = function (id) { if (!firebaseUser) return; showConfirmation("Hapus", "Hapus paket?", async () => { toggleLoader(true); try { await deleteDoc(getPublicDoc("Bank Soal", id)); if (typeof deletePacketFromStorage === 'function') deletePacketFromStorage(id).catch(() => {}); ALL_PACKETS = ALL_PACKETS.filter(p => p.id_paket !== id); renderPacketsCards(); showNotification("OK", "Dihapus", "success"); } catch (e) { console.error('triggerDeletePacket failed', e); showNotification("Gagal", e.message || "Gagal menghapus paket.", "danger"); } finally { toggleLoader(false); } }); }
window.triggerResetIndividu = function (sid) {
  if (!firebaseUser) return;
  const session = ACTIVE_MONITOR_DATA.find(s => s.id === sid);
  const student = ALL_STUDENTS.find(s => s.nis === session?.nis);
  const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : (v) => String(v ?? '');
  const studentName = esc(formatStudentNameForDisplay(student?.nama || session?.nis || 'Siswa'));
  showConfirmation("Reset Ujian", `Logout siswa <strong>${studentName}</strong> dari perangkat aktif? Jawaban, nomor soal terakhir, dan sisa waktu ujian tetap tersimpan. Siswa dapat login kembali untuk melanjutkan dari titik terakhir.`, async () => {
    toggleLoader(true, "Menunggu sinkron jawaban siswa...");
    try {
      let beforeKirimMs = 0;
      try {
        const { data: beforeRow } = await supabaseClient
          .from('Jawaban Siswa')
          .select('waktu_kirim')
          .eq('id', sid)
          .maybeSingle();
        if (beforeRow?.waktu_kirim) beforeKirimMs = new Date(beforeRow.waktu_kirim).getTime() || 0;
      } catch (_) { }

      // UPDATE dulu agar Realtime langsung memicu logout + flush di perangkat siswa
      const resetPayload = {
        force_reset: true,
        force_reset_reason: 'proktor',
        force_reset_at: new Date().toISOString()
      };
      if (typeof updateDoc === 'function') {
        await updateDoc(getPublicDoc('Session Ujian', sid), resetPayload);
      } else {
        await setDoc(getPublicDoc('Session Ujian', sid), resetPayload, { merge: true });
      }

      // Tunggu flush siswa (waktu_kirim naik), max ~6 dtk, baru hapus sesi
      const flushDeadline = Date.now() + 6000;
      while (Date.now() < flushDeadline) {
        await new Promise((resolve) => setTimeout(resolve, 400));
        try {
          const { data: row } = await supabaseClient
            .from('Jawaban Siswa')
            .select('waktu_kirim')
            .eq('id', sid)
            .maybeSingle();
          const t = row?.waktu_kirim ? (new Date(row.waktu_kirim).getTime() || 0) : 0;
          if (t > beforeKirimMs) break;
        } catch (_) { }
      }

      try { await deleteDoc(getPublicDoc('Session Ujian', sid)); } catch (_) { }
      ACTIVE_MONITOR_DATA = ACTIVE_MONITOR_DATA.filter(s => s.id !== sid);
      renderActiveMonitorList();
      showNotification("OK", "Siswa akan logout otomatis dari perangkat.", "success");
    } catch (e) { console.error('triggerResetIndividu failed', e); showNotification("Gagal", e.message || "Gagal mereset sesi.", "danger"); } finally { toggleLoader(false); }
  });
}

window.triggerFinishIndividu = function (sid) {
  if (!firebaseUser) return;
  const session = ACTIVE_MONITOR_DATA.find(s => s.id === sid);
  const student = ALL_STUDENTS.find(s => s.nis === session?.nis);
  const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : (v) => String(v ?? '');
  const studentName = esc(formatStudentNameForDisplay(student?.nama || session?.nis || 'Siswa'));

  showConfirmation(
    "Akhiri Ujian",
    `Akhiri sesi ujian siswa <strong>${studentName}</strong> sekarang? Sistem akan menyimpan nilai otomatis ke database dan mengakhiri sesi perangkat.`,
    async () => {
      toggleLoader(true, "Menunggu sinkron jawaban siswa...");
      try {
        // Ambil baseline waktu_kirim sebelum sinyal (untuk deteksi flush)
        let beforeKirimMs = 0;
        try {
          const { data: beforeRow } = await supabaseClient
            .from('Jawaban Siswa')
            .select('waktu_kirim,status')
            .eq('id', sid)
            .maybeSingle();
          if (beforeRow?.waktu_kirim) beforeKirimMs = new Date(beforeRow.waktu_kirim).getTime() || 0;
        } catch (_) { }

        // 1) Sinyal Realtime dulu → siswa flush jawaban
        try {
          if (typeof updateDoc === 'function') {
            await updateDoc(getPublicDoc('Session Ujian', sid), {
              force_finished: true,
              force_finished_by: CURRENT_USER?.username || 'proktor'
            });
          }
        } catch (_) { }

        // 2) Tunggu sampai waktu_kirim naik (flush), max ~10 dtk
        const flushDeadline = Date.now() + 10000;
        let flushed = false;
        while (Date.now() < flushDeadline) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          try {
            const { data: row } = await supabaseClient
              .from('Jawaban Siswa')
              .select('waktu_kirim,status')
              .eq('id', sid)
              .maybeSingle();
            if (row?.status && String(row.status).toLowerCase() === 'selesai') {
              flushed = true;
              break;
            }
            const t = row?.waktu_kirim ? (new Date(row.waktu_kirim).getTime() || 0) : 0;
            if (t > beforeKirimMs) {
              flushed = true;
              break;
            }
          } catch (_) { }
        }
        if (!flushed) {
          // Offline / lambat: tetap nilai dari data cloud terbaik yang ada
          await new Promise((resolve) => setTimeout(resolve, 500));
        }

        // 3) Hitung nilai setelah flush (atau timeout best-effort)
        toggleLoader(true, "Menyimpan nilai & mengakhiri sesi...");
        const { data, error } = await supabaseClient.rpc('cbt_compute_and_finish_exam', {
          p_session_id: sid,
          p_delete_session: false
        });

        if (error) throw error;
        if (data?.error) throw new Error(data.error);

        const { nilai, jumlah_benar, jumlah_salah, total_soal } = data;
        const resolvedSalah = Number.isFinite(Number(jumlah_salah))
          ? Number(jumlah_salah)
          : Math.max((Number(total_soal) || 0) - (Number(jumlah_benar) || 0), 0);

        const schedule = ALL_SCHEDULES.find(s => sid && String(sid).startsWith(String(s.id) + '_'));
        const payload = {
          id: sid,
          nis: session?.nis || student?.nis || '',
          nama: student?.nama || '',
          kelas: student?.kelas || '',
          mapel: schedule?.mapel || '',
          status: 'Selesai',
          nilai,
          jumlah_benar,
          jumlah_salah: resolvedSalah,
          penjelasan: 'Proktor',
          waktu_kirim: new Date().toISOString()
        };
        const ridx = ALL_RESULTS.findIndex(r => r.id === sid);
        if (ridx >= 0) ALL_RESULTS[ridx] = { ...ALL_RESULTS[ridx], ...payload };
        else ALL_RESULTS.unshift(payload);
        ACTIVE_MONITOR_DATA = ACTIVE_MONITOR_DATA.filter(s => s.id !== sid);

        renderActiveMonitorList();
        if (typeof window.renderResultsCards === 'function') window.renderResultsCards();
        else if (typeof renderResultsCards === 'function') renderResultsCards();
        if (typeof refreshCachedDashboardStats === 'function') refreshCachedDashboardStats(true);
        showNotification("Sukses", `Ujian diakhiri. Nilai tersimpan: ${nilai}`, "success");
      } catch (e) {
        console.error('triggerFinishIndividu failed', e);
        showNotification("Gagal", e.message || "Gagal mengakhiri ujian.", "danger");
      } finally {
        toggleLoader(false);
      }
    },
    'check-circle-2'
  );
};

async function dismissMonitorAlert(sessionId) {
  const payload = buildMonitorAlertDismissPayload();
  if (typeof updateDoc === 'function') {
    await updateDoc(getPublicDoc('Session Ujian', sessionId), payload);
  } else {
    await setDoc(getPublicDoc('Session Ujian', sessionId), payload, { merge: true });
  }
  const idx = ACTIVE_MONITOR_DATA.findIndex(s => s.id === sessionId);
  if (idx >= 0) {
    ACTIVE_MONITOR_DATA[idx] = { ...ACTIVE_MONITOR_DATA[idx], ...payload };
  }
  renderActiveMonitorList();
}

window.triggerMonitorChat = function (sessionId) {
  if (!firebaseUser) return;
  const session = ACTIVE_MONITOR_DATA.find(s => s.id === sessionId);
  const student = ALL_STUDENTS.find(s => s.nis === session?.nis);
  const esc = typeof escapeHtmlAttr === 'function' ? escapeHtmlAttr : (v) => String(v ?? '');
  const studentName = esc(formatStudentNameForDisplay(student?.nama || session?.nis || 'Siswa'));

  if (isSessionAdminAlertActive(session)) {
    showConfirmation(
      'Tutup Pesan Siswa',
      `<p class="text-left text-sm leading-relaxed">Pesan ke <strong>${studentName}</strong> masih ditampilkan fullscreen di perangkat siswa. Tutup modal pada layar siswa?</p>`,
      async () => {
        toggleLoader(true, 'Menutup pesan...');
        try {
          await dismissMonitorAlert(sessionId);
          showToast('Pesan pada layar siswa telah ditutup.', 'success', 4000);
        } catch (e) {
          showNotification('Gagal', e.message || 'Gagal menutup pesan.', 'danger');
        } finally {
          toggleLoader(false);
        }
      },
      'message-circle'
    );
    return;
  }

  showConfirmation(
    'Kirim Pesan ke Siswa',
    `<div class="text-left space-y-3">
      <p class="text-xs font-semibold leading-relaxed">Pesan akan memblokir layar ujian siswa <strong>${studentName}</strong> secara fullscreen. Siswa tidak dapat menutup modal ini.</p>
      <textarea id="monitor-chat-message" rows="5" maxlength="500" placeholder="Tulis pesan untuk siswa..." class="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50"></textarea>
    </div>`,
    async () => {
      const msg = document.getElementById('monitor-chat-message')?.value?.trim();
      if (!msg) {
        showNotification('Pesan Kosong', 'Tulis pesan terlebih dahulu.', 'danger');
        return;
      }
      toggleLoader(true, 'Mengirim pesan...');
      try {
        const payload = buildMonitorAlertPayload(msg, CURRENT_USER?.username || 'admin');
        if (typeof updateDoc === 'function') {
          await updateDoc(getPublicDoc('Session Ujian', sessionId), payload);
        } else {
          await setDoc(getPublicDoc('Session Ujian', sessionId), payload, { merge: true });
        }
        const idx = ACTIVE_MONITOR_DATA.findIndex(s => s.id === sessionId);
        if (idx >= 0) ACTIVE_MONITOR_DATA[idx] = { ...ACTIVE_MONITOR_DATA[idx], ...payload };
        renderActiveMonitorList();
        showToast('Pesan ditampilkan di layar siswa.', 'success', 4000);
      } catch (e) {
        showNotification('Gagal', e.message || 'Gagal mengirim pesan.', 'danger');
      } finally {
        toggleLoader(false);
      }
    },
    'message-circle',
    null,
    'Kirim Pesan'
  );
};

window.triggerGlobalMonitorChat = function () {
  if (!firebaseUser) return;
  const sessions = ACTIVE_MONITOR_DATA.filter((session) => session && session.id);
  if (!sessions.length) {
    showNotification('Tidak Ada Siswa', 'Tidak ada siswa aktif yang sedang ujian.', 'info');
    return;
  }

  const activeSessions = sessions.filter(isSessionAdminAlertActive);
  if (activeSessions.length) {
    showConfirmation(
      'Tutup Pesan Semua Siswa',
      `<p class="text-left text-sm leading-relaxed">Modal pesan masih aktif di <strong>${activeSessions.length}</strong> perangkat siswa. Tutup pesan di semua layar siswa?</p>`,
      async () => {
        toggleLoader(true, 'Menutup pesan semua siswa...');
        try {
          await dismissMonitorAlertsForSessions(activeSessions);
          const dismissPayload = buildMonitorAlertDismissPayload();
          ACTIVE_MONITOR_DATA = ACTIVE_MONITOR_DATA.map((session) => (
            activeSessions.some((active) => active.id === session.id)
              ? { ...session, ...dismissPayload }
              : session
          ));
          renderActiveMonitorList();
          showToast('Pesan pada semua layar siswa telah ditutup.', 'success', 4000);
        } catch (e) {
          showNotification('Gagal', e.message || 'Gagal menutup pesan semua siswa.', 'danger');
        } finally {
          toggleLoader(false);
        }
      },
      'messages-square'
    );
    return;
  }

  showConfirmation(
    'Kirim Pesan ke Semua Siswa',
    `<div class="text-left space-y-3">
      <p class="text-xs font-semibold leading-relaxed">Pesan akan ditampilkan fullscreen di <strong>${sessions.length}</strong> perangkat siswa aktif secara bersamaan (Realtime). Siswa tidak dapat menutup modal ini.</p>
      <textarea id="global-monitor-chat-message" rows="5" maxlength="500" placeholder="Tulis pesan untuk semua siswa..." class="w-full p-3 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-800 dark:text-slate-100 bg-white/90 dark:bg-slate-950/90 outline-none focus:ring-2 focus:ring-primary/50"></textarea>
    </div>`,
    async () => {
      const msg = document.getElementById('global-monitor-chat-message')?.value?.trim();
      if (!msg) {
        showNotification('Pesan Kosong', 'Tulis pesan terlebih dahulu.', 'danger');
        return;
      }
      toggleLoader(true, 'Mengirim pesan Realtime ke semua siswa...');
      try {
        const targets = sessions.filter((s) => s && s.id && !s.force_finished && !s.force_reset);
        const payload = await broadcastMonitorAlertToSessions(targets, msg, CURRENT_USER?.username || 'admin');
        if (!payload) throw new Error('Tidak ada sesi aktif untuk dikirim pesan.');
        ACTIVE_MONITOR_DATA = ACTIVE_MONITOR_DATA.map((session) => (
          targets.some((target) => target.id === session.id)
            ? { ...session, ...payload }
            : session
        ));
        renderActiveMonitorList();
        if (typeof updateGlobalMonitorChatButton === 'function') updateGlobalMonitorChatButton();
        showToast(`Pesan ditampilkan di ${targets.length} perangkat siswa.`, 'success', 4000);
      } catch (e) {
        showNotification('Gagal', e.message || 'Gagal mengirim pesan ke semua siswa.', 'danger');
      } finally {
        toggleLoader(false);
      }
    },
    'messages-square',
    null,
    'Kirim Pesan'
  );
};
window.triggerResetAnswer = function (nis, mapel) {
  if (!firebaseUser) return;
  const mr = ALL_RESULTS.find(r => r.nis === nis && r.mapel === mapel);
  if (!mr) return;
  showConfirmation("Reset", `Hapus hasil ${mapel}?`, async () => {
    toggleLoader(true);
    try {
      await deleteDoc(getPublicDoc("Jawaban Siswa", mr.id));
      ALL_RESULTS = ALL_RESULTS.filter(r => r.id !== mr.id);
      if (typeof window.renderResultsCards === 'function') window.renderResultsCards();
      else if (typeof renderResultsCards === 'function') renderResultsCards();
      refreshCachedDashboardStats(true);
      showNotification("OK", "Dihapus", "success");
    } catch (e) {
      showNotification("Err", e.message, "danger");
    } finally {
      toggleLoader(false);
    }
  });
};
