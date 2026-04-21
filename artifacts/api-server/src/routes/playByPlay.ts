import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, playByPlayTable } from "@workspace/db";
import {
  ListPlayByPlayParams,
  ListPlayByPlayResponse,
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

export default router;
