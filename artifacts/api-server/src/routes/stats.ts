import { Router, type IRouter } from "express";
import { eq, asc } from "drizzle-orm";
import {
  db,
  gamesTable,
  teamsTable,
  playersTable,
  statEventsTable,
  playByPlayTable,
  ZONE_SHOT_VALUE,
  type StatEventType,
  type Player,
  type ShotZone,
} from "@workspace/db";
import {
  RecordStatEventBody,
  RecordStatEventParams,
  ListStatEventsParams,
  ListStatEventsResponse,
  DeleteStatEventParams,
  UpdateStatEventBody,
  UpdateStatEventParams,
  SubstitutePlayersBody,
  SubstitutePlayersParams,
} from "@workspace/api-zod";
import {
  computePossessionEffect,
  describeEvent,
  applyScoreDelta,
} from "../lib/possession";
import { requireAuth } from "../middlewares/requireAuth";
import { requireLeagueRole } from "../lib/leagueAccess";

const router: IRouter = Router();

router.use(requireAuth);

// Point value a field-goal event type is worth, or null for non-FG events
// (rebounds, fouls, etc.) that must not carry a shot zone at all.
function fgShotValueFor(eventType: StatEventType): 2 | 3 | null {
  if (eventType === "2ptm" || eventType === "2pta") return 2;
  if (eventType === "3ptm" || eventType === "3pta") return 3;
  return null;
}

// Authoritative guard so a stat event's shot zone always matches its event
// type's point value — the frontend applies the same rule for UX, but the
// API must enforce it since clients aren't trusted.
function assertShotZoneMatchesEventType(
  eventType: StatEventType,
  shotZone: string | null | undefined,
): void {
  if (shotZone == null) return;
  const shotValue = fgShotValueFor(eventType);
  if (shotValue == null) {
    throw new HttpError(
      400,
      "shotZone can only be set on 2PT/3PT field goal events",
    );
  }
  if (ZONE_SHOT_VALUE[shotZone as ShotZone] !== shotValue) {
    throw new HttpError(
      400,
      "shotZone does not match the event type's point value",
    );
  }
}

