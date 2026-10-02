import { handleLocalRequest } from "./local-handler";
import { store, setOutboxEnabled } from "./local-store";
import { initLocalSync, SYNC_REMOTE_ENABLED } from "./local-sync";

// The app always runs on the on-device engine (local-handler + IndexedDB):
// every request is answered locally, so capture never waits on the network.
// Signed-in mode also queues each change in the outbox and syncs it to
// Supabase in the background. VITE_LOCAL_MODE=true is a development mode with
// no account and no sync.
export const LOCAL_MODE_ENABLED = import.meta.env.VITE_LOCAL_MODE === "true";

export async function resetLocalData() {
  await store.reset();
  window.location.reload();
}

const _originalFetch = window.fetch.bind(window);

export function installLocalFetchInterceptor() {
  window.fetch = async function localFetchInterceptor(
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : (input as Request).url;
    const method = init?.method ?? (input instanceof Request ? input.method : "GET");

    const isApiCall = url.startsWith("/api/") || /\/api\//.test(url);

    if (!isApiCall) {
      return _originalFetch(input, init);
    }

    let body: unknown = undefined;
    if (init?.body) {
      try {
        body = JSON.parse(init.body as string);
      } catch {
        body = init.body;
      }
    } else if (input instanceof Request && input.body) {
      try {
        const cloned = (input as Request).clone();
        body = await cloned.json();
      } catch {
        // no body
      }
    }

    // Extract the path portion
    let path = url;
    try {
      const parsed = new URL(url, window.location.origin);
      path = parsed.pathname + parsed.search;
    } catch {
      // already a path
    }

    const result = await handleLocalRequest(method, path, body);

    // Don't tell the UI it happened until it's on disk: a tap the scorer has
    // seen confirmed survives the app being killed straight after.
    if (method !== "GET") await store.persist();

    const responseBody = result.body == null ? null : JSON.stringify(result.body);
    const headers: HeadersInit = { "Content-Type": "application/json" };

    return new Response(responseBody, {
      status: result.status,
      headers,
    });
  };

  // Queue changes for the server and drain the queue in the background.
  setOutboxEnabled(SYNC_REMOTE_ENABLED);
  initLocalSync();
}
