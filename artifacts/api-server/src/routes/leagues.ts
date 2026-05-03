import { Router, type IRouter, type Request, type Response } from "express";
import { eq, and, inArray, desc } from "drizzle-orm";
import {
  db,
  leaguesTable,
  leagueMembershipsTable,
  usersTable,
  gamesTable,
  type LeagueRole,
} from "@workspace/db";
import {
  CreateLeagueBody,
  UpdateLeagueBody,
  AddLeagueMemberBody,
  UpdateLeagueMemberBody,
  CreateGameBody,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/requireAuth";
import {
  getViewerRole,
  requireLeagueRole,
  roleAtLeast,
} from "../lib/leagueAccess";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/leagues", async (req: Request, res: Response) => {
  const userId = req.user!.id as string;

  const memberships = await db
    .select()
    .from(leagueMembershipsTable)
    .where(eq(leagueMembershipsTable.userId, userId));

  if (memberships.length === 0) {
    res.json([]);
    return;
  }

  const ids = memberships.map((m) => m.leagueId);
  const leagues = await db
    .select()
    .from(leaguesTable)
    .where(inArray(leaguesTable.id, ids))
    .orderBy(desc(leaguesTable.createdAt));

  const roleMap = new Map(memberships.map((m) => [m.leagueId, m.role]));
  res.json(
    leagues.map((l) => ({
      ...l,
      viewerRole: roleMap.get(l.id) as LeagueRole,
    })),
  );
});

router.post("/leagues", async (req: Request, res: Response) => {
  const parsed = CreateLeagueBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.user!.id as string;

  const result = await db.transaction(async (tx) => {
    const [league] = await tx
      .insert(leaguesTable)
      .values({
        name: parsed.data.name,
        season: parsed.data.season ?? null,
        logoUrl: parsed.data.logoUrl ?? null,
        ownerUserId: userId,
      })
      .returning();
    await tx.insert(leagueMembershipsTable).values({
      leagueId: league.id,
      userId,
      role: "admin" satisfies LeagueRole,
    });
    return league;
  });

  res.status(201).json({ ...result, viewerRole: "admin" satisfies LeagueRole });
});

router.get(
  "/leagues/:leagueId",
  requireLeagueRole("viewer"),
  async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const [league] = await db
      .select()
      .from(leaguesTable)
      .where(eq(leaguesTable.id, leagueId));
    if (!league) {
      res.status(404).json({ error: "League not found" });
      return;
    }
    const role = await getViewerRole(leagueId, req.user!.id as string);
    res.json({ ...league, viewerRole: role });
  },
);

router.patch(
  "/leagues/:leagueId",
  requireLeagueRole("admin"),
  async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const parsed = UpdateLeagueBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const updates: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updates.name = parsed.data.name;
    if (parsed.data.season !== undefined) updates.season = parsed.data.season;
    if (parsed.data.logoUrl !== undefined)
      updates.logoUrl = parsed.data.logoUrl;
    const [league] = await db
      .update(leaguesTable)
      .set(updates)
      .where(eq(leaguesTable.id, leagueId))
      .returning();
    if (!league) {
      res.status(404).json({ error: "League not found" });
      return;
    }
    const role = await getViewerRole(leagueId, req.user!.id as string);
    res.json({ ...league, viewerRole: role });
  },
);

router.delete(
  "/leagues/:leagueId",
  requireLeagueRole("admin"),
  async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const [row] = await db
      .delete(leaguesTable)
      .where(eq(leaguesTable.id, leagueId))
      .returning();
    if (!row) {
      res.status(404).json({ error: "League not found" });
      return;
    }
    res.sendStatus(204);
  },
);

router.get(
  "/leagues/:leagueId/games",
  requireLeagueRole("viewer"),
  async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const games = await db
      .select()
      .from(gamesTable)
      .where(eq(gamesTable.leagueId, leagueId))
      .orderBy(desc(gamesTable.createdAt));
    res.json(games);
  },
);

router.post(
  "/leagues/:leagueId/games",
  requireLeagueRole("admin"),
  async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const parsed = CreateGameBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const data = parsed.data;
    const [game] = await db
      .insert(gamesTable)
      .values({
        leagueId,
        competition: data.competition ?? null,
        date: data.date ?? new Date(),
        venue: data.venue ?? null,
        captureMode: data.captureMode ?? "complex",
        periodCount: data.periodCount ?? 4,
        periodDurationMins: data.periodDurationMins ?? 10,
        clockSeconds: (data.periodDurationMins ?? 10) * 60,
      })
      .returning();
    res.status(201).json(game);
  },
);

