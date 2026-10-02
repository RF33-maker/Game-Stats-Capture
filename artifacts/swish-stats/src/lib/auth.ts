import { useCallback, useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase, SUPABASE_CONFIGURED } from "./supabase";
import { LOCAL_MODE_ENABLED } from "./local-mode";
import { store } from "./local-store";
import { pullFromServer } from "./remote";
import { queryClient } from "./query-client";

// Accounts are the same Supabase accounts as swishassistant.com.
//
// A scorer must never be locked out of a game by a missing connection, so
// the last signed-in user is remembered on the device: opened offline with
// no usable session, the app still lets them capture (sync waits until they
// are back online and signed in).

export type AuthUser = {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  profileImageUrl: string | null;
};

type AuthState = { user: AuthUser | null; isLoading: boolean; offlineOnly: boolean };

const LAST_USER_KEY = "swish-stats:last-user";
const LOCAL_USER: AuthUser = {
  id: "local", email: "local@swish-stats.local", firstName: "Local", lastName: "Mode", profileImageUrl: null,
};

function toAuthUser(u: User): AuthUser {
  const m = (u.user_metadata ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
  const full = str(m.full_name) ?? str(m.name);
  return {
    id: u.id,
    email: u.email ?? null,
    firstName: str(m.first_name) ?? (full ? full.split(" ")[0] : null),
    lastName: str(m.last_name) ?? (full && full.includes(" ") ? full.split(" ").slice(1).join(" ") : null),
    profileImageUrl: str(m.avatar_url) ?? str(m.picture),
  };
}

function readLastUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(LAST_USER_KEY);
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

let state: AuthState = LOCAL_MODE_ENABLED || !SUPABASE_CONFIGURED
  ? { user: LOCAL_MODE_ENABLED ? LOCAL_USER : null, isLoading: false, offlineOnly: false }
  : { user: null, isLoading: true, offlineOnly: false };
const listeners = new Set<() => void>();

function set(next: AuthState) {
  state = next;
  for (const l of listeners) l();
}

function applySession(user: User | null) {
  if (user) {
    const u = toAuthUser(user);
    try { localStorage.setItem(LAST_USER_KEY, JSON.stringify(u)); } catch { /* ignore */ }
    set({ user: u, isLoading: false, offlineOnly: false });
    // Bring this account's leagues and games onto the device, then refresh screens.
    void pullFromServer()
      .then(() => queryClient.invalidateQueries())
      .catch((e) => console.warn("Pull from server failed", e));
    return;
  }
  const last = typeof navigator !== "undefined" && !navigator.onLine ? readLastUser() : null;
  set({ user: last, isLoading: false, offlineOnly: !!last });
}

if (!LOCAL_MODE_ENABLED && SUPABASE_CONFIGURED) {
  void supabase.auth.getSession().then(({ data }) => applySession(data.session?.user ?? null));
  supabase.auth.onAuthStateChange((_event, session) => applySession(session?.user ?? null));
  window.addEventListener("online", () => {
    void supabase.auth.getSession().then(({ data }) => applySession(data.session?.user ?? null));
  });
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => { listeners.delete(l); };
}

export async function signInWithPassword(email: string, password: string): Promise<string | null> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  return error ? error.message : null;
}

export async function sendPasswordReset(email: string): Promise<string | null> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
  return error ? error.message : null;
}

export function useAuth() {
  const s = useSyncExternalStore(subscribe, () => state, () => state);

  const login = useCallback((returnTo?: string) => {
    const base = (import.meta.env.BASE_URL as string).replace(/\/+$/, "");
    const target = returnTo ?? `${window.location.pathname}${window.location.search}`;
    window.location.href = `${base}/login?next=${encodeURIComponent(target.replace(base, "") || "/leagues")}`;
  }, []);

  const logout = useCallback(async () => {
    const pending = store.outbox.pendingCount() + store.outbox.failedCount();
    if (pending > 0 && !confirm(
      `${pending} change${pending === 1 ? " hasn't" : "s haven't"} reached the server yet. ` +
      "Signing out now keeps them on this device, but they won't sync until you sign back in. Sign out anyway?",
    )) return;
    await supabase.auth.signOut();
    try { localStorage.removeItem(LAST_USER_KEY); } catch { /* ignore */ }
    const base = (import.meta.env.BASE_URL as string).replace(/\/+$/, "");
    window.location.href = `${base}/login`;
  }, []);

  return {
    user: s.user,
    isLoading: s.isLoading,
    isAuthenticated: !!s.user,
    // Signed in from the device's memory only (offline, no live session).
    offlineOnly: s.offlineOnly,
    login,
    logout,
  };
}
