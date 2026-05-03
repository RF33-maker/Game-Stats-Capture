import { store, type LSGame, type LSStatEvent } from "./local-store";
import { computePossessionEffect, applyScoreDelta, describeEvent } from "./local-possession";

type HandlerResult = { status: number; body: unknown };

function ok(body: unknown, status = 200): HandlerResult {
  return { status, body };
}

function notFound(msg = "Not found"): HandlerResult {
  return { status: 404, body: { error: msg } };
}

function badRequest(msg: string): HandlerResult {
  return { status: 400, body: { error: msg } };
}

function emptyStatLine(player: { id: number; teamId: number; firstName: string; lastName: string; jerseyNumber: string }) {
  return {
    playerId: player.id,
    firstName: player.firstName,
    lastName: player.lastName,
    jerseyNumber: player.jerseyNumber,
    teamId: player.teamId,
    points: 0,
    fgMade: 0,
    fgAttempted: 0,
    twoPtMade: 0,
    twoPtAttempted: 0,
    threePtMade: 0,
    threePtAttempted: 0,
    ftMade: 0,
    ftAttempted: 0,
    offensiveRebounds: 0,
    defensiveRebounds: 0,
    totalRebounds: 0,
    assists: 0,
    steals: 0,
    turnovers: 0,
    blocks: 0,
    personalFouls: 0,
    technicalFouls: 0,
    flagrantFouls: 0,
  };
}

type StatLine = ReturnType<typeof emptyStatLine>;

function applyEvent(line: StatLine, ev: LSStatEvent): void {
  switch (ev.eventType) {
    case "2ptm": line.points += 2; line.twoPtMade += 1; line.twoPtAttempted += 1; line.fgMade += 1; line.fgAttempted += 1; break;
    case "2pta": case "2ptb": line.twoPtAttempted += 1; line.fgAttempted += 1; break;
    case "3ptm": line.points += 3; line.threePtMade += 1; line.threePtAttempted += 1; line.fgMade += 1; line.fgAttempted += 1; break;
    case "3pta": case "3ptb": line.threePtAttempted += 1; line.fgAttempted += 1; break;
    case "ftm": line.points += 1; line.ftMade += 1; line.ftAttempted += 1; break;
    case "fta": line.ftAttempted += 1; break;
    case "oreb": line.offensiveRebounds += 1; line.totalRebounds += 1; break;
    case "dreb": line.defensiveRebounds += 1; line.totalRebounds += 1; break;
    case "ast": line.assists += 1; break;
    case "stl": line.steals += 1; break;
    case "tov": line.turnovers += 1; break;
    case "blk": line.blocks += 1; break;
    case "pf": line.personalFouls += 1; break;
    case "tf": line.technicalFouls += 1; break;
    case "flagrant": line.flagrantFouls += 1; break;
  }
}

function teamTotals(lines: StatLine[], teamId: number): StatLine {
  const total = emptyStatLine({ id: 0, teamId, firstName: "Team", lastName: "Total", jerseyNumber: "—" });
  for (const l of lines) {
    total.points += l.points;
    total.fgMade += l.fgMade;
    total.fgAttempted += l.fgAttempted;
    total.twoPtMade += l.twoPtMade;
    total.twoPtAttempted += l.twoPtAttempted;
    total.threePtMade += l.threePtMade;
    total.threePtAttempted += l.threePtAttempted;
    total.ftMade += l.ftMade;
    total.ftAttempted += l.ftAttempted;
    total.offensiveRebounds += l.offensiveRebounds;
    total.defensiveRebounds += l.defensiveRebounds;
    total.totalRebounds += l.totalRebounds;
    total.assists += l.assists;
    total.steals += l.steals;
    total.turnovers += l.turnovers;
    total.blocks += l.blocks;
    total.personalFouls += l.personalFouls;
    total.technicalFouls += l.technicalFouls;
    total.flagrantFouls += l.flagrantFouls;
  }
  return total;
}

