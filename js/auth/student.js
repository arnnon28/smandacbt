function ensureStudentKelasAllowed(schedule, kelas) {
  const classes = schedule?.kelas_terpilih;
  if (!Array.isArray(classes)) {
    throw new Error('Jadwal ujian tidak valid (data kelas rusak).');
  }
  if (!classes.length) {
    throw new Error('Jadwal ujian belum memiliki kelas peserta.');
  }
  if (!classes.includes(kelas)) {
    throw new Error('Kelas tidak terdaftar di sesi ini.');
  }
}

async function prepareServerTimeAndValidateExamWindow(schedule) {
  await syncServerTimeOffset(true);
  validateExamWindow(schedule);
}

function buildAuthLoginStatus(status, title, message, extra = {}) {
  const variantByStatus = {
    ready: 'info',
    not_started: 'info',
    ended: 'gray',
    completed: 'warning',
    active_session: 'warning',
    frozen_session: 'warning',
    empty_packet: 'warning',
    no_classes: 'warning',
    class_not_allowed: 'warning'
  };
  return {
    ok: status === 'ready',
    status,
    title,
    message,
    variant: extra.variant || variantByStatus[status] || 'error',
    ...extra
  };
}

async function verifyStudentLoginCredentials({ nis, password, token }) {
  const trimmedNis = String(nis || '').trim();
  const trimmedToken = String(token || '').trim().toUpperCase();
  const pass = String(password || '');

  if (!trimmedNis || !pass || !trimmedToken) {
    return buildAuthLoginStatus(
      'missing_fields',
      'Data Belum Lengkap',
      'NIS, password, dan token harus diisi.'
    );
  }

  const mapRpcResult = (data) => {
    if (!data || typeof data !== 'object') {
      return buildAuthLoginStatus('network_error', 'Verifikasi Gagal', 'Respons server tidak valid.');
    }
    if (data.server_now) applyServerTimeFromIso(data.server_now);

    if (!data.ok) {
      return buildAuthLoginStatus(
        data.status || 'network_error',
        data.title || 'Verifikasi Gagal',
        data.message || 'Gagal memverifikasi data.',
        { variant: data.variant }
      );
    }

    const sch = data.schedule;
    const st = data.student;
    const resumeProgress = data.resume_progress
      ? extractExamProgressFields(data.resume_progress)
      : null;

    return {
      ok: true,
      status: 'ready',
      variant: data.variant || 'info',
      title: data.title || 'Ujian Sedang Berlangsung',
      message: data.message || '',
      schedule: sch,
      scheduleId: data.schedule_id || sch?.id,
      student: st,
      totalSoal: Number(data.total_soal) || 0,
      token: data.token || trimmedToken,
      isResume: Boolean(data.is_resume) || Boolean(resumeProgress),
      resumeProgress
    };
  };

  try {
    const doVerify = async () => {
      const runOnce = async () => {
        const { data, error } = await supabaseClient.rpc('cbt_verify_and_start_session', {
          p_nis: trimmedNis,
          p_password: pass,
          p_token: trimmedToken
        });
        if (error) throw error;
        return mapRpcResult(data);
      };
      if (typeof retryWithBackoff === 'function') {
        return await retryWithBackoff(runOnce, {
          maxAttempts: 3,
          baseMs: 600,
          maxMs: 5000,
          shouldRetry: (err) => {
            const msg = String(err?.message || err || '').toLowerCase();
            return msg.includes('network') || msg.includes('fetch') || msg.includes('timeout')
              || msg.includes('503') || msg.includes('429') || msg.includes('502');
          }
        });
      }
      return await runOnce();
    };
    if (typeof rateLimited === 'function') {
      return await rateLimited(doVerify);
    }
    return await doVerify();
  } catch (err) {
    return buildAuthLoginStatus(
      'network_error',
      'Verifikasi Gagal',
      err.message || 'Gagal menghubungi server. Periksa koneksi internet.'
    );
  }
}

