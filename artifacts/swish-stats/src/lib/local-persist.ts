// Durable storage for the local store.
//
// The store keeps its collections in memory as JSON strings (exactly how it
// used to read them from localStorage, so the game logic's semantics are
// unchanged) and mirrors every write into IndexedDB. Callers await flush()
// before telling the UI a change happened, so a tap the scorer has seen
// confirmed is already on disk if the app is killed a moment later.
//
// IndexedDB rather than localStorage: no ~5MB cap (a season of games on one
// tablet outgrows it) and writes don't block the main thread.

const DB_NAME = "swish-stats";
const DB_VERSION = 1;
const KV = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;
const dirty = new Map<string, string | null>(); // null = delete
let flushing: Promise<void> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(KV)) req.result.createObjectStore(KV);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error("IndexedDB open blocked by another tab"));
    });
  }
  return dbPromise;
}

/** Every stored key and its JSON string. */
export async function readAll(): Promise<Map<string, string>> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const out = new Map<string, string>();
    const tx = db.transaction(KV, "readonly");
    const req = tx.objectStore(KV).openCursor();
    req.onsuccess = () => {
      const cur = req.result;
      if (cur) {
        out.set(String(cur.key), cur.value as string);
        cur.continue();
      }
    };
    tx.oncomplete = () => resolve(out);
    tx.onerror = () => reject(tx.error);
  });
}

export function scheduleWrite(key: string, value: string | null): void {
  dirty.set(key, value);
}

/** Resolves once every write scheduled so far is committed to disk. */
export function flush(): Promise<void> {
  if (dirty.size === 0) return flushing ?? Promise.resolve();
  const run = async () => {
    // Wait out any in-flight flush so writes land in order.
    if (flushing) await flushing.catch(() => {});
    if (dirty.size === 0) return;
    const batch = new Map(dirty);
    dirty.clear();
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(KV, "readwrite");
      const os = tx.objectStore(KV);
      for (const [k, v] of batch) {
        if (v === null) os.delete(k);
        else os.put(v, k);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => {
        // Put the batch back (unless overwritten since) so the next flush retries it.
        for (const [k, v] of batch) if (!dirty.has(k)) dirty.set(k, v);
        reject(tx.error);
      };
      tx.onabort = tx.onerror;
    });
  };
  const p = run().finally(() => {
    if (flushing === p) flushing = null;
  });
  flushing = p;
  return p;
}

export async function clearAll(): Promise<void> {
  dirty.clear();
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(KV, "readwrite");
    tx.objectStore(KV).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Last-chance flush when the tab is hidden or closed (best effort — the
// awaited flush after each request is the real guarantee).
if (typeof window !== "undefined") {
  const bestEffort = () => { void flush().catch(() => {}); };
  window.addEventListener("pagehide", bestEffort);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") bestEffort();
  });
}
