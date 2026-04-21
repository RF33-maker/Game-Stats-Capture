import { Router, type IRouter } from "express";
import { db, gamesTable, teamsTable, playersTable } from "@workspace/db";

const router: IRouter = Router();

router.post("/seed", async (_req, res): Promise<void> => {
  const [game] = await db
    .insert(gamesTable)
    .values({
      competition: "Sample League",
      venue: "Replit Arena",
      captureMode: "complex",
      periodCount: 4,
      periodDurationMins: 10,
      clockSeconds: 600,
    })
    .returning();

  const [home, away] = await db
    .insert(teamsTable)
    .values([
      {
        gameId: game.id,
        name: "Replit Hawks",
        abbreviation: "RHK",
        colorPrimary: "#f26207",
        colorSecondary: "#0a0a0a",
        isHome: true,
      },
      {
        gameId: game.id,
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

  await db
    .insert(playersTable)
    .values([...sampleRoster(home.id, "H"), ...sampleRoster(away.id, "A")]);

  res.status(201).json(game);
});

export default router;
