# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Project: Swish Stats

Basketball stat-capture platform inspired by FIBA Livestats. Backend lives in `artifacts/api-server` and exposes REST endpoints generated from `lib/api-spec/openapi.yaml`.

### Backend domain
- **Tables**: `users`, `sessions`, `leagues`, `league_memberships`, `games` (with nullable `league_id`), `teams` (with `is_home` flag), `players`, `stat_events`, `play_by_play`. Schemas live in `lib/db/src/schema/*.ts`.
- **Routes**: `routes/auth.ts` (Replit Auth login/callback/logout/user), `leagues.ts` (CRUD + `/leagues/:id/games` + `/leagues/:id/members`), plus the existing `games.ts`, `teams.ts`, `players.ts`, `stats.ts`, `playByPlay.ts`, `aggregates.ts`, `seed.ts`.
- **Possession state machine**: `artifacts/api-server/src/lib/possession.ts`. Recording a stat event automatically flips possession on made FG / TOV / STL / DREB / final FT, leaves it on OREB / missed FG / missed final FT (waits for rebound), and closes the open possession on `period_end`.
- **Database driver**: `lib/db/src/index.ts` uses `DATABASE_URL` (the workspace-managed Postgres). SSL is auto-enabled for hosted databases.

### Auth & per-league permissions
- **Replit Auth** (OpenID Connect via `openid-client`) is the only login provider. Sessions live in the `sessions` table; the `sid` cookie keys them.
- **League roles**: `viewer < scorer < admin` (`LeagueRole` enum). League creator is auto-promoted to `admin`.
- **Middleware**: `requireAuth` in `artifacts/api-server/src/middlewares/requireAuth.ts`, and `requireLeagueRole(min)` in `artifacts/api-server/src/lib/leagueAccess.ts`. The latter resolves the owning league from any of `leagueId`, `gameId`, `teamId`, `playerId`, `statEventId`, or `playByPlayId` URL params; resources without a league pass through as orphans.
- **Adding a member**: must be done by email; the target user must have signed in to Swish Stats at least once so their row exists in `users`.
- **Local mode** (`VITE_SWISH_LOCAL_MODE`) bypasses both auth and league gating in the browser via `src/lib/local-handler.ts`, which serves a synthetic `Local` user and a single `Local Games` league that exposes every locally-stored game.

### Frontend flow
- `/` → redirects to `/leagues` if signed in, else `/login` (skipped in local mode).
- `/login` → branded split-screen layout: left brand panel (logo, tagline, feature list), right auth panel with "Sign in with Replit" CTA. Local mode shows a simplified centered card.
- `/leagues` → full league hub: shared `AppHeader`, "Upcoming games" section (aggregated via `useListGames`), "Your leagues" grid with role badges and inline admin actions, prominent "New league" actions, first-run empty state. Create-league dialog routes to the new league on success.
- `/leagues/:leagueId` → league detail: `AppHeader` with "← League hub" back nav, league hero with member/game counts, Games section (sorted active→setup→final) with contextual action buttons, Members section with avatar initials and role selects.
- **Shared header**: `artifacts/swish-stats/src/components/app-header.tsx` — sticky branded header with logo link, user avatar/initials, local mode badge, and sign-out. Used on hub and league detail pages.
- All routes inside the app are wrapped in `<ProtectedRoute>` which redirects unauthenticated users to `/login`.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
