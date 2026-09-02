import { DB_NAME, DB_VERSION, STORES } from "../core/constants.js";
let opening;
export function openOfflineDatabase() {
  if (opening) return opening;
  opening = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("La base hors connexion est bloquee par un autre onglet"));
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.RECORDS)) {
        const store = db.createObjectStore(STORES.RECORDS, { keyPath: "key" });
        store.createIndex("byEntity", "entity", { unique: false });
        store.createIndex("byUpdatedAt", "updatedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.OUTBOX)) {
        const store = db.createObjectStore(STORES.OUTBOX, { keyPath: "opId" });
        store.createIndex("byRecord", "recordKey", { unique: false });
        store.createIndex("byCreatedAt", "createdAt", { unique: false });
        store.createIndex("byRetryAt", "retryAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.CONFLICTS)) {
        const store = db.createObjectStore(STORES.CONFLICTS, { keyPath: "conflictId" });
        store.createIndex("byRecord", "recordKey", { unique: false });
        store.createIndex("byDetectedAt", "detectedAt", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.META)) db.createObjectStore(STORES.META, { keyPath: "key" });
    };
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(db); };
  }).catch(error => { opening = undefined; throw error; });
  return opening;
}
export async function transaction(storeNames, mode, action) {
  const db = await openOfflineDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode, { durability: mode === "readwrite" ? "relaxed" : "default" });
    const stores = Object.fromEntries(storeNames.map(name => [name, tx.objectStore(name)]));
    let result;
    try { result = action(stores, tx); } catch (error) { tx.abort(); reject(error); return; }
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("Transaction annulee"));
  });
}
export function requestResult(request) {
  return new Promise((resolve, reject) => { request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
export async function getMeta(key) {
  const db = await openOfflineDatabase();
  return requestResult(db.transaction(STORES.META, "readonly").objectStore(STORES.META).get(key)).then(row => row?.value);
}
export async function setMeta(key, value) { return transaction([STORES.META], "readwrite", stores => stores[STORES.META].put({ key, value })); }
