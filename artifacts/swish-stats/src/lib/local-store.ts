import { readAll, scheduleWrite, flush, clearAll } from "./local-persist";
import { uuid } from "./uuid";

const NS = "swish-stats:v1";

function key(name: string) {
  return `${NS}:${name}`;
}

// Collections live in memory as JSON strings — the same shape they had in
// localStorage — so every read still returns fresh objects and the game
// logic's copy-mutate-save pattern behaves exactly as before. Writes are
// mirrored to IndexedDB (see local-persist.ts).
const mem = new Map<string, string>();
let hydrated = false;
let hydrating: Promise<void> | null = null;

function load<T>(name: string, fallback: T): T {
  const raw = mem.get(key(name));
  if (raw == null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save(name: string, value: unknown) {
  const k = key(name);
  const s = JSON.stringify(value);
  mem.set(k, s);
  scheduleWrite(k, s);
}

export type LeagueRole = "viewer" | "scorer" | "admin";

export type LSGame = {
  id: number;
  uid: string;
  leagueId: number | null;
  competition: string | null;
  date: string;
  venue: string | null;
  status: "setup" | "active" | "final";
  captureMode: "simple" | "complex";
  periodCount: number;
  periodDurationMins: number;
  overtimeCount: number;
  currentPeriod: number;
  clockSeconds: number;
  possessionTeamId: number | null;
  // True = the home team attacks the left basket in the first half (teams
  // swap at half-time). Drives which team a full-court tap belongs to.
  homeAttacksLeftFirstHalf?: boolean;
  // Fixture details (set by the league organiser).
  tipoffTime?: string | null;
  roundLabel?: string | null;
  gameNumber?: number | null;
  venueUid?: string | null;
  homeLeagueTeamUid?: string | null;
  awayLeagueTeamUid?: string | null;
  attendance?: number | null;
  // Six-character code a volunteer types to score this game. Made by the
  // server; never sent from the device.
  gameCode?: string | null;
  // Rules, copied from the league when the game is created.
  overtimeDurationMins?: number;
  foulLimit?: number;
  bonusAfterTeamFouls?: number;
  timeoutsFirstHalf?: number;
  timeoutsSecondHalf?: number;
  timeoutsOvertime?: number;
  // How this user reaches the game when they aren't a league member:
  // joined with the game code, or manage one of the two teams.
  myAccess?: "scorer" | "manager" | null;
  createdAt: string;
  updatedAt: string;
};

export type LSTeam = {
  id: number;
  uid: string;
  gameId: number;
  name: string;
  abbreviation: string;
  colorPrimary: string;
  colorSecondary: string;
  logoUrl: string | null;
  isHome: boolean;
  siteTeamId?: string | null;
  leagueTeamUid?: string | null;
  headCoach?: string | null;
  assistantCoach?: string | null;
  createdAt: string;
};

export type LSPlayer = {
  id: number;
  uid: string;
  teamId: number;
  jerseyNumber: string;
  firstName: string;
  lastName: string;
  position: string | null;
  headshotUrl: string | null;
  isActive: boolean;
  isStarter: boolean;
  sitePlayerId?: string | null;
  squadPlayerUid?: string | null;
  isCaptain?: boolean;
  createdAt: string;
};

export type LSStatEvent = {
  id: number;
  uid: string;
  gameId: number;
  teamId: number | null;
  playerId: number | null;
  period: number;
  clockSeconds: number;
  eventType: string;
  value: number;
  shotZone: string | null;
  // Exact location in the site's shot_chart space (x 0-50 along the court,
  // y 0-100 across it). Null for shots recorded without a location.
  shotX: number | null;
  shotY: number | null;
  ftSequenceIndex: number | null;
  ftSequenceTotal: number | null;
  possessionTeamId: number | null;
  // Durable link between a sub_out row and its paired sub_in row (mirrors
  // the server schema) — substitutions are always created/voided as a pair.
  pairEventId: number | null;
  // Scorer-set "come back and check this later" flag. Advisory only.
  needsReview: boolean;
  // Position in the game's sequence. A correction takes the place of the
  // event it replaces, so it inherits that event's orderKey.
  orderKey: number;
  // Events are never deleted or edited: a mistake is voided, a correction is
  // a new event pointing at the one it replaces.
  replacesId: number | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
};

export type LSPlayByPlay = {
  id: number;
  gameId: number;
  statEventId: number | null;
  teamId: number | null;
  playerId: number | null;
  period: number;
  clockSeconds: number;
  possessionTeamId: number | null;
  possessionEnded: string;
  homeScore: number;
  awayScore: number;
  eventText: string;
  // Denormalized copy of the source stat event's needsReview flag (mirrors
  // the server schema), kept in sync by rebuildPlayByPlay.
  needsReview: boolean;
  createdAt: string;
};

export type LSLeague = {
  id: number;
  uid: string;
  name: string;
  season: string | null;
  logoUrl: string | null;
  // This user's role in the league (from the server once synced).
  role: LeagueRole;
  // The site competition (public.competitions.league_id) games publish into.
  siteLeagueId?: string | null;
  siteLeagueName?: string | null;
  // Competition rules every new game in the league starts with.
  defaultCaptureMode?: "simple" | "complex";
  periodCount?: number;
  periodDurationMins?: number;
  overtimeDurationMins?: number;
  foulLimit?: number;
  bonusAfterTeamFouls?: number;
  timeoutsFirstHalf?: number;
  timeoutsSecondHalf?: number;
  timeoutsOvertime?: number;
  createdAt: string;
};

export type LeagueRules = Required<Pick<LSLeague,
  "defaultCaptureMode" | "periodCount" | "periodDurationMins" | "overtimeDurationMins" | "foulLimit"
  | "bonusAfterTeamFouls" | "timeoutsFirstHalf" | "timeoutsSecondHalf" | "timeoutsOvertime">>;

// FIBA defaults.
export const DEFAULT_RULES: LeagueRules = {
  defaultCaptureMode: "complex",
  periodCount: 4,
  periodDurationMins: 10,
  overtimeDurationMins: 5,
  foulLimit: 5,
  bonusAfterTeamFouls: 4,
  timeoutsFirstHalf: 2,
  timeoutsSecondHalf: 3,
  timeoutsOvertime: 1,
};

export function leagueRules(l: Partial<LeagueRules> | null | undefined): LeagueRules {
  const out = { ...DEFAULT_RULES };
  for (const k of Object.keys(out) as (keyof LeagueRules)[]) {
    const v = l?.[k];
    if (v !== undefined && v !== null) (out as Record<string, unknown>)[k] = v;
  }
  return out;
}

// ---------- Outbox ----------
//
// One entry per row that needs sending. The payload is read from the store
// at send time, so repeated edits to the same row coalesce into one entry
// that always carries the latest values. Rows are keyed by uid on the
// server, so sending the same entry twice is harmless.

export type OutboxTable = "leagues" | "games" | "game_teams" | "game_players" | "stat_events";
export type OutboxOp =
  | "upsert"   // leagues / games / teams / players: insert or update by uid
  | "insert"   // stat_events: insert once (ignored if already there)
  | "void"     // stat_events: set voided_at
  | "review"   // stat_events: set needs_review
  | "delete";  // players removed during setup; a whole game deleted by an admin

export type OutboxItem = {
  id: number;
  table: OutboxTable;
  uid: string;
  op: OutboxOp;
  status: "pending" | "failed";
  attempts: number;
  lastError: string | null;
  createdAt: string;
};

let outboxEnabled = false;
let outboxSuppressed = 0;
const outboxListeners = new Set<() => void>();

/** Turn on queuing for server sync (off in local-only mode). */
export function setOutboxEnabled(on: boolean) {
  outboxEnabled = on;
}

/** Run `fn` without queuing its writes (used when applying server data). */
export function withoutOutbox<T>(fn: () => T): T {
  outboxSuppressed++;
  try {
    return fn();
  } finally {
    outboxSuppressed--;
  }
}

export function onOutboxChange(listener: () => void): () => void {
  outboxListeners.add(listener);
  return () => outboxListeners.delete(listener);
}

function queue(table: OutboxTable, uid: string, op: OutboxOp) {
  if (!outboxEnabled || outboxSuppressed > 0) return;
  store.outbox.enqueue(table, uid, op);
}

type Counters = {
  game: number;
  team: number;
  player: number;
  statEvent: number;
  pbp: number;
  outbox: number;
  league: number;
};

function getCounters(): Counters {
  return { game: 0, team: 0, player: 0, statEvent: 0, pbp: 0, outbox: 0, league: 0, ...load<Partial<Counters>>("counters", {}) };
}

function nextId(field: keyof Counters): number {
  const c = getCounters();
  c[field] += 1;
  save("counters", c);
  return c[field];
}

/** Sort stat events into game order. */
export function byOrder(a: LSStatEvent, b: LSStatEvent) {
  return a.orderKey - b.orderKey || a.id - b.id;
}

// ------- Create inputs (uid optional: given when applying server rows) -------
type CreateGameInput = Partial<Omit<LSGame, "id" | "createdAt" | "updatedAt">>;
type CreateStatEventInput = Omit<
  LSStatEvent,
  "id" | "uid" | "createdAt" | "orderKey" | "replacesId" | "voidedAt" | "voidReason" | "shotZone" | "shotX" | "shotY"
> & Partial<Pick<LSStatEvent, "uid" | "createdAt" | "orderKey" | "replacesId" | "voidedAt" | "voidReason" | "shotZone" | "shotX" | "shotY">>;
type CreatePbpInput = Omit<LSPlayByPlay, "id" | "createdAt">;
type CreatePlayerInput = Omit<LSPlayer, "id" | "uid" | "createdAt"> & Partial<Pick<LSPlayer, "uid">>;
type CreateTeamInput = Omit<LSTeam, "id" | "uid" | "createdAt"> & Partial<Pick<LSTeam, "uid">>;

export const store = {
  /** Load everything from IndexedDB (migrating old localStorage data once). Call before rendering. */
  hydrate(): Promise<void> {
    if (!hydrating) hydrating = hydrateOnce();
    return hydrating;
  },

  /** Wait for every write so far to reach disk. */
  persist(): Promise<void> {
    return flush();
  },

  async reset() {
    for (const k of mem.keys()) scheduleWrite(k, null);
    mem.clear();
    await clearAll();
    Object.keys(localStorage).filter(k => k.startsWith(NS)).forEach(k => localStorage.removeItem(k));
  },

  leagues: {
    list(): LSLeague[] { return load<LSLeague[]>("leagues", []); },
    save(leagues: LSLeague[]) { save("leagues", leagues); },
    get(id: number) { return this.list().find(l => l.id === id) ?? null; },
    getByUid(uid: string) { return this.list().find(l => l.uid === uid) ?? null; },
    create(input: { name: string; season?: string | null; logoUrl?: string | null; uid?: string; role?: LeagueRole; createdAt?: string; siteLeagueId?: string | null } & Partial<LeagueRules>): LSLeague {
      const now = new Date().toISOString();
      const id = nextId("league");
      const league: LSLeague = {
        id,
        uid: input.uid ?? uuid(),
        name: input.name,
        season: input.season ?? null,
        logoUrl: input.logoUrl ?? null,
        role: input.role ?? "admin",
        siteLeagueId: input.siteLeagueId ?? null,
        ...leagueRules(input),
        createdAt: input.createdAt ?? now,
      };
      const leagues = this.list();
      leagues.push(league);
      this.save(leagues);
      queue("leagues", league.uid, "upsert");
      return league;
    },
    update(id: number, data: Partial<Omit<LSLeague, "id" | "uid" | "createdAt">>): LSLeague | null {
      const leagues = this.list();
      const idx = leagues.findIndex(l => l.id === id);
      if (idx === -1) return null;
      leagues[idx] = { ...leagues[idx], ...data, id };
      this.save(leagues);
      if (Object.keys(data).some(k => k !== "role" && k !== "siteLeagueName")) queue("leagues", leagues[idx].uid, "upsert");
      return leagues[idx];
    },
    delete(id: number): boolean {
      const leagues = this.list();
      const idx = leagues.findIndex(l => l.id === id);
      if (idx === -1) return false;
      leagues.splice(idx, 1);
      this.save(leagues);
      return true;
    },
    ensureSeed(): LSLeague {
      const list = this.list();
      if (list.length > 0) return list[0];
      return this.create({ name: "Local Games", season: "Local Mode" });
    },
  },

  outbox: {
    list(): OutboxItem[] { return load<OutboxItem[]>("outbox", []); },
    save(items: OutboxItem[]) {
      save("outbox", items);
      for (const l of outboxListeners) { try { l(); } catch { /* ignore */ } }
    },
    pendingCount(): number { return this.list().filter(i => i.status === "pending").length; },
    failedCount(): number { return this.list().filter(i => i.status === "failed").length; },
    enqueue(table: OutboxTable, uid: string, op: OutboxOp) {
      let items = this.list();
      if (op === "delete") {
        // A pending upsert for a row that's now gone is moot.
        items = items.filter(i => !(i.table === table && i.uid === uid && i.op === "upsert"));
      }
      const existing = items.find(i => i.table === table && i.uid === uid && i.op === op);
      if (existing) {
        // Coalesce: the payload is read at send time, so one entry is enough.
        // A failed entry gets another try with the latest values.
        existing.status = "pending";
        existing.attempts = 0;
        existing.lastError = null;
      } else {
        items.push({
          id: nextId("outbox"),
          table, uid, op,
          status: "pending",
          attempts: 0,
          lastError: null,
          createdAt: new Date().toISOString(),
        });
      }
      this.save(items);
    },
    /** Pending entries in the order they were first queued (parents before children). */
    pending(): OutboxItem[] {
      return this.list().filter(i => i.status === "pending").sort((a, b) => a.id - b.id);
    },
    remove(id: number) { this.save(this.list().filter(i => i.id !== id)); },
    update(id: number, data: Partial<OutboxItem>) {
      const items = this.list();
      const idx = items.findIndex(i => i.id === id);
      if (idx === -1) return;
      items[idx] = { ...items[idx], ...data, id };
      this.save(items);
    },
    retryFailed() {
      const items = this.list();
      for (const i of items) if (i.status === "failed") { i.status = "pending"; i.attempts = 0; }
      this.save(items);
    },
    hasPendingFor(table: OutboxTable, uid: string): boolean {
      return this.list().some(i => i.table === table && i.uid === uid);
    },
  },

  games: {
    list(): LSGame[] { return load<LSGame[]>("games", []); },
    save(games: LSGame[]) { save("games", games); },
    get(id: number) { return this.list().find(g => g.id === id) ?? null; },
    getByUid(uid: string) { return this.list().find(g => g.uid === uid) ?? null; },
    create(input: CreateGameInput): LSGame {
      const now = new Date().toISOString();
      const id = nextId("game");
      const game: LSGame = {
        leagueId: null,
        competition: null,
        date: now,
        venue: null,
        status: "setup",
        captureMode: "complex",
        periodCount: 4,
        periodDurationMins: 10,
        overtimeCount: 0,
        currentPeriod: 1,
        clockSeconds: 600,
        possessionTeamId: null,
        // Caller overrides come after defaults
        ...input,
        // Identity fields always locked down
        id,
        uid: input.uid ?? uuid(),
        createdAt: now,
        updatedAt: now,
      };
      const games = this.list();
      games.push(game);
      this.save(games);
      queue("games", game.uid, "upsert");
      return game;
    },
    update(id: number, data: Partial<LSGame>): LSGame | null {
      const games = this.list();
      const idx = games.findIndex(g => g.id === id);
      if (idx === -1) return null;
      games[idx] = { ...games[idx], ...data, id, uid: games[idx].uid, updatedAt: new Date().toISOString() };
      this.save(games);
      queue("games", games[idx].uid, "upsert");
      return games[idx];
    },
    /** Remove a game and everything recorded in it from this device (and, once synced, the server). */
    delete(id: number): boolean {
      const games = this.list();
      const idx = games.findIndex(g => g.id === id);
      if (idx === -1) return false;
      const [removed] = games.splice(idx, 1);
      const teamIds = new Set(store.teams.forGame(id).map(t => t.id));
      // Unsent changes to rows inside the game are moot now.
      const gone = new Set<string>([
        ...store.teams.forGame(id).map(t => t.uid),
        ...store.players.list().filter(p => teamIds.has(p.teamId)).map(p => p.uid),
        ...store.statEvents.allForGame(id).map(e => e.uid),
      ]);
      store.outbox.save(store.outbox.list().filter(i => !(gone.has(i.uid) || (i.table === "games" && i.uid === removed.uid))));
      store.players.save(store.players.list().filter(p => !teamIds.has(p.teamId)));
      store.teams.save(store.teams.list().filter(t => t.gameId !== id));
      store.statEvents.save(store.statEvents.list().filter(e => e.gameId !== id));
      store.playByPlay.save(store.playByPlay.list().filter(p => p.gameId !== id));
      this.save(games);
      queue("games", removed.uid, "delete");
      return true;
    },
  },

  teams: {
    list(): LSTeam[] { return load<LSTeam[]>("teams", []); },
    save(teams: LSTeam[]) { save("teams", teams); },
    forGame(gameId: number) { return this.list().filter(t => t.gameId === gameId); },
    get(id: number) { return this.list().find(t => t.id === id) ?? null; },
    getByUid(uid: string) { return this.list().find(t => t.uid === uid) ?? null; },
    create(input: CreateTeamInput): LSTeam {
      const now = new Date().toISOString();
      const id = nextId("team");
      const team: LSTeam = {
        ...input,
        id,
        uid: input.uid ?? uuid(),
        createdAt: now,
      };
      const teams = this.list();
      teams.push(team);
      this.save(teams);
      queue("game_teams", team.uid, "upsert");
      return team;
    },
    update(id: number, data: Partial<LSTeam>): LSTeam | null {
      const teams = this.list();
      const idx = teams.findIndex(t => t.id === id);
      if (idx === -1) return null;
      teams[idx] = { ...teams[idx], ...data, id, uid: teams[idx].uid };
      this.save(teams);
      queue("game_teams", teams[idx].uid, "upsert");
      return teams[idx];
    },
  },

  players: {
    list(): LSPlayer[] { return load<LSPlayer[]>("players", []); },
    save(players: LSPlayer[]) { save("players", players); },
    forTeam(teamId: number) { return this.list().filter(p => p.teamId === teamId); },
    forGame(gameId: number) {
      const teamIds = new Set(store.teams.forGame(gameId).map(t => t.id));
      return this.list().filter(p => teamIds.has(p.teamId));
    },
    get(id: number) { return this.list().find(p => p.id === id) ?? null; },
    getByUid(uid: string) { return this.list().find(p => p.uid === uid) ?? null; },
    create(input: CreatePlayerInput): LSPlayer {
      const now = new Date().toISOString();
      const id = nextId("player");
      const player: LSPlayer = {
        ...input,
        id,
        uid: input.uid ?? uuid(),
        createdAt: now,
      };
      const players = this.list();
      players.push(player);
      this.save(players);
      queue("game_players", player.uid, "upsert");
      return player;
    },
    update(id: number, data: Partial<LSPlayer>): LSPlayer | null {
      const players = this.list();
      const idx = players.findIndex(p => p.id === id);
      if (idx === -1) return null;
      players[idx] = { ...players[idx], ...data, id, uid: players[idx].uid };
      this.save(players);
      queue("game_players", players[idx].uid, "upsert");
      return players[idx];
    },
    delete(id: number): boolean {
      const players = this.list();
      const idx = players.findIndex(p => p.id === id);
      if (idx === -1) return false;
      const [removed] = players.splice(idx, 1);
      this.save(players);
      queue("game_players", removed.uid, "delete");
      return true;
    },
  },

  statEvents: {
    list(): LSStatEvent[] { return load<LSStatEvent[]>("statEvents", []); },
    save(events: LSStatEvent[]) { save("statEvents", events); },
    /** Live (non-voided) events for a game. */
    forGame(gameId: number) { return this.list().filter(e => e.gameId === gameId && !e.voidedAt); },
    /** Every event for a game, voided ones included. */
    allForGame(gameId: number) { return this.list().filter(e => e.gameId === gameId); },
    get(id: number) { return this.list().find(e => e.id === id) ?? null; },
    getByUid(uid: string) { return this.list().find(e => e.uid === uid) ?? null; },
    create(input: CreateStatEventInput): LSStatEvent {
      const now = new Date().toISOString();
      const id = nextId("statEvent");
      const event: LSStatEvent = {
        shotZone: null,
        shotX: null,
        shotY: null,
        replacesId: null,
        voidedAt: null,
        voidReason: null,
        ...input,
        id,
        uid: input.uid ?? uuid(),
        orderKey: input.orderKey ?? id,
        createdAt: input.createdAt ?? now,
      };
      const events = this.list();
      events.push(event);
      this.save(events);
      queue("stat_events", event.uid, "insert");
      return event;
    },
    /**
     * Only the review flag (and the sub pair link, set in the same request
     * the pair is created) may change after an event exists. Anything else is
     * a correction — use replace().
     */
    update(id: number, patch: Partial<Pick<LSStatEvent, "needsReview" | "pairEventId">>): LSStatEvent | null {
      const events = this.list();
      const idx = events.findIndex(e => e.id === id);
      if (idx === -1) return null;
      const next = { ...events[idx], ...patch };
      events[idx] = next;
      this.save(events);
      if (patch.needsReview !== undefined) queue("stat_events", next.uid, "review");
      return next;
    },
    void(id: number, reason: string | null = null): LSStatEvent | null {
      const events = this.list();
      const idx = events.findIndex(e => e.id === id);
      if (idx === -1) return null;
      if (events[idx].voidedAt) return events[idx];
      events[idx] = { ...events[idx], voidedAt: new Date().toISOString(), voidReason: reason };
      this.save(events);
      queue("stat_events", events[idx].uid, "void");
      return events[idx];
    },
    /** Void `id` and record a corrected copy in its place. */
    replace(id: number, changes: Partial<Pick<LSStatEvent, "teamId" | "playerId" | "eventType" | "period" | "clockSeconds" | "value" | "shotZone" | "shotX" | "shotY" | "needsReview">>): LSStatEvent | null {
      const target = this.get(id);
      if (!target || target.voidedAt) return null;
      this.void(id, "corrected");
      return this.create({
        gameId: target.gameId,
        teamId: target.teamId,
        playerId: target.playerId,
        period: target.period,
        clockSeconds: target.clockSeconds,
        eventType: target.eventType,
        value: target.value,
        shotZone: target.shotZone,
        shotX: target.shotX,
        shotY: target.shotY,
        ftSequenceIndex: target.ftSequenceIndex,
        ftSequenceTotal: target.ftSequenceTotal,
        possessionTeamId: target.possessionTeamId,
        pairEventId: target.pairEventId,
        needsReview: target.needsReview,
        ...changes,
        orderKey: target.orderKey,
        replacesId: target.id,
        createdAt: target.createdAt,
      });
    },
  },

  playByPlay: {
    list(): LSPlayByPlay[] { return load<LSPlayByPlay[]>("playByPlay", []); },
    save(pbp: LSPlayByPlay[]) { save("playByPlay", pbp); },
    forGame(gameId: number) { return this.list().filter(p => p.gameId === gameId); },
    create(input: CreatePbpInput): LSPlayByPlay {
      const now = new Date().toISOString();
      const id = nextId("pbp");
      const entry: LSPlayByPlay = {
        ...input,
        id,
        createdAt: now,
      };
      const pbp = this.list();
      pbp.push(entry);
      this.save(pbp);
      return entry;
    },
    deleteByStatEventId(statEventId: number) {
      const pbp = this.list();
      const filtered = pbp.filter(p => p.statEventId !== statEventId);
      this.save(filtered);
    },
    deleteForGame(gameId: number) {
      const pbp = this.list();
      this.save(pbp.filter(p => p.gameId !== gameId));
    },
  },
};

async function hydrateOnce(): Promise<void> {
  const stored = await readAll();
  if (stored.size === 0) {
    // First run on IndexedDB: carry over anything saved by the old localStorage store.
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(NS)) {
        const v = localStorage.getItem(k);
        if (v != null) {
          mem.set(k, v);
          scheduleWrite(k, v);
        }
      }
    }
  } else {
    for (const [k, v] of stored) mem.set(k, v);
  }
  hydrated = true;
  backfill();
  await flush();
  // The old copy is safely in IndexedDB now.
  Object.keys(localStorage).filter(k => k.startsWith(NS)).forEach(k => localStorage.removeItem(k));
}

