import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import {
  db,
  gamesTable,
  teamsTable,
  playersTable,
  statEventsTable,
  playByPlayTable,
  type Player,
  type StatEvent,
  type Team,
} from "@workspace/db";
import {
  GetBoxScoreParams,
  GetPossessionsParams,
  GetBoxScoreResponse,
  GetPossessionsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

type StatLine = {
  playerId: number;
  firstName: string;
  lastName: string;
  jerseyNumber: string;
  teamId: number;
  points: number;
  fgMade: number;
  fgAttempted: number;
  twoPtMade: number;
  twoPtAttempted: number;
  threePtMade: number;
  threePtAttempted: number;
  ftMade: number;
  ftAttempted: number;
  offensiveRebounds: number;
  defensiveRebounds: number;
  totalRebounds: number;
  assists: number;
  steals: number;
  turnovers: number;
  blocks: number;
  personalFouls: number;
  technicalFouls: number;
  flagrantFouls: number;
};

function emptyStatLine(player: Partial<Player> & { teamId: number }): StatLine {
  return {
    playerId: player.id ?? 0,
    firstName: player.firstName ?? "",
    lastName: player.lastName ?? "",
    jerseyNumber: player.jerseyNumber ?? "",
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

function applyEvent(line: StatLine, ev: StatEvent): void {
  switch (ev.eventType) {
    case "2ptm":
      line.points += 2;
      line.twoPtMade += 1;
      line.twoPtAttempted += 1;
      line.fgMade += 1;
      line.fgAttempted += 1;
      break;
    case "2pta":
    case "2ptb":
      line.twoPtAttempted += 1;
      line.fgAttempted += 1;
      break;
    case "3ptm":
      line.points += 3;
      line.threePtMade += 1;
      line.threePtAttempted += 1;
      line.fgMade += 1;
      line.fgAttempted += 1;
      break;
    case "3pta":
    case "3ptb":
      line.threePtAttempted += 1;
      line.fgAttempted += 1;
      break;
    case "ftm":
      line.points += 1;
      line.ftMade += 1;
      line.ftAttempted += 1;
      break;
    case "fta":
      line.ftAttempted += 1;
      break;
    case "oreb":
      line.offensiveRebounds += 1;
      line.totalRebounds += 1;
      break;
    case "dreb":
      line.defensiveRebounds += 1;
      line.totalRebounds += 1;
      break;
    case "ast":
      line.assists += 1;
      break;
    case "stl":
      line.steals += 1;
      break;
    case "tov":
      line.turnovers += 1;
      break;
    case "blk":
      line.blocks += 1;
      break;
    case "pf":
      line.personalFouls += 1;
      break;
    case "tf":
      line.technicalFouls += 1;
      break;
    case "flagrant":
      line.flagrantFouls += 1;
      break;
  }
}

function teamTotals(lines: StatLine[], teamId: number): StatLine {
  const total = emptyStatLine({ teamId });
  total.firstName = "Team";
  total.lastName = "Total";
  total.jerseyNumber = "—";
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

router.get("/games/:gameId/box-score", async (req, res): Promise<void> => {
  const params = GetBoxScoreParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const gameId = params.data.gameId;

  const [game] = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.id, gameId));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const teams = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.gameId, gameId));
  const home = teams.find((t) => t.isHome);
  const away = teams.find((t) => !t.isHome);
  if (!home || !away) {
    res.status(400).json({ error: "Game must have both home and away teams" });
    return;
  }

  const allPlayers = (
    await Promise.all(
      teams.map((t) =>
        db.select().from(playersTable).where(eq(playersTable.teamId, t.id)),
      ),
    )
  ).flat();

  const events = await db
    .select()
    .from(statEventsTable)
    .where(eq(statEventsTable.gameId, gameId));

  const lineByPlayer = new Map<number, StatLine>();
  for (const p of allPlayers) {
    lineByPlayer.set(p.id, emptyStatLine(p));
  }
  for (const ev of events) {
    if (ev.playerId == null) continue;
    let line = lineByPlayer.get(ev.playerId);
    if (!line) continue;
    applyEvent(line, ev);
  }

  const playByTeam = (team: Team) => {
    const lines = allPlayers
      .filter((p) => p.teamId === team.id)
      .map((p) => lineByPlayer.get(p.id)!)
      .filter(Boolean);
    return lines;
  };

  // Possession counts for each team
  const pbpRows = await db
    .select()
    .from(playByPlayTable)
    .where(eq(playByPlayTable.gameId, gameId))
    .orderBy(playByPlayTable.id);
  const possessionsForTeam = (teamId: number) =>
    pbpRows.filter(
      (r) => r.possessionEnded === "true" && r.possessionTeamId === teamId,
    ).length;

  // Total team scores from latest pbp row, falling back to summed events.
  const lastPbp = pbpRows[pbpRows.length - 1];
  const homePoints = lastPbp?.homeScore ?? 0;
  const awayPoints = lastPbp?.awayScore ?? 0;

  const buildTeam = (team: Team, totalPoints: number) => {
    const lines = playByTeam(team);
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

  const payload = {
    gameId,
    home: buildTeam(home, homePoints),
    away: buildTeam(away, awayPoints),
  };

  res.json(GetBoxScoreResponse.parse(payload));
});

router.get("/games/:gameId/possessions", async (req, res): Promise<void> => {
  const params = GetPossessionsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const gameId = params.data.gameId;

  const [game] = await db
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.id, gameId));
  if (!game) {
    res.status(404).json({ error: "Game not found" });
    return;
  }

  const teams = await db
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.gameId, gameId));
  const home = teams.find((t) => t.isHome);
  const away = teams.find((t) => !t.isHome);
  if (!home || !away) {
    res.status(400).json({ error: "Game must have both home and away teams" });
    return;
  }

  const pbpRows = await db
    .select()
    .from(playByPlayTable)
    .where(eq(playByPlayTable.gameId, gameId));

  const homePossessions = pbpRows.filter(
    (r) => r.possessionEnded === "true" && r.possessionTeamId === home.id,
  ).length;
  const awayPossessions = pbpRows.filter(
    (r) => r.possessionEnded === "true" && r.possessionTeamId === away.id,
  ).length;

  res.json(
    GetPossessionsResponse.parse({
      gameId,
      currentPossessionTeamId: game.possessionTeamId ?? null,
      homeTeamId: home.id,
      awayTeamId: away.id,
      homePossessions,
      awayPossessions,
    }),
  );
});

export default router;
