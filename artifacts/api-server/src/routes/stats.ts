import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import {
  db,
  gamesTable,
  teamsTable,
  playersTable,
  statEventsTable,
  playByPlayTable,
  type StatEventType,
  type Player,
} from "@workspace/db";
import {
  RecordStatEventBody,
  RecordStatEventParams,
  ListStatEventsParams,
  ListStatEventsResponse,
  DeleteStatEventParams,
  UpdateStatEventBody,
  UpdateStatEventParams,
} from "@workspace/api-zod";
import {
  computePossessionEffect,
  describeEvent,
  applyScoreDelta,
} from "../lib/possession";

const router: IRouter = Router();

router.get("/games/:gameId/stats", async (req, res): Promise<void> => {
  const params = ListStatEventsParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(statEventsTable)
    .where(eq(statEventsTable.gameId, params.data.gameId))
    .orderBy(asc(statEventsTable.createdAt));
  res.json(ListStatEventsResponse.parse(rows));
});

router.post("/games/:gameId/stats", async (req, res): Promise<void> => {
  const params = RecordStatEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = RecordStatEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const gameId = params.data.gameId;

  try {
    const result = await db.transaction(async (tx) => {
      const [game] = await tx
        .select()
        .from(gamesTable)
        .where(eq(gamesTable.id, gameId));
      if (!game) {
        throw new HttpError(404, "Game not found");
      }

      const teams = await tx
        .select()
        .from(teamsTable)
        .where(eq(teamsTable.gameId, gameId));
      const home = teams.find((t) => t.isHome);
      const away = teams.find((t) => !t.isHome);
      if (!home || !away) {
        throw new HttpError(400, "Game must have both home and away teams");
      }

      // Validate teamId belongs to this game.
      let team = null;
      if (parsed.data.teamId != null) {
        team = teams.find((t) => t.id === parsed.data.teamId) ?? null;
        if (!team) {
          throw new HttpError(400, "teamId does not belong to this game");
        }
      }

      // Validate player belongs to teamId (if both supplied) or to game.
      let player = null;
      if (parsed.data.playerId != null) {
        const [p] = await tx
          .select()
          .from(playersTable)
          .where(eq(playersTable.id, parsed.data.playerId));
        if (!p) {
          throw new HttpError(404, "Player not found");
        }
        const playerTeam = teams.find((t) => t.id === p.teamId);
        if (!playerTeam) {
          throw new HttpError(400, "Player does not belong to this game");
        }
        if (parsed.data.teamId != null && p.teamId !== parsed.data.teamId) {
          throw new HttpError(400, "Player does not belong to the given team");
        }
        player = p;
      }

      const eventType = parsed.data.eventType as StatEventType;

      const effect = computePossessionEffect({
        eventType,
        eventTeamId: parsed.data.teamId ?? null,
        ftSequenceIndex: parsed.data.ftSequenceIndex ?? null,
        ftSequenceTotal: parsed.data.ftSequenceTotal ?? null,
        homeTeamId: home.id,
        awayTeamId: away.id,
        currentPossessionTeamId: game.possessionTeamId,
      });

      // Compute new score from latest pbp row (deterministic order).
      const latest = await tx
        .select()
        .from(playByPlayTable)
        .where(eq(playByPlayTable.gameId, gameId))
        .orderBy(asc(playByPlayTable.id));
      const lastPbp = latest[latest.length - 1];
      const prevHome = lastPbp?.homeScore ?? 0;
      const prevAway = lastPbp?.awayScore ?? 0;
      const { homeScore, awayScore } = applyScoreDelta(
        effect.scoreDelta,
        parsed.data.teamId ?? null,
        home.id,
        prevHome,
        prevAway,
      );

      const [statEvent] = await tx
        .insert(statEventsTable)
        .values({
          gameId,
          teamId: parsed.data.teamId ?? null,
          playerId: parsed.data.playerId ?? null,
          period: parsed.data.period,
          clockSeconds: parsed.data.clockSeconds,
          eventType,
          value: parsed.data.value ?? 1,
          ftSequenceIndex: parsed.data.ftSequenceIndex ?? null,
          ftSequenceTotal: parsed.data.ftSequenceTotal ?? null,
          possessionTeamId: game.possessionTeamId ?? null,
        })
        .returning();

      const eventText = describeEvent({
        eventType,
        team,
        player,
        period: parsed.data.period,
        clockSeconds: parsed.data.clockSeconds,
        ftSequenceIndex: parsed.data.ftSequenceIndex ?? null,
        ftSequenceTotal: parsed.data.ftSequenceTotal ?? null,
      });

      const [pbp] = await tx
        .insert(playByPlayTable)
        .values({
          gameId,
          statEventId: statEvent.id,
          teamId: parsed.data.teamId ?? null,
          playerId: parsed.data.playerId ?? null,
          period: parsed.data.period,
          clockSeconds: parsed.data.clockSeconds,
          possessionTeamId: game.possessionTeamId ?? null,
          possessionEnded: effect.possessionEnded ? "true" : "false",
          homeScore,
          awayScore,
          eventText,
        })
        .returning();

      const gameUpdates: Record<string, number | null> = {
        clockSeconds: parsed.data.clockSeconds,
        currentPeriod: parsed.data.period,
      };
      if (effect.nextPossessionTeamId !== undefined) {
        gameUpdates.possessionTeamId = effect.nextPossessionTeamId;
      }
      const [updatedGame] = await tx
        .update(gamesTable)
        .set(gameUpdates)
        .where(eq(gamesTable.id, gameId))
        .returning();

      return { statEvent, playByPlay: pbp, game: updatedGame };
    });

    res.status(201).json(result);
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.patch("/stats/:statEventId", async (req, res): Promise<void> => {
  const params = UpdateStatEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateStatEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const statEventId = params.data.statEventId;

  try {
    const updated = await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(statEventsTable)
        .where(eq(statEventsTable.id, statEventId));
      if (!target) {
        throw new HttpError(404, "Stat event not found");
      }
      const gameId = target.gameId;

      const teams = await tx
        .select()
        .from(teamsTable)
        .where(eq(teamsTable.gameId, gameId));

      // Validate teamId if provided (must belong to this game).
      if (parsed.data.teamId !== undefined && parsed.data.teamId !== null) {
        const t = teams.find((x) => x.id === parsed.data.teamId);
        if (!t) {
          throw new HttpError(400, "teamId does not belong to this game");
        }
      }

      // Compute the effective post-patch state and validate it as a whole,
      // so that changing only teamId still re-checks the existing playerId.
      const effectiveTeamId =
        parsed.data.teamId !== undefined ? parsed.data.teamId : target.teamId;
      const effectivePlayerId =
        parsed.data.playerId !== undefined
          ? parsed.data.playerId
          : target.playerId;

      if (effectivePlayerId != null) {
        const [p] = await tx
          .select()
          .from(playersTable)
          .where(eq(playersTable.id, effectivePlayerId));
        if (!p) {
          throw new HttpError(404, "Player not found");
        }
        const playerTeam = teams.find((x) => x.id === p.teamId);
        if (!playerTeam) {
          throw new HttpError(400, "Player does not belong to this game");
        }
        if (effectiveTeamId == null) {
          throw new HttpError(
            400,
            "Cannot clear teamId while a player is still assigned",
          );
        }
        if (p.teamId !== effectiveTeamId) {
          throw new HttpError(
            400,
            "Player does not belong to the given team",
          );
        }
      }

      const updates: Partial<typeof statEventsTable.$inferInsert> = {};
      if (parsed.data.teamId !== undefined) updates.teamId = parsed.data.teamId;
      if (parsed.data.playerId !== undefined)
        updates.playerId = parsed.data.playerId;
      if (parsed.data.eventType !== undefined)
        updates.eventType = parsed.data.eventType as StatEventType;
      if (parsed.data.period !== undefined) updates.period = parsed.data.period;
      if (parsed.data.clockSeconds !== undefined)
        updates.clockSeconds = parsed.data.clockSeconds;
      if (parsed.data.value !== undefined) updates.value = parsed.data.value;

      const [next] = await tx
        .update(statEventsTable)
        .set(updates)
        .where(eq(statEventsTable.id, statEventId))
        .returning();

      // Rebuild pbp + scores + possession for the whole game.
      await rebuildPlayByPlay(tx, gameId);

      return next;
    });

    res.json(updated);
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

router.delete("/stats/:statEventId", async (req, res): Promise<void> => {
  const params = DeleteStatEventParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const statEventId = params.data.statEventId;

  try {
    await db.transaction(async (tx) => {
      const [target] = await tx
        .select()
        .from(statEventsTable)
        .where(eq(statEventsTable.id, statEventId));
      if (!target) {
        throw new HttpError(404, "Stat event not found");
      }
      const gameId = target.gameId;

      // Delete the pbp row(s) tied to this event and the event itself.
      await tx
        .delete(playByPlayTable)
        .where(eq(playByPlayTable.statEventId, statEventId));
      await tx
        .delete(statEventsTable)
        .where(eq(statEventsTable.id, statEventId));

      // Rebuild pbp scores + game possession by replaying remaining events.
      await rebuildPlayByPlay(tx, gameId);
    });

    res.sendStatus(204);
  } catch (err) {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    throw err;
  }
});

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

type DbLike = Parameters<Parameters<typeof db.transaction>[0]>[0] | typeof db;

async function rebuildPlayByPlay(tx: DbLike, gameId: number): Promise<void> {
  const [game] = await tx
    .select()
    .from(gamesTable)
    .where(eq(gamesTable.id, gameId));
  if (!game) return;

  const teams = await tx
    .select()
    .from(teamsTable)
    .where(eq(teamsTable.gameId, gameId));
  const home = teams.find((t) => t.isHome);
  const away = teams.find((t) => !t.isHome);
  if (!home || !away) return;

  const events = await tx
    .select()
    .from(statEventsTable)
    .where(eq(statEventsTable.gameId, gameId))
    .orderBy(asc(statEventsTable.createdAt), asc(statEventsTable.id));

  const playerMap = new Map<number, Player>();
  const allPlayers: Player[] = (
    await Promise.all(
      teams.map((t) =>
        tx.select().from(playersTable).where(eq(playersTable.teamId, t.id)),
      ),
    )
  ).flat() as Player[];
  for (const p of allPlayers) {
    playerMap.set(p.id, p);
  }

  let homeScore = 0;
  let awayScore = 0;
  let possessionTeamId: number | null = null;

  // Wipe existing pbp for this game and rebuild.
  await tx.delete(playByPlayTable).where(eq(playByPlayTable.gameId, gameId));

  for (const ev of events) {
    const eventType = ev.eventType as StatEventType;
    const effect = computePossessionEffect({
      eventType,
      eventTeamId: ev.teamId,
      ftSequenceIndex: ev.ftSequenceIndex,
      ftSequenceTotal: ev.ftSequenceTotal,
      homeTeamId: home.id,
      awayTeamId: away.id,
      currentPossessionTeamId: possessionTeamId,
    });
    const next = applyScoreDelta(
      effect.scoreDelta,
      ev.teamId,
      home.id,
      homeScore,
      awayScore,
    );
    homeScore = next.homeScore;
    awayScore = next.awayScore;

    const team = teams.find((t) => t.id === ev.teamId) ?? null;
    const player = ev.playerId ? (playerMap.get(ev.playerId) ?? null) : null;

    const eventText = describeEvent({
      eventType,
      team,
      player,
      period: ev.period,
      clockSeconds: ev.clockSeconds,
      ftSequenceIndex: ev.ftSequenceIndex,
      ftSequenceTotal: ev.ftSequenceTotal,
    });

    await tx.insert(playByPlayTable).values({
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

  await tx
    .update(gamesTable)
    .set({ possessionTeamId })
    .where(eq(gamesTable.id, gameId));
}

export default router;