router.get("/games/:gameId/stats", requireLeagueRole("viewer"), async (req, res): Promise<void> => {
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

router.post("/games/:gameId/stats", requireLeagueRole("scorer"), async (req, res): Promise<void> => {
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
      assertShotZoneMatchesEventType(eventType, parsed.data.shotZone ?? null);

      // Substitutions are an indivisible pair (sub_out + sub_in written
      // together, with server-validated lineup state) and must always go
      // through POST /games/:gameId/substitutions, never this generic
      // event-creation route — otherwise a lone, unpaired sub event could
      // corrupt the derived on-court lineup.
      if (eventType === "sub_in" || eventType === "sub_out") {
        throw new HttpError(
          400,
          "Substitutions must be created via POST /games/:gameId/substitutions, not this endpoint",
        );
      }

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
          shotZone: parsed.data.shotZone ?? null,
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
        shotZone: parsed.data.shotZone ?? null,
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

// Replays a team's sub_in/sub_out history (ordered by createdAt, then id) on
// top of its starters to derive who is currently on court. Used to validate
// substitutions server-side so a client can never swap a player who isn't
// actually on the court/bench right now.
async function getOnCourtPlayerIds(
  tx: DbLike,
  teamId: number,
): Promise<Set<number>> {
  const teamPlayers = await tx
    .select()
    .from(playersTable)
    .where(eq(playersTable.teamId, teamId));
  const onCourt = new Set(
    teamPlayers.filter((p) => p.isStarter).map((p) => p.id),
  );

  const subEvents = await tx
    .select()
    .from(statEventsTable)
    .where(eq(statEventsTable.teamId, teamId))
    .orderBy(asc(statEventsTable.createdAt), asc(statEventsTable.id));
  for (const ev of subEvents) {
    if (ev.eventType === "sub_in" && ev.playerId != null) {
      onCourt.add(ev.playerId);
    } else if (ev.eventType === "sub_out" && ev.playerId != null) {
      onCourt.delete(ev.playerId);
    }
  }
  return onCourt;
}

router.post(
  "/games/:gameId/substitutions",
  requireLeagueRole("scorer"),
  async (req, res): Promise<void> => {
    const params = SubstitutePlayersParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = SubstitutePlayersBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const gameId = params.data.gameId;
    const { teamId, outPlayerId, inPlayerId, period, clockSeconds } =
      parsed.data;

    if (outPlayerId === inPlayerId) {
      res.status(400).json({ error: "outPlayerId and inPlayerId must differ" });
      return;
    }

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
        const team = teams.find((t) => t.id === teamId);
        if (!team) {
          throw new HttpError(400, "teamId does not belong to this game");
        }

        const [outPlayer, inPlayer] = await Promise.all([
          tx
            .select()
            .from(playersTable)
            .where(eq(playersTable.id, outPlayerId))
            .then((r) => r[0]),
          tx
            .select()
            .from(playersTable)
            .where(eq(playersTable.id, inPlayerId))
            .then((r) => r[0]),
        ]);
        if (!outPlayer || !inPlayer) {
          throw new HttpError(404, "Player not found");
        }
        if (outPlayer.teamId !== teamId || inPlayer.teamId !== teamId) {
          throw new HttpError(
            400,
            "Both players must belong to the given team",
          );
        }
        if (!outPlayer.isActive || !inPlayer.isActive) {
          throw new HttpError(400, "Both players must be active on the roster");
        }

        // Validate current lineup state (server-authoritative, not trusted
        // from the client) so a stale UI can't produce an invalid swap.
        const onCourtIds = await getOnCourtPlayerIds(tx, teamId);
        if (!onCourtIds.has(outPlayerId)) {
          throw new HttpError(400, "outPlayerId is not currently on court");
        }
        if (onCourtIds.has(inPlayerId)) {
          throw new HttpError(400, "inPlayerId is already on court");
        }

        // Substitutions don't affect possession/score.
        const latest = await tx
          .select()
          .from(playByPlayTable)
          .where(eq(playByPlayTable.gameId, gameId))
          .orderBy(asc(playByPlayTable.id));
        const lastPbp = latest[latest.length - 1];
        const homeScore = lastPbp?.homeScore ?? 0;
        const awayScore = lastPbp?.awayScore ?? 0;

        const [outEvent] = await tx
          .insert(statEventsTable)
          .values({
            gameId,
            teamId,
            playerId: outPlayerId,
            period,
            clockSeconds,
            eventType: "sub_out" as StatEventType,
            value: inPlayerId,
            possessionTeamId: game.possessionTeamId ?? null,
          })
          .returning();

        const [inEvent] = await tx
          .insert(statEventsTable)
          .values({
            gameId,
            teamId,
            playerId: inPlayerId,
            period,
            clockSeconds,
            eventType: "sub_in" as StatEventType,
            value: outPlayerId,
            possessionTeamId: game.possessionTeamId ?? null,
            pairEventId: outEvent.id,
          })
          .returning();

        // Link the other side of the pair now that inEvent's id exists.
        // pairEventId is the durable link used by PATCH/DELETE to treat the
        // two rows as one indivisible operation, instead of relying on
        // heuristically matching value/player fields.
        const [linkedOutEvent] = await tx
          .update(statEventsTable)
          .set({ pairEventId: inEvent.id })
          .where(eq(statEventsTable.id, outEvent.id))
          .returning();

        const [outPbp] = await tx
          .insert(playByPlayTable)
          .values({
            gameId,
            statEventId: outEvent.id,
            teamId,
            playerId: outPlayerId,
            period,
            clockSeconds,
            possessionTeamId: game.possessionTeamId ?? null,
            possessionEnded: "false",
            homeScore,
            awayScore,
            eventText: describeEvent({
              eventType: "sub_out" as StatEventType,
              team,
              player: outPlayer,
              period,
              clockSeconds,
              ftSequenceIndex: null,
              ftSequenceTotal: null,
              shotZone: null,
              otherPlayer: inPlayer,
            }),
          })
          .returning();

        const [inPbp] = await tx
          .insert(playByPlayTable)
          .values({
            gameId,
            statEventId: inEvent.id,
            teamId,
            playerId: inPlayerId,
            period,
            clockSeconds,
            possessionTeamId: game.possessionTeamId ?? null,
            possessionEnded: "false",
            homeScore,
            awayScore,
            eventText: describeEvent({
              eventType: "sub_in" as StatEventType,
              team,
              player: inPlayer,
              period,
              clockSeconds,
              ftSequenceIndex: null,
              ftSequenceTotal: null,
              shotZone: null,
              otherPlayer: outPlayer,
            }),
          })
          .returning();

        const [updatedGame] = await tx
          .update(gamesTable)
          .set({ clockSeconds, currentPeriod: period })
          .where(eq(gamesTable.id, gameId))
          .returning();

        return {
          outEvent: linkedOutEvent,
          inEvent,
          outPlayByPlay: outPbp,
          inPlayByPlay: inPbp,
          game: updatedGame,
        };
      });

      res.status(201).json(result);
    } catch (err) {
      if (err instanceof HttpError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      throw err;
    }
  },
);

router.patch("/stats/:statEventId", requireLeagueRole("scorer"), async (req, res): Promise<void> => {
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

      // Substitutions are an indivisible pair; editing one side independently
      // could desync it from its pair (wrong team/player/clock on only one
      // row) and corrupt the derived on-court lineup. Scorers correct a
      // substitution by deleting it (which removes both sides) and
      // re-recording it via POST /games/:gameId/substitutions.
      const effectiveEventTypeForGuard =
        parsed.data.eventType !== undefined
          ? (parsed.data.eventType as StatEventType)
          : (target.eventType as StatEventType);
      if (
        target.eventType === "sub_in" ||
        target.eventType === "sub_out" ||
        effectiveEventTypeForGuard === "sub_in" ||
        effectiveEventTypeForGuard === "sub_out"
      ) {
        throw new HttpError(
          400,
          "Substitution events cannot be edited directly — delete and re-record the substitution instead",
        );
      }

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

      // Same whole-state re-check pattern as team/player above: validate the
      // effective post-patch (eventType, shotZone) pair, not just the fields
      // that were actually sent, so changing only the event type still
      // catches a now-mismatched zone retained from before.
      const effectiveEventType =
        parsed.data.eventType !== undefined
          ? (parsed.data.eventType as StatEventType)
          : (target.eventType as StatEventType);
      const effectiveShotZone =
        parsed.data.shotZone !== undefined
          ? parsed.data.shotZone
          : target.shotZone;
      assertShotZoneMatchesEventType(effectiveEventType, effectiveShotZone);

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
      if (parsed.data.shotZone !== undefined)
        updates.shotZone = parsed.data.shotZone;

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

router.delete("/stats/:statEventId", requireLeagueRole("scorer"), async (req, res): Promise<void> => {
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

      // Substitutions are an indivisible pair: deleting one side without the
      // other would leave a dangling sub_in/sub_out event and desync the
      // derived on-court lineup, so always delete both rows together.
      const idsToDelete = [statEventId];
      if (
        (target.eventType === "sub_in" || target.eventType === "sub_out") &&
        target.pairEventId != null
      ) {
        idsToDelete.push(target.pairEventId);
      }

      // Delete the pbp row(s) tied to these event(s) and the event(s) themselves.
      for (const id of idsToDelete) {
        await tx
          .delete(playByPlayTable)
          .where(eq(playByPlayTable.statEventId, id));
        await tx.delete(statEventsTable).where(eq(statEventsTable.id, id));
      }

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
    const otherPlayer =
      (eventType === "sub_in" || eventType === "sub_out") && ev.value != null
        ? (playerMap.get(ev.value) ?? null)
        : null;

    const eventText = describeEvent({
      eventType,
      team,
      player,
      period: ev.period,
      clockSeconds: ev.clockSeconds,
      ftSequenceIndex: ev.ftSequenceIndex,
      ftSequenceTotal: ev.ftSequenceTotal,
      shotZone: ev.shotZone,
      otherPlayer,
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
