import { store, type SyncEntityKind, type SyncQueueItem } from "./local-store";

const REMOTE_URL = (import.meta.env.VITE_SYNC_REMOTE_URL as string | undefined)?.replace(/\/$/, "") ?? "";
export const SYNC_REMOTE_ENABLED = REMOTE_URL.length > 0;

const _originalFetch = window.fetch.bind(window);

export type SyncStatus = {
  online: boolean;
  remoteEnabled: boolean;
  syncing: boolean;
  pending: number;
  lastSyncAt: string | null;
  lastError: string | null;
};

let _syncing = false;
let _lastSyncAt: string | null = null;
let _lastError: string | null = null;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;

const listeners = new Set<() => void>();

// Cached snapshot for useSyncExternalStore. We MUST return the same object
// reference between calls when nothing has changed, otherwise React will
// detect a change on every render and re-invoke the subscription forever.
let _cachedStatus: SyncStatus = computeStatus();

function computeStatus(): SyncStatus {
  return {
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    remoteEnabled: SYNC_REMOTE_ENABLED,
    syncing: _syncing,
    pending: store.syncQueue.pendingCount(),
    lastSyncAt: _lastSyncAt,
    lastError: _lastError,
  };
}

function shallowEqual(a: SyncStatus, b: SyncStatus): boolean {
  return (
    a.online === b.online &&
    a.remoteEnabled === b.remoteEnabled &&
    a.syncing === b.syncing &&
    a.pending === b.pending &&
    a.lastSyncAt === b.lastSyncAt &&
    a.lastError === b.lastError
  );
}

export function getSyncStatus(): SyncStatus {
  return _cachedStatus;
}

function refreshSnapshot(): boolean {
  const next = computeStatus();
  if (shallowEqual(_cachedStatus, next)) return false;
  _cachedStatus = next;
  return true;
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify() {
  // Recompute the cached snapshot first; only fan out to listeners if something changed.
  if (!refreshSnapshot()) return;
  for (const l of listeners) {
    try { l(); } catch { /* ignore */ }
  }
}

// ---------- Path / body translation -----------

const ENTITY_FOR_PATH_SEGMENT: Record<string, SyncEntityKind> = {
  games: "game",
  teams: "team",
  players: "player",
  stats: "statEvent",
};

// Only true foreign-key fields belong here. Counters like ftSequenceIndex /
// ftSequenceTotal are NOT entity references and must be left untouched.
const BODY_ID_FIELDS: Array<{ field: string; kind: SyncEntityKind }> = [
  { field: "gameId", kind: "game" },
  { field: "teamId", kind: "team" },
  { field: "playerId", kind: "player" },
];

function translatePath(path: string): { path: string; ok: boolean; missing?: string } {
  // /api/segment/:id/...   -> walk and translate every (segment, id) pair we know
  const [rawPath, query] = path.split("?");
  const parts = rawPath.split("/").filter(Boolean); // ["api", "games", "5", "teams"] etc.
  const out: string[] = [];
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    out.push(seg);
    const kind = ENTITY_FOR_PATH_SEGMENT[seg];
    const next = parts[i + 1];
    if (kind && next && /^\d+$/.test(next)) {
      const localId = Number(next);
      const remote = store.idMap.translate(kind, localId);
      if (remote == null) {
        return { path, ok: false, missing: `${kind}:${localId}` };
      }
      out.push(String(remote));
      i++;
    }
  }
  const finalPath = "/" + out.join("/") + (query ? `?${query}` : "");
  return { path: finalPath, ok: true };
}

function translateBody(body: unknown): { body: unknown; ok: boolean; missing?: string } {
  if (body == null || typeof body !== "object") return { body, ok: true };
  const src = body as Record<string, unknown>;
  const out: Record<string, unknown> = { ...src };
  for (const { field, kind } of BODY_ID_FIELDS) {
    const v = out[field];
    if (typeof v === "number") {
      const remote = store.idMap.translate(kind, v);
      if (remote == null) {
        return { body, ok: false, missing: `${kind}:${v}` };
      }
      out[field] = remote;
    }
  }
  return { body: out, ok: true };
}

// ---------- Sending to remote ----------

