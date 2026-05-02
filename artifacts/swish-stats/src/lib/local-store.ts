const NS = "swish-stats:v1";

function key(name: string) {
  return `${NS}:${name}`;
}

function load<T>(name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key(name));
    if (raw == null) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function save(name: string, value: unknown) {
  localStorage.setItem(key(name), JSON.stringify(value));
}

export type LSGame = {
  id: number;
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
  createdAt: string;
  updatedAt: string;
};

export type LSTeam = {
  id: number;
  gameId: number;
  name: string;
  abbreviation: string;
  colorPrimary: string;
  colorSecondary: string;
  logoUrl: string | null;
  isHome: boolean;
  createdAt: string;
};

export type LSPlayer = {
  id: number;
  teamId: number;
  jerseyNumber: string;
  firstName: string;
  lastName: string;
  position: string | null;
  headshotUrl: string | null;
  isActive: boolean;
  isStarter: boolean;
  createdAt: string;
};

export type LSStatEvent = {
  id: number;
  gameId: number;
  teamId: number | null;
  playerId: number | null;
  period: number;
  clockSeconds: number;
  eventType: string;
  value: number;
  ftSequenceIndex: number | null;
  ftSequenceTotal: number | null;
  possessionTeamId: number | null;
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
  createdAt: string;
};

export type SyncEntityKind = "game" | "team" | "player" | "statEvent";

export type SyncQueueItem = {
  id: number;
  method: "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  body: unknown;
  entity: SyncEntityKind | null;
  localId: number | null;
  status: "pending" | "syncing" | "synced" | "failed";
  attempts: number;
  lastError: string | null;
  createdAt: string;
  syncedAt: string | null;
};

export type IdMap = Record<string, number>;

type Counters = {
  game: number;
  team: number;
  player: number;
  statEvent: number;
  pbp: number;
  syncQueue: number;
};

function getCounters(): Counters {
  return load<Counters>("counters", { game: 0, team: 0, player: 0, statEvent: 0, pbp: 0, syncQueue: 0 });
}

function saveCounters(c: Counters) {
  save("counters", c);
}

function nextId(field: keyof Counters): number {
  const c = getCounters();
  c[field] += 1;
  saveCounters(c);
  return c[field];
}

// ------- Game create input -------
type CreateGameInput = Partial<Omit<LSGame, "id" | "createdAt" | "updatedAt">>;

// ------- Stat event create input -------
type CreateStatEventInput = Omit<LSStatEvent, "id" | "createdAt">;

// ------- Play-by-play create input -------
type CreatePbpInput = Omit<LSPlayByPlay, "id" | "createdAt">;

// ------- Player create input -------
type CreatePlayerInput = Omit<LSPlayer, "id" | "createdAt">;

// ------- Team create input -------
type CreateTeamInput = Omit<LSTeam, "id" | "createdAt">;

