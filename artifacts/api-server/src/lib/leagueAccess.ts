import { type Request, type Response, type NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import {
  db,
  leagueMembershipsTable,
  gamesTable,
  teamsTable,
  playersTable,
  statEventsTable,
  playByPlayTable,
  type LeagueRole,
} from "@workspace/db";

const ROLE_RANK: Record<LeagueRole, number> = {
  viewer: 0,
  scorer: 1,
  admin: 2,
};

export async function getViewerRole(
  leagueId: number,
  userId: string,
): Promise<LeagueRole | null> {
  const [row] = await db
    .select()
    .from(leagueMembershipsTable)
    .where(
      and(
        eq(leagueMembershipsTable.leagueId, leagueId),
        eq(leagueMembershipsTable.userId, userId),
      ),
    );
  return (row?.role as LeagueRole | undefined) ?? null;
}

export function roleAtLeast(role: LeagueRole, min: LeagueRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

async function resolveLeagueIdFromRequest(
  req: Request,
): Promise<number | null> {
  const params = req.params;

  if (params.leagueId) {
    const n = Number(params.leagueId);
    return Number.isFinite(n) ? n : null;
  }

  if (params.gameId) {
    const [g] = await db
      .select({ leagueId: gamesTable.leagueId })
      .from(gamesTable)
      .where(eq(gamesTable.id, Number(params.gameId)));
    return g?.leagueId ?? null;
  }

  if (params.teamId) {
    const [t] = await db
      .select({ leagueId: gamesTable.leagueId })
      .from(teamsTable)
      .innerJoin(gamesTable, eq(teamsTable.gameId, gamesTable.id))
      .where(eq(teamsTable.id, Number(params.teamId)));
    return t?.leagueId ?? null;
  }

  if (params.playerId) {
    const [p] = await db
      .select({ leagueId: gamesTable.leagueId })
      .from(playersTable)
      .innerJoin(teamsTable, eq(playersTable.teamId, teamsTable.id))
      .innerJoin(gamesTable, eq(teamsTable.gameId, gamesTable.id))
      .where(eq(playersTable.id, Number(params.playerId)));
    return p?.leagueId ?? null;
  }

  if (params.statEventId) {
    const [s] = await db
      .select({ leagueId: gamesTable.leagueId })
      .from(statEventsTable)
      .innerJoin(gamesTable, eq(statEventsTable.gameId, gamesTable.id))
      .where(eq(statEventsTable.id, Number(params.statEventId)));
    return s?.leagueId ?? null;
  }

  const pbpIdRaw = params.playByPlayId ?? params.pbpId;
  if (pbpIdRaw) {
    const [pbp] = await db
      .select({ leagueId: gamesTable.leagueId })
      .from(playByPlayTable)
      .innerJoin(gamesTable, eq(playByPlayTable.gameId, gamesTable.id))
      .where(eq(playByPlayTable.id, Number(pbpIdRaw)));
    return pbp?.leagueId ?? null;
  }

  return null;
}

/**
 * Middleware factory that enforces a minimum league role on the resource
 * referenced by `req.params`. The hosted API is league-only: requests are
 * rejected with 403 when the resource cannot be resolved to a league
 * (`leagueId === null`) or when the viewer's membership role is below
 * `min`. Local mode is handled entirely on the client by intercepting
 * fetch in the browser, so this middleware is never invoked there.
 */
export function requireLeagueRole(min: LeagueRole) {
  return async function leagueRoleMiddleware(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    const user = req.user;
    if (!req.isAuthenticated() || !user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    let leagueId: number | null;
    try {
      leagueId = await resolveLeagueIdFromRequest(req);
    } catch {
      res.status(400).json({ error: "Could not resolve league for resource" });
      return;
    }

    if (leagueId == null) {
      // Resource is not in any league — deny. The hosted API is
      // league-only; orphan/non-league resources are reachable only via
      // the offline local-mode handler in the web client.
      res
        .status(403)
        .json({ error: "Resource is not associated with any league" });
      return;
    }

    const role = await getViewerRole(leagueId, user.id);
    if (!role) {
      res.status(403).json({ error: "Not a member of this league" });
      return;
    }
    if (!roleAtLeast(role, min)) {
      res
        .status(403)
        .json({ error: `Requires at least '${min}' role in this league` });
      return;
    }

    next();
  };
}