async function sendItem(item: SyncQueueItem): Promise<void> {
  const pathResult = translatePath(item.path);
  if (!pathResult.ok) {
    throw new Error(`Missing remote id mapping for ${pathResult.missing}`);
  }
  const bodyResult = translateBody(item.body);
  if (!bodyResult.ok) {
    throw new Error(`Missing remote id mapping for ${bodyResult.missing}`);
  }

  const url = REMOTE_URL + pathResult.path;
  const init: RequestInit = {
    method: item.method,
    headers: { "Content-Type": "application/json" },
    body: item.method === "DELETE" ? undefined : JSON.stringify(bodyResult.body ?? {}),
  };

  const res = await _originalFetch(url, init);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ""}`);
  }

  // For creations, capture the remote id and add to the id map
  if (item.method === "POST" && item.entity && item.localId != null) {
    try {
      const json = await res.clone().json() as { id?: number };
      if (typeof json?.id === "number") {
        store.idMap.set(item.entity, item.localId, json.id);
      }
    } catch {
      // some endpoints return 204; ignore
    }
  }
}

// ---------- Flush worker ----------

export async function flushQueue(): Promise<void> {
  if (_syncing) return;
  if (!SYNC_REMOTE_ENABLED) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (store.syncQueue.pendingCount() === 0) return;

  _syncing = true;
  _lastError = null;
  notify();

  try {
    while (true) {
      const item = store.syncQueue.nextPending();
      if (!item) break;

      store.syncQueue.update(item.id, { status: "syncing", attempts: item.attempts + 1 });
      notify();

      try {
        await sendItem(item);
        store.syncQueue.update(item.id, {
          status: "synced",
          syncedAt: new Date().toISOString(),
          lastError: null,
        });
        _lastSyncAt = new Date().toISOString();
        notify();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        store.syncQueue.update(item.id, { status: "failed", lastError: message });
        _lastError = message;
        notify();
        // Stop on first failure to preserve insertion order and dependent ids.
        scheduleRetry();
        return;
      }
    }
    // Success path: tidy up persisted "synced" entries to keep storage small
    store.syncQueue.clearSynced();
    notify();
  } finally {
    _syncing = false;
    notify();
  }
}

function scheduleRetry(delayMs = 15_000) {
  if (_retryTimer) clearTimeout(_retryTimer);
  _retryTimer = setTimeout(() => {
    _retryTimer = null;
    void flushQueue();
  }, delayMs);
}

// ---------- Enqueue helper called by the local fetch interceptor ----------

type EnqueueArgs = {
  method: string;
  path: string;
  body: unknown;
  responseStatus: number;
  responseBody: unknown;
};

const ENQUEUE_BLOCKLIST = [
  /^\/api\/seed$/,                 // sample data is local-only
  /^\/api\/games\/\d+\/clock$/,    // clock ticks fire every few seconds; not worth syncing
];

function inferEntity(method: string, path: string): { entity: SyncEntityKind | null; localId: number | null } {
  if (method !== "POST") return { entity: null, localId: null };
  if (/^\/api\/games$/.test(path)) return { entity: "game", localId: null };
  if (/^\/api\/games\/\d+\/teams$/.test(path)) return { entity: "team", localId: null };
  if (/^\/api\/teams\/\d+\/players$/.test(path)) return { entity: "player", localId: null };
  if (/^\/api\/games\/\d+\/stats$/.test(path)) return { entity: "statEvent", localId: null };
  return { entity: null, localId: null };
}

export function enqueueIfMutation(args: EnqueueArgs): void {
  const method = args.method.toUpperCase();
  if (method !== "POST" && method !== "PUT" && method !== "PATCH" && method !== "DELETE") return;

  const pathOnly = args.path.split("?")[0];
  if (ENQUEUE_BLOCKLIST.some(rx => rx.test(pathOnly))) return;

  // Don't enqueue mutations the local handler rejected
  if (args.responseStatus < 200 || args.responseStatus >= 300) return;

  const { entity } = inferEntity(method, pathOnly);

  // For POSTs that create entities, capture the local id so we can map it after remote create
  let localId: number | null = null;
  if (entity && args.responseBody && typeof args.responseBody === "object") {
    const rb = args.responseBody as { id?: number; statEvent?: { id?: number } };
    if (typeof rb.id === "number") localId = rb.id;
    else if (rb.statEvent && typeof rb.statEvent.id === "number") localId = rb.statEvent.id;
  }

  store.syncQueue.enqueue({
    method: method as SyncQueueItem["method"],
    path: pathOnly,
    body: args.body ?? null,
    entity,
    localId,
  });

  notify();

  // Try flushing immediately; flushQueue() is a no-op if offline / disabled / already running.
  void flushQueue();
}

// ---------- Init ----------

let _initialised = false;

export function initLocalSync() {
  if (_initialised) return;
  _initialised = true;

  if (typeof window === "undefined") return;

  window.addEventListener("online", () => {
    notify();
    void flushQueue();
  });
  window.addEventListener("offline", () => {
    notify();
  });

  // On load (page refresh / reconnection between sessions), drain anything left behind
  if (document.readyState === "complete") {
    void flushQueue();
  } else {
    window.addEventListener("load", () => { void flushQueue(); });
  }

  // One-shot kick in case anything is queued from a previous session
  void flushQueue();
}

export function syncNow(): Promise<void> {
  return flushQueue();
}
