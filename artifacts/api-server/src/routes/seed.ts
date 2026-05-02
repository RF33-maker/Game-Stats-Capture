import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  leaguesTable,
  leagueMembershipsTable,
  gamesTable,
  teamsTable,
  playersTable,
  type LeagueRole,
} from "@workspace/db";
import { requireAuth } from "../middlewares/requireAuth";

const router: IRouter = Router();

router.use(requireAuth);

router.post("/seed", async (req: Request, res: Response): Promise<void> => {
  const userId = req.user!.id as string;

  const game = await db.transaction(async (tx) => {
    const [league] = await tx
      .insert(leaguesTable)
      .values({
        name: "Sample League",
        season: "Demo Season",
        ownerUserId: userId,
      })
      .returning();

    await tx.insert(leagueMembershipsTable).values({
      leagueId: league.id,
      userId,
      role: "admin" satisfies LeagueRole,
    });

    const [createdGame] = await tx
      .insert(gamesTable)
      .values({
        leagueId: league.id,
        competition: "Sample Game",
        venue: "Replit Arena",
        captureMode: "complex",
        periodCount: 4,
        periodDurationMins: 10,
        clockSeconds: 600,
      })
      .returning();

    const [home, away] = await tx
      .insert(teamsTable)
      .values([
        {
          gameId: createdGame.id,
          name: "Replit Hawks",
          abbreviation: "RHK",
          colorPrimary: "#f26207",
          colorSecondary: "#0a0a0a",
          isHome: true,
        },
        {
          gameId: createdGame.id,
          name: "Pixel Pacers",
          abbreviation: "PXP",
          colorPrimary: "#005bb5",
          colorSecondary: "#fde047",
          isHome: false,
        },
      ])
      .returning();

    const sampleRoster = (teamId: number, prefix: string) =>
      Array.from({ length: 8 }, (_, i) => ({
        teamId,
        jerseyNumber: String(i + 4),
        firstName: `${prefix}${i + 1}`,
        lastName: "Player",
        position: ["G", "G", "F", "F", "C"][i % 5] ?? "G",
        isStarter: i < 5,
      }));

    await tx
      .insert(playersTable)
      .values([...sampleRoster(home.id, "H"), ...sampleRoster(away.id, "A")]);

    return createdGame;
  });

  res.status(201).json(game);
});

export default router;
