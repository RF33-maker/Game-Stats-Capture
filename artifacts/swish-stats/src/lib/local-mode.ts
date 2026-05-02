import { handleLocalRequest } from "./local-handler";
import { store } from "./local-store";

export const LOCAL_MODE_ENABLED = import.meta.env.VITE_LOCAL_MODE !== "false";

export function resetLocalData() {
  store.reset();
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

    const responseBody = result.body == null ? null : JSON.stringify(result.body);
    const headers: HeadersInit = { "Content-Type": "application/json" };

    return new Response(responseBody, {
      status: result.status,
      headers,
    });
  };
}