function rebuildPlayByPlay(gameId: number): void {
  const game = store.games.get(gameId);
  if (!game) return;

  const teams = store.teams.forGame(gameId);
  const home = teams.find(t => t.isHome);
  const away = teams.find(t => !t.isHome);
  if (!home || !away) return;

  const players = store.players.forGame(gameId);
  const playerMap = new Map(players.map(p => [p.id, p]));
  const teamMap = new Map(teams.map(t => [t.id, t]));

  const events = store.statEvents.forGame(gameId).sort((a, b) => a.id - b.id);

  store.playByPlay.deleteForGame(gameId);

  let homeScore = 0;
  let awayScore = 0;
  let possessionTeamId: number | null = null;

  for (const ev of events) {
    const effect = computePossessionEffect({
      eventType: ev.eventType,
      eventTeamId: ev.teamId,
      ftSequenceIndex: ev.ftSequenceIndex,
      ftSequenceTotal: ev.ftSequenceTotal,
      homeTeamId: home.id,
      awayTeamId: away.id,
      currentPossessionTeamId: possessionTeamId,
    });

    const next = applyScoreDelta(effect.scoreDelta, ev.teamId, home.id, homeScore, awayScore);
    homeScore = next.homeScore;
    awayScore = next.awayScore;

    const team = ev.teamId ? (teamMap.get(ev.teamId) ?? null) : null;
    const player = ev.playerId ? (playerMap.get(ev.playerId) ?? null) : null;

    const eventText = describeEvent({
      eventType: ev.eventType,
      team,
      player,
      period: ev.period,
      clockSeconds: ev.clockSeconds,
      ftSequenceIndex: ev.ftSequenceIndex,
      ftSequenceTotal: ev.ftSequenceTotal,
    });

    store.playByPlay.create({
      gameId,
      statEventId: ev.id,
      teamId: ev.teamId,
      playerId: ev.playerId,
      period: ev.period,
      clockSeconds: ev.clockSeconds,
      possessionTeamId,
      possessionEnded: effect.possessionEnded ? "true" : "false",
      homeScore,
      awayScore,
      eventText,
    });

    if (effect.nextPossessionTeamId !== undefined) {
      possessionTeamId = effect.nextPossessionTeamId;
    }
  }

  store.games.update(gameId, { possessionTeamId });
}

function buildBoxScore(gameId: number): HandlerResult {
  const game = store.games.get(gameId);
  if (!game) return notFound("Game not found");

  const teams = store.teams.forGame(gameId);
  const home = teams.find(t => t.isHome);
  const away = teams.find(t => !t.isHome);
  if (!home || !away) return badRequest("Game must have both home and away teams");

  const allPlayers = store.players.forGame(gameId);
  const events = store.statEvents.forGame(gameId);

  const lineByPlayer = new Map<number, StatLine>();
  for (const p of allPlayers) {
    lineByPlayer.set(p.id, emptyStatLine(p));
  }
  for (const ev of events) {
    if (ev.playerId == null) continue;
    const line = lineByPlayer.get(ev.playerId);
    if (!line) continue;
    applyEvent(line, ev);
  }

  const pbpRows = store.playByPlay.forGame(gameId).sort((a, b) => a.id - b.id);
  const possessionsForTeam = (teamId: number) => pbpRows.filter(r => r.possessionTeamId === teamId).length;

  const lastPbp = pbpRows[pbpRows.length - 1];
  const homePoints = lastPbp?.homeScore ?? 0;
  const awayPoints = lastPbp?.awayScore ?? 0;

  const buildTeam = (team: typeof home, totalPoints: number) => {
    const lines = allPlayers
      .filter(p => p.teamId === team.id)
      .map(p => lineByPlayer.get(p.id)!)
      .filter(Boolean);
    return {
      teamId: team.id,
      name: team.name,
      abbreviation: team.abbreviation,
      isHome: team.isHome,
      totalPoints,
      possessions: possessionsForTeam(team.id),
      players: lines,
      teamTotals: teamTotals(lines, team.id),
    };
  };

  return ok({ gameId, home: buildTeam(home, homePoints), away: buildTeam(away, awayPoints) });
}

