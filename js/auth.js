import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";

const getSafeStorage = (storageType) => {
  const config = window.__ARCBT_CONFIG__ || {};
  if (!config.supabaseUrl || !config.appId) {
    console.warn('[ARCBT-CONFIG] Database config belum dimuat. Pastikan js/config.js dimuat sebelum auth.js.');
  }

  try {
    const storage = window[storageType];
    const testKey = '__google_sites_test__';
    storage.setItem(testKey, testKey);
    storage.removeItem(testKey);
    return storage;
  } catch (e) {
    console.warn(`[ARCBT-SECURITY] ${storageType} diblokir. Menggunakan memori sementara.`);
    const memoryStore = {};
    return {
      getItem: (key) => memoryStore[key] || null,
      setItem: (key, val) => { memoryStore[key] = String(val); },
      removeItem: (key) => { delete memoryStore[key]; },
      clear: () => { for (let k in memoryStore) delete memoryStore[k]; }
    };
  }
};

export const myLocalStorage = getSafeStorage('localStorage');
export const mySessionStorage = getSafeStorage('sessionStorage');

const { supabaseUrl, supabaseKey, appId: configAppId } = window.__ARCBT_CONFIG__ || {};

export const supabaseClient = createClient(supabaseUrl, supabaseKey);
export const db = {};
export const appId = configAppId;

function getPrimaryKeyColumn(table) {
  if (table === 'Admin') return 'username';
  if (table === 'Siswa') return 'nis';
  if (table === 'Bank Soal') return 'id_paket';
  return 'id';
}

export function getPublicCollection(collectionName) {
  return { collectionName };
}

export function getPublicDoc(collectionName, docId) {
  if (!collectionName || !docId) {
    throw new Error(`Invalid document reference: collectionName="${collectionName}" docId="${docId}"`);
  }
  return { collectionName, docId };
}

export async function getDoc(ref) {
  const pk = getPrimaryKeyColumn(ref.collectionName);
  const { data, error } = await supabaseClient
    .from(ref.collectionName)
    .select('*')
    .eq(pk, ref.docId)
    .maybeSingle();
  if (error) {
    console.error("getDoc error:", error);
    throw error;
  }
  return {
    exists: () => data !== null,
    data: () => data
  };
}

export async function getDocs(collectionRef) {
  const { data, error } = await supabaseClient
    .from(collectionRef.collectionName)
    .select('*');
  if (error) {
    console.error("getDocs error:", error);
    throw error;
  }
  return {
    docs: data.map(row => ({
      id: row[getPrimaryKeyColumn(collectionRef.collectionName)],
      data: () => row
    }))
  };
}

export async function setDoc(ref, payload, options = {}) {
  const pk = getPrimaryKeyColumn(ref.collectionName);
  const dataToSave = { [pk]: ref.docId, ...payload };
  const { error } = await supabaseClient
    .from(ref.collectionName)
    .upsert(dataToSave);
  if (error) {
    console.error("setDoc error:", error);
    throw error;
  }
}

export async function deleteDoc(ref) {
  const pk = getPrimaryKeyColumn(ref.collectionName);
  const { error } = await supabaseClient
    .from(ref.collectionName)
    .delete()
    .eq(pk, ref.docId);
  if (error) {
    console.error("deleteDoc error:", error);
    throw error;
  }
}

export function writeBatch(db) {
  const sets = {};
  const deletes = {};
  return {
    set: (ref, payload) => {
      const table = ref.collectionName;
      const pk = getPrimaryKeyColumn(table);
      if (!sets[table]) sets[table] = [];
      sets[table].push({ [pk]: ref.docId, ...payload });
    },
    update: (ref, payload) => {
      const table = ref.collectionName;
      const pk = getPrimaryKeyColumn(table);
      if (!sets[table]) sets[table] = [];
      sets[table].push({ [pk]: ref.docId, ...payload });
    },
    delete: (ref) => {
      const table = ref.collectionName;
      if (!deletes[table]) deletes[table] = [];
      deletes[table].push(ref.docId);
    },
    commit: async () => {
      const promises = [];
      for (const [table, rows] of Object.entries(sets)) {
        if (rows.length === 0) continue;
        for (let i = 0; i < rows.length; i += 200) {
          const chunk = rows.slice(i, i + 200);
          promises.push(
            supabaseClient.from(table).upsert(chunk).then(({ error }) => {
              if (error) throw error;
            })
          );
        }
      }
      for (const [table, ids] of Object.entries(deletes)) {
        if (ids.length === 0) continue;
        const pk = getPrimaryKeyColumn(table);
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          promises.push(
            supabaseClient.from(table).delete().in(pk, chunk).then(({ error }) => {
              if (error) throw error;
            })
          );
        }
      }
      await Promise.all(promises);
    }
  };
}

export function onSnapshot(collectionRef, callback) {
  const tableName = collectionRef.collectionName;
  const pk = getPrimaryKeyColumn(tableName);
  let activeData = [];
  
  const loadData = async () => {
    try {
      const { data, error } = await supabaseClient.from(tableName).select('*');
      if (error) throw error;
      activeData = data;
      triggerCallback();
    } catch (e) {
      console.error("onSnapshot load error:", e);
    }
  };

  const triggerCallback = () => {
    callback({
      forEach: (fn) => {
        activeData.forEach(row => {
          fn({
            id: row[pk],
            data: () => row
          });
        });
      }
    });
  };

  const channel = supabaseClient
    .channel(`public:${tableName}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: tableName }, async (payload) => {
      await loadData();
    })
    .subscribe();

  loadData();

  return () => {
    supabaseClient.removeChannel(channel);
  };
}

export async function initAuth() {
  return { uid: "anonymous" };
}

export async function initAdminAccount() {
  // Akun admin bawaan dinonaktifkan demi keamanan
}
