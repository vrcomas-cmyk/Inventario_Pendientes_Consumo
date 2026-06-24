/* ===========================================================================
   persist.js · almacenamiento local (IndexedDB) para que el archivo subido
   quede guardado entre sesiones (sin servidor). Guarda los bytes del .xlsx
   (compactos) + las pestañas elegidas; al reabrir se reconstruye.
   =========================================================================== */
const DBN = 'degasa_portal', ST = 'kv';

function open() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DBN, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(ST)) r.result.createObjectStore(ST); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
export async function kvSet(k, v) {
  const d = await open();
  return new Promise((res, rej) => { const t = d.transaction(ST, 'readwrite'); t.objectStore(ST).put(v, k); t.oncomplete = () => res(true); t.onerror = () => rej(t.error); });
}
export async function kvGet(k) {
  const d = await open();
  return new Promise((res, rej) => { const t = d.transaction(ST, 'readonly'); const q = t.objectStore(ST).get(k); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
}
export async function kvDel(k) {
  const d = await open();
  return new Promise((res, rej) => { const t = d.transaction(ST, 'readwrite'); t.objectStore(ST).delete(k); t.oncomplete = () => res(true); t.onerror = () => rej(t.error); });
}
