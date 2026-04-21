import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, playByPlayTable } from "@workspace/db";
import {
  ListPlayByPlayParams,
  ListPlayByPlayResponse,
  CreatePlayByPlayParams,
  CreatePlayByPlayBody,
  UpdatePlayByPlayParams,
  UpdatePlayByPlayBody,
  DeletePlayByPlayParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/games/:gameId/play-by-play", async (req, res): Promise<void> => {
  const params = ListPlayByPlayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const rows = await db
    .select()
    .from(playByPlayTable)
    .where(eq(playByPlayTable.gameId, params.data.gameId))
    .orderBy(desc(playByPlayTable.id));
  res.json(ListPlayByPlayResponse.parse(rows));
});

router.post("/games/:gameId/play-by-play", async (req, res): Promise<void> => {
  const params = CreatePlayByPlayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = CreatePlayByPlayBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .insert(playByPlayTable)
    .values({
      gameId: params.data.gameId,
      teamId: parsed.data.teamId ?? null,
      playerId: parsed.data.playerId ?? null,
      period: parsed.data.period,
      clockSeconds: parsed.data.clockSeconds,
      eventText: parsed.data.eventText,
      homeScore: parsed.data.homeScore,
      awayScore: parsed.data.awayScore,
      possessionTeamId: parsed.data.possessionTeamId ?? null,
      possessionEnded: parsed.data.possessionEnded ?? "false",
    })
    .returning();
  res.status(201).json(row);
});

router.patch("/play-by-play/:pbpId", async (req, res): Promise<void> => {
  const params = UpdatePlayByPlayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdatePlayByPlayBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [row] = await db
    .update(playByPlayTable)
    .set(parsed.data)
    .where(eq(playByPlayTable.id, params.data.pbpId))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Play-by-play entry not found" });
    return;
  }
  res.json(row);
});

router.delete("/play-by-play/:pbpId", async (req, res): Promise<void> => {
  const params = DeletePlayByPlayParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [row] = await db
    .delete(playByPlayTable)
    .where(eq(playByPlayTable.id, params.data.pbpId))
    .returning();
  if (!row) {
    res.status(404).json({ error: "Play-by-play entry not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
