import { Router, type IRouter } from "express";
import { eq, inArray } from "drizzle-orm";
import { db, playersTable, teamsTable } from "@workspace/db";
import {
  CreatePlayerBody,
  UpdatePlayerBody,
  ListPlayersParams,
  ListGamePlayersParams,
  CreatePlayerParams,
  UpdatePlayerParams,
  DeletePlayerParams,
  ListPlayersResponse,
  ListGamePlayersResponse,
  UpdatePlayerResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/games/:gameId/players", async (req, res): Promise<void> => {
  const params = ListGamePlayersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const teams = await db
    .select({ id: teamsTable.id })
    .from(teamsTable)
    .where(eq(teamsTable.gameId, params.data.gameId));
  const teamIds = teams.map((t) => t.id);
  if (teamIds.length === 0) {
    res.json([]);
    return;
  }
  const rows = await db
    .select()
    .from(playersTable)
    .where(inArray(playersTable.teamId, teamIds))
    .orderBy(playersTable.teamId, playersTable.jerseyNumber);
  res.json(ListGamePlayersResponse.parse(rows));
});

router.get("/teams/:teamId/players", async (req, res): Promise<void> => {
  const params = ListPlayersParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(playersTable)
    .where(eq(playersTable.teamId, params.data.teamId))
    .orderBy(playersTable.jerseyNumber);
  res.json(ListPlayersResponse.parse(rows));
});

router.post("/teams/:teamId/players", async (req, res): Promise<void> => {
  const params = CreatePlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreatePlayerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(playersTable)
    .values({
      teamId: params.data.teamId,
      jerseyNumber: parsed.data.jerseyNumber,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      position: parsed.data.position ?? null,
      headshotUrl: parsed.data.headshotUrl ?? null,
      isStarter: parsed.data.isStarter ?? false,
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/players/:playerId", async (req, res): Promise<void> => {
  const params = UpdatePlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePlayerBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(playersTable)
    .set(parsed.data)
    .where(eq(playersTable.id, params.data.playerId))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  res.json(UpdatePlayerResponse.parse(row));
});

router.delete("/players/:playerId", async (req, res): Promise<void> => {
  const params = DeletePlayerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(playersTable)
    .where(eq(playersTable.id, params.data.playerId))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Player not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