function seedSampleGame(): HandlerResult {
  const now = new Date().toISOString();
  const game = store.games.create({
    competition: "Sample League",
    venue: "Replit Arena",
    captureMode: "complex",
    periodCount: 4,
    periodDurationMins: 10,
    clockSeconds: 600,
    status: "active",
    date: now,
  });

  const home = store.teams.create({
    gameId: game.id,
    name: "Replit Hawks",
    abbreviation: "RHK",
    colorPrimary: "#f26207",
    colorSecondary: "#0a0a0a",
    isHome: true,
    logoUrl: null,
  });
  const away = store.teams.create({
    gameId: game.id,
    name: "Pixel Pacers",
    abbreviation: "PXP",
    colorPrimary: "#005bb5",
    colorSecondary: "#fde047",
    isHome: false,
    logoUrl: null,
  });

  const positions = ["G", "G", "F", "F", "C", "G", "F", "G"];

  const homeNames = [
    { first: "Marcus", last: "Williams" },
    { first: "DeShawn", last: "Taylor" },
    { first: "Jordan", last: "Carter" },
    { first: "Tre", last: "Robinson" },
    { first: "Malik", last: "Johnson" },
    { first: "Chris", last: "Davis" },
    { first: "Andre", last: "Brown" },
    { first: "Kevin", last: "White" },
  ];
  const awayNames = [
    { first: "Jaylen", last: "Thompson" },
    { first: "Darius", last: "Harris" },
    { first: "Isaiah", last: "Martin" },
    { first: "Cameron", last: "Lee" },
    { first: "Bryce", last: "Wilson" },
    { first: "Elijah", last: "Moore" },
    { first: "Xavier", last: "Jackson" },
    { first: "Zion", last: "Anderson" },
  ];

  const homePlayers = homeNames.map((n, i) =>
    store.players.create({
      teamId: home.id,
      jerseyNumber: String(i + 4),
      firstName: n.first,
      lastName: n.last,
      position: positions[i],
      isStarter: i < 5,
      headshotUrl: null,
      isActive: true,
    })
  );
  const awayPlayers = awayNames.map((n, i) =>
    store.players.create({
      teamId: away.id,
      jerseyNumber: String(i + 4),
      firstName: n.first,
      lastName: n.last,
      position: positions[i],
      isStarter: i < 5,
      headshotUrl: null,
      isActive: true,
    })
  );

  const homeStarters = homePlayers.slice(0, 5);
  const awayStarters = awayPlayers.slice(0, 5);

  const sampleEvents: Array<{
    teamId: number;
    playerId: number;
    eventType: string;
    value: number;
    clockSeconds: number;
    ftSeqIdx?: number;
    ftSeqTotal?: number;
  }> = [
    { teamId: home.id, playerId: homeStarters[0].id, eventType: "2ptm", value: 2, clockSeconds: 575 },
    { teamId: away.id, playerId: awayStarters[1].id, eventType: "2ptm", value: 2, clockSeconds: 555 },
    { teamId: home.id, playerId: homeStarters[2].id, eventType: "3ptm", value: 3, clockSeconds: 540 },
    { teamId: away.id, playerId: awayStarters[0].id, eventType: "3pta", value: 0, clockSeconds: 520 },
    { teamId: home.id, playerId: homeStarters[4].id, eventType: "dreb", value: 0, clockSeconds: 518 },
    { teamId: home.id, playerId: homeStarters[1].id, eventType: "ast", value: 0, clockSeconds: 510 },
    { teamId: home.id, playerId: homeStarters[3].id, eventType: "2ptm", value: 2, clockSeconds: 502 },
    { teamId: away.id, playerId: awayStarters[2].id, eventType: "tov", value: 0, clockSeconds: 490 },
    { teamId: home.id, playerId: homeStarters[0].id, eventType: "stl", value: 0, clockSeconds: 490 },
    { teamId: home.id, playerId: homeStarters[0].id, eventType: "ftm", value: 1, clockSeconds: 480, ftSeqIdx: 1, ftSeqTotal: 2 },
    { teamId: home.id, playerId: homeStarters[0].id, eventType: "ftm", value: 1, clockSeconds: 480, ftSeqIdx: 2, ftSeqTotal: 2 },
    { teamId: away.id, playerId: awayStarters[3].id, eventType: "2ptm", value: 2, clockSeconds: 460 },
    { teamId: away.id, playerId: awayStarters[4].id, eventType: "oreb", value: 0, clockSeconds: 445 },
    { teamId: away.id, playerId: awayStarters[1].id, eventType: "3ptm", value: 3, clockSeconds: 440 },
    { teamId: home.id, playerId: homeStarters[2].id, eventType: "blk", value: 0, clockSeconds: 425 },
    { teamId: home.id, playerId: homeStarters[4].id, eventType: "dreb", value: 0, clockSeconds: 424 },
    { teamId: home.id, playerId: homeStarters[3].id, eventType: "2ptm", value: 2, clockSeconds: 410 },
    { teamId: away.id, playerId: awayStarters[0].id, eventType: "pf", value: 0, clockSeconds: 395 },
    { teamId: home.id, playerId: homeStarters[1].id, eventType: "ftm", value: 1, clockSeconds: 390, ftSeqIdx: 1, ftSeqTotal: 2 },
    { teamId: home.id, playerId: homeStarters[1].id, eventType: "fta", value: 0, clockSeconds: 390, ftSeqIdx: 2, ftSeqTotal: 2 },
    { teamId: away.id, playerId: awayStarters[4].id, eventType: "dreb", value: 0, clockSeconds: 388 },
    { teamId: away.id, playerId: awayStarters[3].id, eventType: "2ptm", value: 2, clockSeconds: 370 },
  ];

  for (const ev of sampleEvents) {
    const currentGame = store.games.get(game.id)!;
    const effect = computePossessionEffect({
      eventType: ev.eventType,
      eventTeamId: ev.teamId,
      ftSequenceIndex: ev.ftSeqIdx ?? null,
      ftSequenceTotal: ev.ftSeqTotal ?? null,
      homeTeamId: home.id,
      awayTeamId: away.id,
      currentPossessionTeamId: currentGame.possessionTeamId,
    });

    const pbpRows = store.playByPlay.forGame(game.id).sort((a, b) => a.id - b.id);
    const lastPbp = pbpRows[pbpRows.length - 1];
    const prevHome = lastPbp?.homeScore ?? 0;
    const prevAway = lastPbp?.awayScore ?? 0;
    const { homeScore, awayScore } = applyScoreDelta(effect.scoreDelta, ev.teamId, home.id, prevHome, prevAway);

    const statEvent = store.statEvents.create({
      gameId: game.id,
      teamId: ev.teamId,
      playerId: ev.playerId,
      period: 1,
      clockSeconds: ev.clockSeconds,
      eventType: ev.eventType,
      value: ev.value,
      ftSequenceIndex: ev.ftSeqIdx ?? null,
      ftSequenceTotal: ev.ftSeqTotal ?? null,
      possessionTeamId: currentGame.possessionTeamId,
    });

    const team = [home, away].find(t => t.id === ev.teamId) ?? null;
    const player = [...homePlayers, ...awayPlayers].find(p => p.id === ev.playerId) ?? null;

    const eventText = describeEvent({
      eventType: ev.eventType,
      team,
      player,
      period: 1,
      clockSeconds: ev.clockSeconds,
      ftSequenceIndex: ev.ftSeqIdx ?? null,
      ftSequenceTotal: ev.ftSeqTotal ?? null,
    });

    store.playByPlay.create({
      gameId: game.id,
      statEventId: statEvent.id,
      teamId: ev.teamId,
      playerId: ev.playerId,
      period: 1,
      clockSeconds: ev.clockSeconds,
      possessionTeamId: currentGame.possessionTeamId,
      possessionEnded: effect.possessionEnded ? "true" : "false",
      homeScore,
      awayScore,
      eventText,
    });

    if (effect.nextPossessionTeamId !== undefined) {
      store.games.update(game.id, { possessionTeamId: effect.nextPossessionTeamId });
    }
  }

  store.games.update(game.id, { clockSeconds: 370, currentPeriod: 1 });

  return ok(store.games.get(game.id), 201);
}

