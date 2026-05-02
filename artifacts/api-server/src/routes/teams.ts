import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, teamsTable } from "@workspace/db";
import {
  CreateTeamBody,
  UpdateTeamBody,
  ListTeamsParams,
  CreateTeamParams,
  UpdateTeamParams,
  DeleteTeamParams,
  ListTeamsResponse,
  UpdateTeamResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import { requireLeagueRole } from "../lib/leagueAccess";

const router: IRouter = Router();

router.use(requireAuth);

router.get(
  "/games/:gameId/teams",
  requireLeagueRole("viewer"),
  async (req, res): Promise<void> => {
    const params = ListTeamsParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const rows = await db
      .select()
      .from(teamsTable)
      .where(eq(teamsTable.gameId, params.data.gameId))
      .orderBy(teamsTable.isHome);
    res.json(ListTeamsResponse.parse(rows));
  },
);

router.post(
  "/games/:gameId/teams",
  requireLeagueRole("admin"),
  async (req, res): Promise<void> => {
    const params = CreateTeamParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = CreateTeamBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [row] = await db
      .insert(teamsTable)
      .values({
        gameId: params.data.gameId,
        name: parsed.data.name,
        abbreviation: parsed.data.abbreviation,
        colorPrimary: parsed.data.colorPrimary ?? "#0a0a0a",
        colorSecondary: parsed.data.colorSecondary ?? "#fafafa",
        logoUrl: parsed.data.logoUrl ?? null,
        isHome: parsed.data.isHome,
      })
      .returning();
    res.status(201).json(row);
  },
);

router.patch(
  "/teams/:teamId",
  requireLeagueRole("admin"),
  async (req, res): Promise<void> => {
    const params = UpdateTeamParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateTeamBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [row] = await db
      .update(teamsTable)
      .set(parsed.data)
      .where(eq(teamsTable.id, params.data.teamId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    res.json(UpdateTeamResponse.parse(row));
  },
);

router.delete(
  "/teams/:teamId",
  requireLeagueRole("admin"),
  async (req, res): Promise<void> => {
    const params = DeleteTeamParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const [row] = await db
      .delete(teamsTable)
      .where(eq(teamsTable.id, params.data.teamId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "Team not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
