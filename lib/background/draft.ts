export type BackgroundDraft = {
  version: 1;
  savedAt: number;
  source: File;
  replacement: File | null;
  settings: {
    color: string; mode: "person" | "chroma"; engine: "fast" | "modnet";
    fit: "cover" | "contain"; zoom: number; x: number; y: number;
    threshold: number; softness: number; edgeBlur: number;
    key: string; tolerance: number; includeAudio: boolean;
  };
};
const DB = "econtent-background-drafts";
const STORE = "drafts";
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? Error("Unable to open local draft storage"));
  });
}
async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDB();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = operation(tx.objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? Error("Local draft storage failed"));
      tx.onabort = () => reject(tx.error ?? Error("Local draft transaction aborted"));
    });
  } finally { db.close(); }
}
export function saveBackgroundDraft(draft: BackgroundDraft) {
  return transact("readwrite", store => store.put(draft, "current"));
}
export function loadBackgroundDraft() {
  return transact<BackgroundDraft | undefined>("readonly", store => store.get("current"));
}
export function deleteBackgroundDraft() {
  return transact("readwrite", store => store.delete("current"));
}