// URL pattern matching
const patterns = {
  listGames: /^\/api\/games$/,
  createGame: /^\/api\/games$/,
  getGame: /^\/api\/games\/(\d+)$/,
  updateGame: /^\/api\/games\/(\d+)$/,
  updateClock: /^\/api\/games\/(\d+)\/clock$/,
  listTeams: /^\/api\/games\/(\d+)\/teams$/,
  createTeam: /^\/api\/games\/(\d+)\/teams$/,
  updateTeam: /^\/api\/teams\/(\d+)$/,
  listGamePlayers: /^\/api\/games\/(\d+)\/players$/,
  createPlayer: /^\/api\/teams\/(\d+)\/players$/,
  updatePlayer: /^\/api\/players\/(\d+)$/,
  deletePlayer: /^\/api\/players\/(\d+)$/,
  listStatEvents: /^\/api\/games\/(\d+)\/stats$/,
  recordStatEvent: /^\/api\/games\/(\d+)\/stats$/,
  deleteStatEvent: /^\/api\/stats\/(\d+)$/,
  listPlayByPlay: /^\/api\/games\/(\d+)\/play-by-play$/,
  getBoxScore: /^\/api\/games\/(\d+)\/box-score$/,
  getPossessions: /^\/api\/games\/(\d+)\/possessions$/,
  seed: /^\/api\/seed$/,
  health: /^\/api\/healthz$/,
};

