var CBT_DATABASE_TABLES = Object.freeze([
  'Admin',
  'Siswa',
  'Bank Soal',
  'Jadwal Ujian',
  'Jawaban Siswa',
  'Session Ujian',
  'Pengaturan'
]);

var CBT_PROTECTED_TABLES = Object.freeze(['Admin', 'Pengaturan']);

function isProtectedDatabaseTable(tableName) {
  return CBT_PROTECTED_TABLES.includes(tableName)
    || tableName === 'Admin'
    || tableName === 'Pengaturan';
}

function getPurgeableDatabaseTables() {
  return CBT_DATABASE_TABLES.filter((name) => !isProtectedDatabaseTable(name));
}

async function purgeDatabaseExceptProtected() {
  const purged = [];
  for (const tableName of getPurgeableDatabaseTables()) {
    if (isProtectedDatabaseTable(tableName)) continue;
    const snap = await getDocs(getPublicCollection(tableName));
    let batch = writeBatch();
    let opCount = 0;
    let deleted = 0;
    for (const doc of snap.docs) {
      batch.delete(getPublicDoc(tableName, doc.id));
      opCount++;
      deleted++;
      if (opCount >= 450) {
        await batch.commit();
        batch = writeBatch();
        opCount = 0;
      }
    }
    if (opCount > 0) await batch.commit();
    purged.push({ tableName, deleted });
  }
  return purged;
}

function getBackupRowId(tableName, row) {
  if (!row || typeof row !== 'object') return null;
  if (tableName === 'Siswa') return row.nis;
  if (tableName === 'Bank Soal') return row.id_paket;
  if (tableName === 'Admin') return row.username;
  if (tableName === 'Pengaturan') return row.id || 'app';
  return row.id;
}

async function buildDatabaseBackupPayload() {
  const payload = {};
  for (const tableName of CBT_DATABASE_TABLES) {
    const snap = await getDocs(getPublicCollection(tableName));
    payload[tableName] = snap.docs.map((doc) => doc.data());
  }
  return payload;
}

async function restoreDatabaseBackup(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Format backup tidak valid.');
  }
  const summary = [];
  for (const tableName of CBT_DATABASE_TABLES) {
    const rows = payload[tableName];
    if (!Array.isArray(rows)) {
      summary.push(`${tableName}: 0 baris (tidak ada di backup)`);
      continue;
    }
    let batch = writeBatch();
    let opCount = 0;
    for (const row of rows) {
      const id = getBackupRowId(tableName, row);
      if (!id) continue;
      batch.set(getPublicDoc(tableName, String(id)), row);
      opCount++;
      if (opCount >= 450) {
        await batch.commit();
        batch = writeBatch();
        opCount = 0;
      }
    }
    if (opCount > 0) await batch.commit();
    summary.push(`${tableName}: ${rows.length} baris`);
  }
  return summary;
}

function startAppSettingsListener(onChange) {
  if (window.__appSettingsListenerBound) return;
  window.__appSettingsListenerBound = true;

  const poll = async () => {
    try {
      await loadAppSettingsFromCloud();
      if (typeof onChange === 'function') onChange();
      else refreshAppSettingsFromCloud();
    } catch (_) {}
  };

  poll();
  window.__appSettingsPollTimer = setInterval(poll, 600000);
}

function stopAppSettingsListener() {
  if (window.__appSettingsPollTimer) {
    clearInterval(window.__appSettingsPollTimer);
    window.__appSettingsPollTimer = null;
  }
  window.__appSettingsListenerBound = false;
}