router.get(
  "/leagues/:leagueId/activity",
  requireLeagueRole("viewer"),
  async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const limitRaw = Number(req.query.limit ?? 20);
    const limit = Math.min(
      Math.max(Math.floor(Number.isFinite(limitRaw) ? limitRaw : 20), 1),
      50,
    );

    const finalizedGames = await db
      .select({
        id: gamesTable.id,
        competition: gamesTable.competition,
        updatedAt: gamesTable.updatedAt,
      })
      .from(gamesTable)
      .where(
        and(
          eq(gamesTable.leagueId, leagueId),
          eq(gamesTable.status, "final"),
        ),
      )
      .orderBy(desc(gamesTable.updatedAt))
      .limit(limit);

    const newMembers = await db
      .select({
        userId: leagueMembershipsTable.userId,
        role: leagueMembershipsTable.role,
        createdAt: leagueMembershipsTable.createdAt,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
      })
      .from(leagueMembershipsTable)
      .innerJoin(usersTable, eq(leagueMembershipsTable.userId, usersTable.id))
      .where(eq(leagueMembershipsTable.leagueId, leagueId))
      .orderBy(desc(leagueMembershipsTable.createdAt))
      .limit(limit);

    type Entry = {
      type: "game_finalized" | "member_joined";
      timestamp: string;
      gameId: number | null;
      gameLabel: string | null;
      userId: string | null;
      userDisplayName: string | null;
      userEmail: string | null;
      role: LeagueRole | null;
    };

    const entries: Entry[] = [];
    for (const g of finalizedGames) {
      entries.push({
        type: "game_finalized",
        timestamp: g.updatedAt.toISOString(),
        gameId: g.id,
        gameLabel: g.competition || "Exhibition game",
        userId: null,
        userDisplayName: null,
        userEmail: null,
        role: null,
      });
    }
    for (const m of newMembers) {
      const display =
        m.firstName || m.lastName
          ? `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim()
          : (m.email ?? m.userId);
      entries.push({
        type: "member_joined",
        timestamp: m.createdAt.toISOString(),
        gameId: null,
        gameLabel: null,
        userId: m.userId,
        userDisplayName: display,
        userEmail: m.email,
        role: m.role,
      });
    }

    entries.sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );
    res.json(entries.slice(0, limit));
  },
);

router.get(
  "/leagues/:leagueId/members",
  requireLeagueRole("viewer"),
  async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const rows = await db
      .select({
        leagueId: leagueMembershipsTable.leagueId,
        userId: leagueMembershipsTable.userId,
        role: leagueMembershipsTable.role,
        createdAt: leagueMembershipsTable.createdAt,
        email: usersTable.email,
        firstName: usersTable.firstName,
        lastName: usersTable.lastName,
        profileImageUrl: usersTable.profileImageUrl,
      })
      .from(leagueMembershipsTable)
      .innerJoin(usersTable, eq(leagueMembershipsTable.userId, usersTable.id))
      .where(eq(leagueMembershipsTable.leagueId, leagueId));
    res.json(rows);
  },
);

router.post(
  "/leagues/:leagueId/members",
  requireLeagueRole("admin"),
  async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const parsed = AddLeagueMemberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.email, parsed.data.email));
    if (!user) {
      res.status(404).json({
        error:
          "No user found with that email. They must sign in to Swish Stats at least once before being added.",
      });
      return;
    }
    const existing = await getViewerRole(leagueId, user.id);
    if (existing) {
      // Apply the same owner / last-admin guards as PATCH so the upsert
      // path cannot be used to bypass role-change protections.
      if (parsed.data.role !== "admin") {
        const [league] = await db
          .select({ ownerUserId: leaguesTable.ownerUserId })
          .from(leaguesTable)
          .where(eq(leaguesTable.id, leagueId));
        if (league?.ownerUserId === user.id) {
          res
            .status(400)
            .json({ error: "Cannot demote the league owner" });
          return;
        }
        if (existing === "admin") {
          const admins = await db
            .select({ userId: leagueMembershipsTable.userId })
            .from(leagueMembershipsTable)
            .where(
              and(
                eq(leagueMembershipsTable.leagueId, leagueId),
                eq(leagueMembershipsTable.role, "admin"),
              ),
            );
          if (
            admins.length === 1 &&
            admins[0]?.userId === user.id
          ) {
            res.status(400).json({
              error: "Cannot demote the last admin of a league",
            });
            return;
          }
        }
      }
      const [updated] = await db
        .update(leagueMembershipsTable)
        .set({ role: parsed.data.role })
        .where(
          and(
            eq(leagueMembershipsTable.leagueId, leagueId),
            eq(leagueMembershipsTable.userId, user.id),
          ),
        )
        .returning();
      res.status(200).json({
        leagueId: updated.leagueId,
        userId: updated.userId,
        role: updated.role,
        createdAt: updated.createdAt,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profileImageUrl: user.profileImageUrl,
      });
      return;
    }
    const [created] = await db
      .insert(leagueMembershipsTable)
      .values({
        leagueId,
        userId: user.id,
        role: parsed.data.role,
      })
      .returning();
    res.status(201).json({
      leagueId: created.leagueId,
      userId: created.userId,
      role: created.role,
      createdAt: created.createdAt,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      profileImageUrl: user.profileImageUrl,
    });
  },
);

router.patch(
  "/leagues/:leagueId/members/:userId",
  requireLeagueRole("admin"),
  async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const userId = String(req.params.userId);
    const parsed = UpdateLeagueMemberBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    // Guard the league owner against demotion.
    const [league] = await db
      .select({ ownerUserId: leaguesTable.ownerUserId })
      .from(leaguesTable)
      .where(eq(leaguesTable.id, leagueId));
    if (
      league?.ownerUserId === userId &&
      parsed.data.role !== "admin"
    ) {
      res
        .status(400)
        .json({ error: "Cannot demote the league owner" });
      return;
    }
    // Prevent demoting the last admin (would orphan the league).
    if (parsed.data.role !== "admin") {
      const admins = await db
        .select({ userId: leagueMembershipsTable.userId })
        .from(leagueMembershipsTable)
        .where(
          and(
            eq(leagueMembershipsTable.leagueId, leagueId),
            eq(leagueMembershipsTable.role, "admin"),
          ),
        );
      const isLastAdmin =
        admins.length === 1 && admins[0]?.userId === userId;
      if (isLastAdmin) {
        res
          .status(400)
          .json({ error: "Cannot demote the last admin of a league" });
        return;
      }
    }
    const [updated] = await db
      .update(leagueMembershipsTable)
      .set({ role: parsed.data.role })
      .where(
        and(
          eq(leagueMembershipsTable.leagueId, leagueId),
          eq(leagueMembershipsTable.userId, userId),
        ),
      )
      .returning();
    if (!updated) {
      res.status(404).json({ error: "Membership not found" });
      return;
    }
    const [user] = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId));
    res.json({
      leagueId: updated.leagueId,
      userId: updated.userId,
      role: updated.role,
      createdAt: updated.createdAt,
      email: user?.email ?? null,
      firstName: user?.firstName ?? null,
      lastName: user?.lastName ?? null,
      profileImageUrl: user?.profileImageUrl ?? null,
    });
  },
);

router.delete(
  "/leagues/:leagueId/members/:userId",
  requireLeagueRole("admin"),
  async (req: Request, res: Response) => {
    const leagueId = Number(req.params.leagueId);
    const userId = String(req.params.userId);
    // Guard: the league owner can never be removed.
    const [league] = await db
      .select({ ownerUserId: leaguesTable.ownerUserId })
      .from(leaguesTable)
      .where(eq(leaguesTable.id, leagueId));
    if (league?.ownerUserId === userId) {
      res.status(400).json({ error: "Cannot remove the league owner" });
      return;
    }
    // Guard: never remove the last admin (would orphan the league).
    const [target] = await db
      .select({ role: leagueMembershipsTable.role })
      .from(leagueMembershipsTable)
      .where(
        and(
          eq(leagueMembershipsTable.leagueId, leagueId),
          eq(leagueMembershipsTable.userId, userId),
        ),
      );
    if (target?.role === "admin") {
      const admins = await db
        .select({ userId: leagueMembershipsTable.userId })
        .from(leagueMembershipsTable)
        .where(
          and(
            eq(leagueMembershipsTable.leagueId, leagueId),
            eq(leagueMembershipsTable.role, "admin"),
          ),
        );
      if (admins.length <= 1) {
        res
          .status(400)
          .json({ error: "Cannot remove the last admin of a league" });
        return;
      }
    }
    const [deleted] = await db
      .delete(leagueMembershipsTable)
      .where(
        and(
          eq(leagueMembershipsTable.leagueId, leagueId),
          eq(leagueMembershipsTable.userId, userId),
        ),
      )
      .returning();
    if (!deleted) {
      res.status(404).json({ error: "Membership not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