export const store = {
  reset() {
    const allKeys = Object.keys(localStorage).filter(k => k.startsWith(NS));
    allKeys.forEach(k => localStorage.removeItem(k));
  },

  syncQueue: {
    list(): SyncQueueItem[] { return load<SyncQueueItem[]>("syncQueue", []); },
    save(items: SyncQueueItem[]) { save("syncQueue", items); },
    pendingCount(): number {
      return this.list().filter(i => i.status === "pending" || i.status === "failed").length;
    },
    nextPending(): SyncQueueItem | null {
      // Drain in insertion order to preserve causality (e.g. create game before its teams)
      const items = this.list();
      const sorted = items.slice().sort((a, b) => a.id - b.id);
      return sorted.find(i => i.status === "pending" || i.status === "failed") ?? null;
    },
    enqueue(input: Omit<SyncQueueItem, "id" | "createdAt" | "status" | "attempts" | "lastError" | "syncedAt">): SyncQueueItem {
      const id = nextId("syncQueue");
      const item: SyncQueueItem = {
        ...input,
        id,
        status: "pending",
        attempts: 0,
        lastError: null,
        createdAt: new Date().toISOString(),
        syncedAt: null,
      };
      const items = this.list();
      items.push(item);
      this.save(items);
      return item;
    },
    update(id: number, data: Partial<SyncQueueItem>) {
      const items = this.list();
      const idx = items.findIndex(i => i.id === id);
      if (idx === -1) return null;
      items[idx] = { ...items[idx], ...data, id };
      this.save(items);
      return items[idx];
    },
    clearSynced() {
      const items = this.list().filter(i => i.status !== "synced");
      this.save(items);
    },
  },

  idMap: {
    get(kind: SyncEntityKind): IdMap {
      return load<IdMap>(`idMap:${kind}`, {});
    },
    set(kind: SyncEntityKind, localId: number, remoteId: number) {
      const map = this.get(kind);
      map[String(localId)] = remoteId;
      save(`idMap:${kind}`, map);
    },
    translate(kind: SyncEntityKind, localId: number): number | null {
      const map = this.get(kind);
      const remote = map[String(localId)];
      return typeof remote === "number" ? remote : null;
    },
  },

  games: {
    list(): LSGame[] { return load<LSGame[]>("games", []); },
    save(games: LSGame[]) { save("games", games); },
    get(id: number) { return this.list().find(g => g.id === id) ?? null; },
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
        createdAt: now,
        updatedAt: now,
      };
      const games = this.list();
      games.push(game);
      this.save(games);
      return game;
    },
    update(id: number, data: Partial<LSGame>): LSGame | null {
      const games = this.list();
      const idx = games.findIndex(g => g.id === id);
      if (idx === -1) return null;
      games[idx] = { ...games[idx], ...data, id, updatedAt: new Date().toISOString() };
      this.save(games);
      return games[idx];
    },
  },

  teams: {
    list(): LSTeam[] { return load<LSTeam[]>("teams", []); },
    save(teams: LSTeam[]) { save("teams", teams); },
    forGame(gameId: number) { return this.list().filter(t => t.gameId === gameId); },
    get(id: number) { return this.list().find(t => t.id === id) ?? null; },
    create(input: CreateTeamInput): LSTeam {
      const now = new Date().toISOString();
      const id = nextId("team");
      const team: LSTeam = {
        ...input,
        id,
        createdAt: now,
      };
      const teams = this.list();
      teams.push(team);
      this.save(teams);
      return team;
    },
    update(id: number, data: Partial<LSTeam>): LSTeam | null {
      const teams = this.list();
      const idx = teams.findIndex(t => t.id === id);
      if (idx === -1) return null;
      teams[idx] = { ...teams[idx], ...data, id };
      this.save(teams);
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
    create(input: CreatePlayerInput): LSPlayer {
      const now = new Date().toISOString();
      const id = nextId("player");
      const player: LSPlayer = {
        ...input,
        id,
        createdAt: now,
      };
      const players = this.list();
      players.push(player);
      this.save(players);
      return player;
    },
    update(id: number, data: Partial<LSPlayer>): LSPlayer | null {
      const players = this.list();
      const idx = players.findIndex(p => p.id === id);
      if (idx === -1) return null;
      players[idx] = { ...players[idx], ...data, id };
      this.save(players);
      return players[idx];
    },
    delete(id: number): boolean {
      const players = this.list();
      const idx = players.findIndex(p => p.id === id);
      if (idx === -1) return false;
      players.splice(idx, 1);
      this.save(players);
      return true;
    },
  },

  statEvents: {
    list(): LSStatEvent[] { return load<LSStatEvent[]>("statEvents", []); },
    save(events: LSStatEvent[]) { save("statEvents", events); },
    forGame(gameId: number) { return this.list().filter(e => e.gameId === gameId); },
    get(id: number) { return this.list().find(e => e.id === id) ?? null; },
    create(input: CreateStatEventInput): LSStatEvent {
      const now = new Date().toISOString();
      const id = nextId("statEvent");
      const event: LSStatEvent = {
        ...input,
        id,
        createdAt: now,
      };
      const events = this.list();
      events.push(event);
      this.save(events);
      return event;
    },
    update(id: number, patch: Partial<LSStatEvent>): LSStatEvent | null {
      const events = this.list();
      const idx = events.findIndex(e => e.id === id);
      if (idx === -1) return null;
      const next = { ...events[idx], ...patch };
      events[idx] = next;
      this.save(events);
      return next;
    },
    delete(id: number): boolean {
      const events = this.list();
      const idx = events.findIndex(e => e.id === id);
      if (idx === -1) return false;
      events.splice(idx, 1);
      this.save(events);
      return true;
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