var AUTH_LOGIN_STATUS_VARIANTS = {
  error: { lucide: 'alert-triangle' },
  warning: { lucide: 'badge-check' },
  info: { lucide: 'clock' },
  gray: { lucide: 'calendar-x' }
};

function showAuthLoginStatus(payload) {
  const panel = document.getElementById('auth-login-status');
  const titleEl = document.getElementById('auth-status-title');
  const messageEl = document.getElementById('auth-status-message');
  const iconEl = document.getElementById('auth-status-icon');
  if (!panel || !titleEl || !messageEl) return;

  if (!payload) {
    panel.classList.add('hidden');
    return;
  }

  const variantKey = AUTH_LOGIN_STATUS_VARIANTS[payload.variant] ? payload.variant : 'error';
  const variant = AUTH_LOGIN_STATUS_VARIANTS[variantKey];

  panel.className = `auth-login-status-panel auth-login-status--${variantKey}`;
  titleEl.className = `auth-login-status-title auth-login-status-title--${variantKey}`;
  messageEl.className = `auth-login-status-message auth-login-status-message--${variantKey}`;
  titleEl.textContent = payload.title || 'Informasi';
  messageEl.textContent = payload.message || '';

  if (iconEl) {
    iconEl.setAttribute('data-lucide', payload.lucideIcon || variant.lucide);
    iconEl.className = `auth-login-status-icon auth-login-status-icon--${variantKey}`;
    if (window.lucide?.createIcons) window.lucide.createIcons();
  }

  panel.classList.remove('hidden');
}

function hideAuthLoginStatus() {
  const panel = document.getElementById('auth-login-status');
  if (panel) panel.classList.add('hidden');
}

var APP_SETTINGS_ELEMENT_IDS = {
  headerLogo: 'header-school-logo',
  headerName: 'header-school-name',
  headerExam: 'header-exam-title',
  footerText: 'footer-copyright-text',
  inputName: 'input-school-name',
  inputExam: 'input-exam-title',
  inputLogo: 'input-school-logo',
  authLogo: 'school-logo-auth'
};

var appSettingsElements = {};

function initAppSettingsElements(customIds = {}) {
  const ids = { ...APP_SETTINGS_ELEMENT_IDS, ...customIds };
  appSettingsElements.headerLogo = document.getElementById(ids.headerLogo);
  appSettingsElements.headerName = document.getElementById(ids.headerName);
  appSettingsElements.headerExam = document.getElementById(ids.headerExam);
  appSettingsElements.footerText = document.getElementById(ids.footerText);
  appSettingsElements.bannerName = document.querySelectorAll('.school-name-text');
  appSettingsElements.inputName = document.getElementById(ids.inputName);
  appSettingsElements.inputExam = document.getElementById(ids.inputExam);
  appSettingsElements.inputLogo = document.getElementById(ids.inputLogo);
  appSettingsElements.authLogo = document.getElementById(ids.authLogo);
}

function renderAppSettingsUI() {
  const settings = readAppSettingsFromLocal();
  const logoSrc = resolveSchoolLogoUrl(settings.schoolLogo);
  const { headerName, headerExam, headerLogo, footerText, bannerName, inputName, inputExam, inputLogo, authLogo } = appSettingsElements;

  if (headerName) headerName.textContent = settings.schoolName;
  if (headerExam) headerExam.textContent = settings.examTitle;
  if (headerLogo) headerLogo.src = logoSrc;
  if (authLogo) authLogo.src = logoSrc;
  if (bannerName) bannerName.forEach((el) => { el.textContent = settings.schoolName.toUpperCase(); });
  if (inputName) inputName.value = settings.schoolName;
  if (inputExam) inputExam.value = settings.examTitle;
  if (footerText) footerText.textContent = settings.footerText;

  const favicon = document.querySelector('link[rel="icon"]');
  if (favicon) favicon.href = logoSrc;

  if (inputLogo) {
    if (isLogoAssetRef(settings.schoolLogo)) {
      inputLogo.value = settings.schoolLogo;
    } else if (settings.schoolLogo.startsWith('data:') || settings.schoolLogo === DEFAULT_APP_SETTINGS.schoolLogo) {
      inputLogo.value = '';
    } else {
      inputLogo.value = settings.schoolLogo;
    }
  }
  if (typeof fitAdminHeaderText === 'function') fitAdminHeaderText();
}

