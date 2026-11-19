// All swings live in IndexedDB on the phone. Nothing is uploaded.
const DB = 'swing-coach', STORE = 'swings';
let dbp;
function open() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: 'id' });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx(mode, fn) {
  const db = await open();
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode), s = t.objectStore(STORE);
    const req = fn(s);
    t.oncomplete = () => res(req?.result);
    t.onerror = () => rej(t.error);
  });
}
export const saveSwing = s => tx('readwrite', st => st.put(s));
export const getSwing = id => tx('readonly', st => st.get(id));
export const deleteSwing = id => tx('readwrite', st => st.delete(id));
export async function listSwings() {
  const all = await tx('readonly', st => st.getAll());
  return (all || []).sort((a, b) => b.date - a.date);
}
// ask iOS not to evict our storage
navigator.storage?.persist?.();
