import { Router, type IRouter, type Request, type Response } from "express";
import { eq, desc, inArray } from "drizzle-orm";
import { db, gamesTable, leagueMembershipsTable } from "@workspace/db";
import {
  UpdateGameBody,
  UpdateClockBody,
  GetGameParams,
  UpdateGameParams,
  DeleteGameParams,
  UpdateClockParams,
  GetGameResponse,
  ListGamesResponse,
  UpdateGameResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireLeagueRole, getViewerRole, roleAtLeast } from "../lib/leagueAccess";

const router: IRouter = Router();

router.use(requireAuth);

// Lists every game across the leagues the viewer belongs to. Orphan
// (non-league) games are not exposed via the hosted API; create games
// inside a league via POST /leagues/:id/games.
router.get("/games", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id as string;
  const memberships = await db
    .select({ leagueId: leagueMembershipsTable.leagueId })
    .from(leagueMembershipsTable)
    .where(eq(leagueMembershipsTable.userId, userId));
  if (memberships.length === 0) {
    res.json([]);
    return;
  }
  const leagueIds = memberships.map((m) => m.leagueId);
  const rows = await db
    .select()
    .from(gamesTable)
    .where(inArray(gamesTable.leagueId, leagueIds))
    .orderBy(desc(gamesTable.createdAt));
  res.json(ListGamesResponse.parse(rows));
});

router.get(
  "/games/:gameId",
  requireLeagueRole("viewer"),
  async (req, res): Promise<void> => {
    const params = GetGameParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.id, params.data.gameId));
    if (!row) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.json(GetGameResponse.parse(row));
  },
);

// Scorers may patch ONLY the `status` field (used to start/finalize a
// game during capture). Any other field requires admin role.
router.patch(
  "/games/:gameId",
  requireLeagueRole("scorer"),
  async (req, res): Promise<void> => {
    const params = UpdateGameParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateGameBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const fields = Object.keys(parsed.data);
    const onlyStatus = fields.length > 0 && fields.every((k) => k === "status");
    // Scorers may only advance the game in the capture flow:
    //   setup  -> active   (start the game)
    //   active -> final    (finalize the game)
    // Any other transition (notably reopening a final game) and any
    // non-status field require admin role.
    const SCORER_ALLOWED_TRANSITIONS: Record<string, string[]> = {
      setup: ["active"],
      active: ["final"],
      final: [],
    };
    if (!onlyStatus || parsed.data.status !== undefined) {
      const [game] = await db
        .select({
          leagueId: gamesTable.leagueId,
          status: gamesTable.status,
        })
        .from(gamesTable)
        .where(eq(gamesTable.id, params.data.gameId));
      if (!game?.leagueId) {
        res.status(404).json({ error: "Game not found" });
        return;
      }
      const role = await getViewerRole(game.leagueId, req.user!.id as string);
      const isAdmin = !!role && roleAtLeast(role, "admin");
      if (!onlyStatus && !isAdmin) {
        res
          .status(403)
          .json({ error: "Only admins can edit game settings" });
        return;
      }
      if (
        onlyStatus &&
        !isAdmin &&
        parsed.data.status !== undefined &&
        parsed.data.status !== game.status &&
        !SCORER_ALLOWED_TRANSITIONS[game.status].includes(parsed.data.status)
      ) {
        res.status(403).json({
          error:
            "Scorers can only start or finalize a game; reopening requires an admin",
        });
        return;
      }
    }
    const [row] = await db
      .update(gamesTable)
      .set(parsed.data)
      .where(eq(gamesTable.id, params.data.gameId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.json(UpdateGameResponse.parse(row));
  },
);

// Clock updates are part of stat capture, so scorers may use them.
router.patch(
  "/games/:gameId/clock",
  requireLeagueRole("scorer"),
  async (req, res): Promise<void> => {
    const params = UpdateClockParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateClockBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const updates: Record<string, number> = {};
    if (parsed.data.clockSeconds != null)
      updates.clockSeconds = parsed.data.clockSeconds;
    if (parsed.data.currentPeriod != null)
      updates.currentPeriod = parsed.data.currentPeriod;
    const [row] = await db
      .update(gamesTable)
      .set(updates)
      .where(eq(gamesTable.id, params.data.gameId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.json(GetGameResponse.parse(row));
  },
);

router.delete(
  "/games/:gameId",
  requireLeagueRole("admin"),
  async (req, res): Promise<void> => {
    const params = DeleteGameParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .delete(gamesTable)
      .where(eq(gamesTable.id, params.data.gameId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Game not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