async function processLocalLogoUpload(event) {
  const file = event?.target?.files?.[0];
  if (!file) return;
  toggleLoader(true, 'Mengunggah logo...');
  try {
    const logoId = await uploadSchoolLogoFromFile(file);
    const inputLogo = appSettingsElements.inputLogo || document.getElementById('input-school-logo');
    if (inputLogo) inputLogo.value = logoId;
    renderAppSettingsUI();
    showNotification('Logo berhasil diunggah', `Kode logo: ${logoId} (tersimpan di database).`, 'success');
  } catch (err) {
    showNotification('Gagal', err.message || 'Gagal mengunggah logo.', 'danger');
  } finally {
    toggleLoader(false);
    if (event?.target) event.target.value = '';
  }
}

async function commitAppSettingsFromForm(options = {}) {
  const inputName = appSettingsElements.inputName || document.getElementById('input-school-name');
  const inputExam = appSettingsElements.inputExam || document.getElementById('input-exam-title');
  const inputLogo = appSettingsElements.inputLogo || document.getElementById('input-school-logo');

  const targetName = inputName?.value?.trim() || DEFAULT_APP_SETTINGS.schoolName;
  const targetExam = inputExam?.value?.trim() || DEFAULT_APP_SETTINGS.examTitle;
  let targetLogo = inputLogo?.value?.trim() || '';
  if (!targetLogo) {
    targetLogo = readAppSettingsFromLocal().schoolLogo || DEFAULT_APP_SETTINGS.schoolLogo;
  }
  if (isLogoAssetRef(targetLogo)) {
    targetLogo = targetLogo.slice(0, LOGO_ASSET_ID_LENGTH);
  }
  const current = readAppSettingsFromLocal();
  const payload = {
    schoolName: targetName,
    examTitle: targetExam,
    schoolLogo: targetLogo,
    footerText: current.footerText || DEFAULT_APP_SETTINGS.footerText
  };

  toggleLoader(true, 'Menyimpan pengaturan...');
  try {
    await saveAppSettingsToCloud(payload);
    appSettingsToLocalKeys(payload);
    window.tempUploadedLogo = null;
    renderAppSettingsUI();
    showNotification('Berhasil', 'Pengaturan berhasil disimpan ke server.', 'success');
    if (typeof options.onSaved === 'function') options.onSaved(payload);
  } catch (err) {
    showNotification('Gagal', err.message || 'Gagal menyimpan pengaturan.', 'danger');
  } finally {
    toggleLoader(false);
  }
}

async function resetAppSettingsToDefault() {
  showConfirmation('Reset Pengaturan', 'Apakah Anda yakin ingin mengembalikan semua konfigurasi aplikasi ke pengaturan awal/default?', async () => {
    toggleLoader(true, 'Mereset pengaturan...');
    try {
      await saveAppSettingsToCloud(DEFAULT_APP_SETTINGS);
      appSettingsToLocalKeys(DEFAULT_APP_SETTINGS);
      window.tempUploadedLogo = null;
      const logoFileInput = document.getElementById('input-logo-file');
      if (logoFileInput) logoFileInput.value = '';
      renderAppSettingsUI();
      showNotification('Berhasil', 'Pengaturan telah dikembalikan ke default.', 'success');
    } catch (err) {
      showNotification('Gagal', err.message || 'Gagal mereset pengaturan.', 'danger');
    } finally {
      toggleLoader(false);
    }
  }, 'refresh-cw');
}

async function refreshAppSettingsFromCloud() {
  try {
    const cloud = await loadAppSettingsFromCloud();
    if (cloud) appSettingsToLocalKeys(cloud);
  } catch (e) {
    console.warn('refreshAppSettingsFromCloud failed', e);
  }
  renderAppSettingsUI();
  applyTheme();
}

var debouncedRefreshAppSettingsFromCloud = debounce(refreshAppSettingsFromCloud, 2500);