export async function handleLocalRequest(
  method: string,
  path: string,
  body: unknown,
): Promise<HandlerResult> {
  // Strip query string
  const pathname = path.split("?")[0];
  const m = method.toUpperCase();
  let match: RegExpMatchArray | null;

  // Health check
  if (m === "GET" && patterns.health.test(pathname)) {
    return ok({ status: "ok (local mode)" });
  }

  // Seed
  if (m === "POST" && patterns.seed.test(pathname)) {
    return seedSampleGame();
  }

  // List games
  if (m === "GET" && patterns.listGames.test(pathname)) {
    return ok(store.games.list());
  }

  // Create game
  if (m === "POST" && patterns.createGame.test(pathname)) {
    const data = (body ?? {}) as Partial<LSGame>;
    const now = new Date().toISOString();
    const periodDuration = typeof data.periodDurationMins === "number" ? data.periodDurationMins : 10;
    const game = store.games.create({
      competition: (data as { competition?: string }).competition ?? null,
      venue: (data as { venue?: string }).venue ?? null,
      date: (data as { date?: string }).date ?? now,
      captureMode: (data as { captureMode?: "simple" | "complex" }).captureMode ?? "complex",
      periodCount: typeof (data as { periodCount?: number }).periodCount === "number" ? (data as { periodCount?: number }).periodCount : 4,
      periodDurationMins: periodDuration,
      clockSeconds: periodDuration * 60,
    });
    return ok(game, 201);
  }

  // Get game
  match = pathname.match(/^\/api\/games\/(\d+)$/);
  if (m === "GET" && match) {
    const gameId = Number(match[1]);
    const game = store.games.get(gameId);
    if (!game) return notFound("Game not found");
    return ok(game);
  }

  // Update game
  match = pathname.match(/^\/api\/games\/(\d+)$/);
  if ((m === "PATCH" || m === "PUT") && match) {
    const gameId = Number(match[1]);
    const data = (body ?? {}) as Partial<LSGame>;
    const updated = store.games.update(gameId, data);
    if (!updated) return notFound("Game not found");
    return ok(updated);
  }

  // Update clock
  match = pathname.match(/^\/api\/games\/(\d+)\/clock$/);
  if ((m === "PATCH" || m === "PUT") && match) {
    const gameId = Number(match[1]);
    const data = (body ?? {}) as { clockSeconds?: number; currentPeriod?: number };
    const updated = store.games.update(gameId, {
      ...(data.clockSeconds !== undefined ? { clockSeconds: data.clockSeconds } : {}),
      ...(data.currentPeriod !== undefined ? { currentPeriod: data.currentPeriod } : {}),
    });
    if (!updated) return notFound("Game not found");
    return ok(updated);
  }

  // List teams
  match = pathname.match(/^\/api\/games\/(\d+)\/teams$/);
  if (m === "GET" && match) {
    return ok(store.teams.forGame(Number(match[1])));
  }

  // Create team
  match = pathname.match(/^\/api\/games\/(\d+)\/teams$/);
  if (m === "POST" && match) {
    const gameId = Number(match[1]);
    const data = (body ?? {}) as Partial<{ name: string; abbreviation: string; colorPrimary: string; colorSecondary: string; logoUrl: string | null; isHome: boolean }>;
    const team = store.teams.create({
      gameId,
      name: data.name ?? "",
      abbreviation: data.abbreviation ?? "",
      colorPrimary: data.colorPrimary ?? "#ffffff",
      colorSecondary: data.colorSecondary ?? "#000000",
      logoUrl: data.logoUrl ?? null,
      isHome: data.isHome ?? false,
    });
    return ok(team, 201);
  }

  // Update team
  match = pathname.match(/^\/api\/teams\/(\d+)$/);
  if ((m === "PATCH" || m === "PUT") && match) {
    const teamId = Number(match[1]);
    const data = (body ?? {}) as Partial<{
      name: string;
      abbreviation: string;
      colorPrimary: string;
      colorSecondary: string;
      logoUrl: string | null;
      isHome: boolean;
    }>;
    const updated = store.teams.update(teamId, data);
    if (!updated) return notFound("Team not found");
    return ok(updated);
  }

  // List game players
  match = pathname.match(/^\/api\/games\/(\d+)\/players$/);
  if (m === "GET" && match) {
    return ok(store.players.forGame(Number(match[1])));
  }

  // Create player
  match = pathname.match(/^\/api\/teams\/(\d+)\/players$/);
  if (m === "POST" && match) {
    const teamId = Number(match[1]);
    const data = (body ?? {}) as Partial<{ jerseyNumber: string; firstName: string; lastName: string; position: string | null; headshotUrl: string | null; isStarter: boolean }>;
    const player = store.players.create({
      teamId,
      jerseyNumber: data.jerseyNumber ?? "",
      firstName: data.firstName ?? "",
      lastName: data.lastName ?? "",
      position: data.position ?? null,
      headshotUrl: data.headshotUrl ?? null,
      isStarter: data.isStarter ?? false,
      isActive: true,
    });
    return ok(player, 201);
  }

  // Update player
  match = pathname.match(/^\/api\/players\/(\d+)$/);
  if ((m === "PATCH" || m === "PUT") && match) {
    const playerId = Number(match[1]);
    const data = (body ?? {}) as Partial<{
      jerseyNumber: string;
      firstName: string;
      lastName: string;
      position: string | null;
      headshotUrl: string | null;
      isActive: boolean;
      isStarter: boolean;
    }>;
    const updated = store.players.update(playerId, data);
    if (!updated) return notFound("Player not found");
    return ok(updated);
  }

  // Delete player
  match = pathname.match(/^\/api\/players\/(\d+)$/);
  if (m === "DELETE" && match) {
    const playerId = Number(match[1]);
    const deleted = store.players.delete(playerId);
    if (!deleted) return notFound("Player not found");
    return { status: 204, body: null };
  }

  // List stat events — newest first so statEvents[0] is the latest (used by undo)
  match = pathname.match(/^\/api\/games\/(\d+)\/stats$/);
  if (m === "GET" && match) {
    const events = store.statEvents.forGame(Number(match[1])).sort((a, b) => b.id - a.id);
    return ok(events);
  }

  // Record stat event
  match = pathname.match(/^\/api\/games\/(\d+)\/stats$/);
  if (m === "POST" && match) {
    const gameId = Number(match[1]);
    const data = (body ?? {}) as {
      teamId?: number | null;
      playerId?: number | null;
      period: number;
      clockSeconds: number;
      eventType: string;
      value?: number;
      ftSequenceIndex?: number | null;
      ftSequenceTotal?: number | null;
    };

    const game = store.games.get(gameId);
    if (!game) return notFound("Game not found");

    const teams = store.teams.forGame(gameId);
    const home = teams.find(t => t.isHome);
    const away = teams.find(t => !t.isHome);
    if (!home || !away) return badRequest("Game must have both home and away teams");

    const effect = computePossessionEffect({
      eventType: data.eventType,
      eventTeamId: data.teamId ?? null,
      ftSequenceIndex: data.ftSequenceIndex ?? null,
      ftSequenceTotal: data.ftSequenceTotal ?? null,
      homeTeamId: home.id,
      awayTeamId: away.id,
      currentPossessionTeamId: game.possessionTeamId,
    });

    const pbpRows = store.playByPlay.forGame(gameId).sort((a, b) => a.id - b.id);
    const lastPbp = pbpRows[pbpRows.length - 1];
    const prevHome = lastPbp?.homeScore ?? 0;
    const prevAway = lastPbp?.awayScore ?? 0;
    const { homeScore, awayScore } = applyScoreDelta(effect.scoreDelta, data.teamId ?? null, home.id, prevHome, prevAway);

    const statEvent = store.statEvents.create({
      gameId,
      teamId: data.teamId ?? null,
      playerId: data.playerId ?? null,
      period: data.period,
      clockSeconds: data.clockSeconds,
      eventType: data.eventType,
      value: data.value ?? 0,
      ftSequenceIndex: data.ftSequenceIndex ?? null,
      ftSequenceTotal: data.ftSequenceTotal ?? null,
      possessionTeamId: game.possessionTeamId,
    });

    const team = data.teamId ? (teams.find(t => t.id === data.teamId) ?? null) : null;
    const player = data.playerId ? (store.players.get(data.playerId)) : null;

    const eventText = describeEvent({
      eventType: data.eventType,
      team,
      player,
      period: data.period,
      clockSeconds: data.clockSeconds,
      ftSequenceIndex: data.ftSequenceIndex ?? null,
      ftSequenceTotal: data.ftSequenceTotal ?? null,
    });

    const pbp = store.playByPlay.create({
      gameId,
      statEventId: statEvent.id,
      teamId: data.teamId ?? null,
      playerId: data.playerId ?? null,
      period: data.period,
      clockSeconds: data.clockSeconds,
      possessionTeamId: game.possessionTeamId,
      possessionEnded: effect.possessionEnded ? "true" : "false",
      homeScore,
      awayScore,
      eventText,
    });

    const gameUpdates: Partial<LSGame> = {
      clockSeconds: data.clockSeconds,
      currentPeriod: data.period,
    };
    if (effect.nextPossessionTeamId !== undefined) {
      gameUpdates.possessionTeamId = effect.nextPossessionTeamId;
    }
    const updatedGame = store.games.update(gameId, gameUpdates)!;

    return ok({ statEvent, playByPlay: pbp, game: updatedGame }, 201);
  }

  // Update stat event (correct an existing PBP entry)
  match = pathname.match(/^\/api\/stats\/(\d+)$/);
  if ((m === "PATCH" || m === "PUT") && match) {
    const statEventId = Number(match[1]);
    const target = store.statEvents.get(statEventId);
    if (!target) return notFound("Stat event not found");

    const data = (body ?? {}) as Partial<{
      teamId: number | null;
      playerId: number | null;
      eventType: string;
      period: number;
      clockSeconds: number;
      value: number;
    }>;

    const teams = store.teams.forGame(target.gameId);

    if (data.teamId !== undefined && data.teamId !== null) {
      if (!teams.some(t => t.id === data.teamId)) {
        return badRequest("teamId does not belong to this game");
      }
    }

    // Validate the effective post-patch state, so that changing teamId alone
    // still re-checks the existing playerId.
    const effectiveTeamId = data.teamId !== undefined ? data.teamId : target.teamId;
    const effectivePlayerId = data.playerId !== undefined ? data.playerId : target.playerId;

    if (effectivePlayerId != null) {
      const p = store.players.get(effectivePlayerId);
      if (!p) return notFound("Player not found");
      if (!teams.some(t => t.id === p.teamId)) {
        return badRequest("Player does not belong to this game");
      }
      if (effectiveTeamId == null) {
        return badRequest("Cannot clear teamId while a player is still assigned");
      }
      if (p.teamId !== effectiveTeamId) {
        return badRequest("Player does not belong to the given team");
      }
    }

    const patch: Partial<LSStatEvent> = {};
    if (data.teamId !== undefined) patch.teamId = data.teamId;
    if (data.playerId !== undefined) patch.playerId = data.playerId;
    if (data.eventType !== undefined) patch.eventType = data.eventType;
    if (data.period !== undefined) patch.period = data.period;
    if (data.clockSeconds !== undefined) patch.clockSeconds = data.clockSeconds;
    if (data.value !== undefined) patch.value = data.value;

    const updated = store.statEvents.update(statEventId, patch);
    if (!updated) return notFound("Stat event not found");

    rebuildPlayByPlay(target.gameId);
    return ok(updated);
  }

  // Delete stat event
  match = pathname.match(/^\/api\/stats\/(\d+)$/);
  if (m === "DELETE" && match) {
    const statEventId = Number(match[1]);
    const ev = store.statEvents.get(statEventId);
    if (!ev) return notFound("Stat event not found");
    const gameId = ev.gameId;

    store.statEvents.delete(statEventId);
    rebuildPlayByPlay(gameId);

    return { status: 204, body: null };
  }

  // List play-by-play (newest first to match server)
  match = pathname.match(/^\/api\/games\/(\d+)\/play-by-play$/);
  if (m === "GET" && match) {
    const pbp = store.playByPlay.forGame(Number(match[1])).sort((a, b) => b.id - a.id);
    return ok(pbp);
  }

  // Box score
  match = pathname.match(/^\/api\/games\/(\d+)\/box-score$/);
  if (m === "GET" && match) {
    return buildBoxScore(Number(match[1]));
  }

  // Possessions
  match = pathname.match(/^\/api\/games\/(\d+)\/possessions$/);
  if (m === "GET" && match) {
    const gameId = Number(match[1]);
    const game = store.games.get(gameId);
    if (!game) return notFound("Game not found");

    const teams = store.teams.forGame(gameId);
    const home = teams.find(t => t.isHome);
    const away = teams.find(t => !t.isHome);
    if (!home || !away) return badRequest("Game must have both home and away teams");

    const pbpRows = store.playByPlay.forGame(gameId);
    const homePossessions = pbpRows.filter(r => r.possessionTeamId === home.id).length;
    const awayPossessions = pbpRows.filter(r => r.possessionTeamId === away.id).length;

    return ok({
      gameId,
      currentPossessionTeamId: game.possessionTeamId ?? null,
      homeTeamId: home.id,
      awayTeamId: away.id,
      homePossessions,
      awayPossessions,
    });
  }

  // Auth bypass — return a synthetic local user.
  if (m === "GET" && pathname === "/api/auth/user") {
    return ok({
      user: {
        id: "local",
        email: "local@swish-stats.local",
        firstName: "Local",
        lastName: "Mode",
        profileImageUrl: null,
      },
    });
  }

  // Leagues bypass — pretend the local mode user has a single league.
  if (m === "GET" && pathname === "/api/leagues") {
    return ok([
      {
        id: 1,
        name: "Local Games",
        season: "Local Mode",
        logoUrl: null,
        ownerUserId: "local",
        viewerRole: "admin",
        createdAt: new Date().toISOString(),
      },
    ]);
  }
  if (m === "GET" && /^\/api\/leagues\/\d+$/.test(pathname)) {
    return ok({
      id: Number(pathname.split("/")[3]),
      name: "Local Games",
      season: "Local Mode",
      logoUrl: null,
      ownerUserId: "local",
      viewerRole: "admin",
      createdAt: new Date().toISOString(),
    });
  }
  if (m === "GET" && pathname === "/api/games") {
    return ok(store.games.list());
  }
  if (m === "GET" && /^\/api\/leagues\/\d+\/games$/.test(pathname)) {
    // Return ALL local games for the synthetic league.
    return ok(store.games.list());
  }
  if (m === "GET" && /^\/api\/leagues\/\d+\/members$/.test(pathname)) {
    return ok([
      {
        leagueId: Number(pathname.split("/")[3]),
        userId: "local",
        role: "admin",
        email: "local@swish-stats.local",
        firstName: "Local",
        lastName: "Mode",
        profileImageUrl: null,
        createdAt: new Date().toISOString(),
      },
    ]);
  }
  // Create a game inside a league — fall through to normal create flow.
  if (m === "POST" && /^\/api\/leagues\/\d+\/games$/.test(pathname)) {
    const created = store.games.create({
      leagueId: Number(pathname.split("/")[3]),
      ...(body as Record<string, unknown>),
    });
    return ok(created, 201);
  }

  return { status: 404, body: { error: `Local mode: no handler for ${m} ${pathname}` } };
}