export function isHydrated() {
  return hydrated;
}

// Bring rows saved by older versions up to the current shape.
function backfill() {
  const fix = <T extends { uid?: string }>(name: string, extra?: (row: T) => void) => {
    const rows = load<T[]>(name, []);
    let changed = false;
    for (const r of rows) {
      if (!r.uid) { r.uid = uuid(); changed = true; }
      if (extra) { const before = JSON.stringify(r); extra(r); if (JSON.stringify(r) !== before) changed = true; }
    }
    if (changed) save(name, rows);
  };
  fix<LSLeague>("leagues", r => { if (!r.role) r.role = "admin"; });
  fix<LSGame>("games");
  fix<LSTeam>("teams");
  fix<LSPlayer>("players");
  fix<LSStatEvent>("statEvents", r => {
    if (r.orderKey == null) r.orderKey = r.id;
    if (r.shotZone === undefined) r.shotZone = null;
    if (r.shotX === undefined) r.shotX = null;
    if (r.shotY === undefined) r.shotY = null;
    if (r.replacesId === undefined) r.replacesId = null;
    if (r.voidedAt === undefined) r.voidedAt = null;
    if (r.voidReason === undefined) r.voidReason = null;
  });
  // The old REST replay queue is replaced by the outbox.
  for (const legacy of ["syncQueue", "idMap:game", "idMap:team", "idMap:player", "idMap:statEvent"]) {
    if (mem.has(key(legacy))) { mem.delete(key(legacy)); scheduleWrite(key(legacy), null); }
  }
}
