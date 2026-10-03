// Background sync: sends the local outbox to Supabase.
//
// The UI never waits on this. Every change is already saved on the device;
// this drains the outbox whenever we're online and signed in. Rows are keyed
// by uids generated on the device, so a send that's repeated (after a lost
// response, a crash, a reload) changes nothing on the server.

import { supabase, SUPABASE_CONFIGURED } from "./supabase";
import { store, onOutboxChange, isHydrated, type OutboxItem } from "./local-store";

export const SYNC_REMOTE_ENABLED = SUPABASE_CONFIGURED && import.meta.env.VITE_LOCAL_MODE !== "true";

export type SyncStatus = {
  online: boolean;
  remoteEnabled: boolean;
  signedIn: boolean;
  syncing: boolean;
  pending: number;
  failed: number;
  lastSyncAt: string | null;
  lastError: string | null;
};

let _syncing = false;
let _signedIn = false;
let _lastSyncAt: string | null = null;
let _lastError: string | null = null;
let _retryTimer: ReturnType<typeof setTimeout> | null = null;
let _backoffMs = 2000;

const listeners = new Set<() => void>();

// Cached snapshot for useSyncExternalStore: must be the same object until
// something actually changes, or React re-renders forever.
let _cachedStatus: SyncStatus = computeStatus();

function computeStatus(): SyncStatus {
  return {
    online: typeof navigator !== "undefined" ? navigator.onLine : true,
    remoteEnabled: SYNC_REMOTE_ENABLED,
    signedIn: _signedIn,
    syncing: _syncing,
    pending: SYNC_REMOTE_ENABLED ? store.outbox.pendingCount() : 0,
    failed: SYNC_REMOTE_ENABLED ? store.outbox.failedCount() : 0,
    lastSyncAt: _lastSyncAt,
    lastError: _lastError,
  };
}

function notify() {
  const next = computeStatus();
  const prev = _cachedStatus;
  if ((Object.keys(next) as (keyof SyncStatus)[]).every(k => next[k] === prev[k])) return;
  _cachedStatus = next;
  for (const l of listeners) {
    try { l(); } catch { /* ignore */ }
  }
}

export function getSyncStatus(): SyncStatus {
  return _cachedStatus;
}

export function subscribeSyncStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

// ---------- Payloads (read from the store at send time) ----------

class PermanentError extends Error {}

function leagueUid(leagueId: number | null): string {
  const l = leagueId != null ? store.leagues.get(leagueId) : null;
  if (!l) throw new PermanentError("Game isn't in a league");
  return l.uid;
}
function gameUid(id: number): string {
  const g = store.games.get(id);
  if (!g) throw new PermanentError(`Game ${id} no longer exists on this device`);
  return g.uid;
}
function teamUid(id: number | null): string | null {
  if (id == null) return null;
  const t = store.teams.get(id);
  if (!t) throw new PermanentError(`Team ${id} no longer exists on this device`);
  return t.uid;
}
function playerUid(id: number | null): string | null {
  if (id == null) return null;
  return store.players.get(id)?.uid ?? null;
}
function eventUid(id: number | null): string | null {
  if (id == null) return null;
  return store.statEvents.get(id)?.uid ?? null;
}

function payload(item: OutboxItem): Record<string, unknown> | null {
  switch (item.table) {
    case "leagues": {
      const l = store.leagues.getByUid(item.uid);
      return l && { uid: l.uid, name: l.name, season: l.season, logo_url: l.logoUrl, site_league_id: l.siteLeagueId ?? null };
    }
    case "games": {
      const g = store.games.getByUid(item.uid);
      return g && {
        uid: g.uid,
        league_uid: leagueUid(g.leagueId),
        status: g.status,
        capture_mode: g.captureMode,
        competition: g.competition,
        venue: g.venue,
        game_date: g.date.slice(0, 10),
        period_count: g.periodCount,
        period_duration_mins: g.periodDurationMins,
        current_period: Math.min(g.currentPeriod, 20),
        clock_seconds: Math.max(0, Math.min(g.clockSeconds, 3600)),
        home_attacks_left_first_half: g.homeAttacksLeftFirstHalf ?? false,
      };
    }
    case "game_teams": {
      const t = store.teams.getByUid(item.uid);
      return t && {
        uid: t.uid,
        game_uid: gameUid(t.gameId),
        is_home: t.isHome,
        name: t.name,
        abbreviation: t.abbreviation.slice(0, 6),
        color_primary: t.colorPrimary,
        color_secondary: t.colorSecondary,
        logo_url: t.logoUrl,
        site_team_id: t.siteTeamId ?? null,
      };
    }
    case "game_players": {
      const p = store.players.getByUid(item.uid);
      return p && {
        uid: p.uid,
        team_uid: teamUid(p.teamId),
        jersey_number: p.jerseyNumber.slice(0, 4),
        first_name: p.firstName,
        last_name: p.lastName,
        position: p.position || null,
        headshot_url: p.headshotUrl,
        is_starter: p.isStarter,
        is_active: p.isActive,
        site_player_id: p.sitePlayerId ?? null,
      };
    }
    case "stat_events": {
      const e = store.statEvents.getByUid(item.uid);
      return e && {
        uid: e.uid,
        game_uid: gameUid(e.gameId),
        team_uid: teamUid(e.teamId),
        player_uid: playerUid(e.playerId),
        period: e.period,
        clock_seconds: e.clockSeconds,
        event_type: e.eventType,
        value: e.value,
        shot_zone: e.shotZone,
        shot_x: e.shotX,
        shot_y: e.shotY,
        ft_sequence_index: e.ftSequenceIndex,
        ft_sequence_total: e.ftSequenceTotal,
        pair_event_uid: eventUid(e.pairEventId),
        replaces_event_uid: eventUid(e.replacesId),
        needs_review: e.needsReview,
        device_created_at: e.createdAt,
        device_seq: e.orderKey,
      };
    }
  }
}

