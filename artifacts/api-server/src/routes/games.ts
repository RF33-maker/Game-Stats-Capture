import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, gamesTable } from "@workspace/db";
import {
  CreateGameBody,
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

const router: IRouter = Router();

router.get("/games", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(gamesTable)
    .orderBy(desc(gamesTable.createdAt));
  res.json(ListGamesResponse.parse(rows));
});

router.post("/games", async (req, res): Promise<void> => {
  const parsed = CreateGameBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(gamesTable)
    .values({
      competition: parsed.data.competition ?? null,
      date: parsed.data.date ?? new Date(),
      venue: parsed.data.venue ?? null,
      captureMode: parsed.data.captureMode ?? "complex",
      periodCount: parsed.data.periodCount ?? 4,
      periodDurationMins: parsed.data.periodDurationMins ?? 10,
      clockSeconds: (parsed.data.periodDurationMins ?? 10) * 60,
    })
    .returning();
  res.status(201).json(GetGameResponse.parse(row));
});

router.get("/games/:gameId", async (req, res): Promise<void> => {
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
});

router.patch("/games/:gameId", async (req, res): Promise<void> => {
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
});

router.patch("/games/:gameId/clock", async (req, res): Promise<void> => {
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
});

router.delete("/games/:gameId", async (req, res): Promise<void> => {
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
});

export default router;