type PgError = { code?: string; message: string };

async function send(item: OutboxItem): Promise<void> {
  const db = supabase.from(item.table);
  let error: PgError | null = null;
  let status: number | undefined;

  if (item.op === "delete") {
    ({ error, status } = await db.delete().eq("uid", item.uid));
  } else if (item.op === "void" || item.op === "review") {
    const e = store.statEvents.getByUid(item.uid);
    if (!e) return; // gone locally — nothing to send
    if (item.op === "void") {
      const res = await db
        .update({ voided_at: e.voidedAt, void_reason: e.voidReason })
        .eq("uid", item.uid)
        .is("voided_at", null)
        .select("uid");
      ({ error, status } = res);
      if (!error && (res.data?.length ?? 0) === 0) {
        // Either it was already voided (a repeat send — fine) or the server
        // refused silently (row-level security, e.g. the game is final).
        const check = await db.select("voided_at").eq("uid", item.uid).maybeSingle();
        if (check.error) ({ error, status } = check);
        else if (!check.data) throw new Error("Event hasn't reached the server yet");
        else if (!(check.data as { voided_at: string | null }).voided_at) {
          throw new PermanentError("Not allowed to change this game (is it final?)");
        }
      }
    } else {
      ({ error, status } = await db.update({ needs_review: e.needsReview }).eq("uid", item.uid));
    }
  } else {
    const row = payload(item);
    if (!row) return; // row deleted locally since it was queued
    ({ error, status } = await db.upsert(row, {
      onConflict: "uid",
      // Stat events are insert-once; a repeat send must not try to update.
      ignoreDuplicates: item.op === "insert",
    }));
  }

  if (error) {
    // Network failure / server trouble / stale token: try again later.
    if (!status || status >= 500 || status === 401 || error.code === "PGRST301") {
      if (status === 401 || error.code === "PGRST301") await supabase.auth.refreshSession().catch(() => {});
      throw new Error(error.message || "Network error");
    }
    // A parent row that hasn't landed yet — retry a few times.
    if (error.code === "23503") throw new Error(error.message);
    // Anything else (permissions, validation) won't fix itself.
    throw new PermanentError(error.message);
  }
}

// ---------- Draining ----------

const MAX_TRANSIENT_ATTEMPTS = 8;

function scheduleRetry() {
  if (_retryTimer) clearTimeout(_retryTimer);
  _retryTimer = setTimeout(() => { _retryTimer = null; void syncNow(); }, _backoffMs);
  _backoffMs = Math.min(_backoffMs * 2, 60_000);
}

export async function syncNow(): Promise<void> {
  if (!SYNC_REMOTE_ENABLED || _syncing || !_signedIn) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) { notify(); return; }
  if (!isHydrated() || store.outbox.pendingCount() === 0) return;

  _syncing = true;
  notify();
  try {
    for (;;) {
      const [item] = store.outbox.pending();
      if (!item) break;
      try {
        await send(item);
        store.outbox.remove(item.id);
        _lastError = null;
        _backoffMs = 2000;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        _lastError = message;
        if (e instanceof PermanentError || item.attempts + 1 >= MAX_TRANSIENT_ATTEMPTS) {
          // Park it and keep going so one bad row can't block the game.
          store.outbox.update(item.id, { status: "failed", attempts: item.attempts + 1, lastError: message });
          continue;
        }
        store.outbox.update(item.id, { attempts: item.attempts + 1, lastError: message });
        scheduleRetry();
        break;
      } finally {
        await store.persist().catch(() => {});
      }
    }
    _lastSyncAt = new Date().toISOString();
  } finally {
    _syncing = false;
    notify();
  }
}

export function retryFailed() {
  store.outbox.retryFailed();
  void syncNow();
}

let _debounce: ReturnType<typeof setTimeout> | null = null;
function kick() {
  notify();
  if (_debounce) clearTimeout(_debounce);
  _debounce = setTimeout(() => { _debounce = null; void syncNow(); }, 250);
}

let _started = false;
export function initLocalSync() {
  if (_started) return;
  _started = true;
  onOutboxChange(kick);
  if (typeof window !== "undefined") {
    window.addEventListener("online", () => { _backoffMs = 2000; kick(); });
    window.addEventListener("offline", notify);
    // Safety net in case an event was missed.
    setInterval(() => { void syncNow(); }, 15_000);
  }
  if (!SYNC_REMOTE_ENABLED) return;
  void supabase.auth.getSession().then(({ data }) => {
    _signedIn = !!data.session;
    kick();
  });
  supabase.auth.onAuthStateChange((_event, session) => {
    _signedIn = !!session;
    kick();
  });
}
