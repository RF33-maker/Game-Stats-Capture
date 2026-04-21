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
- **Tables**: `leagues`, `games`, `teams` (with `is_home` flag), `players`, `stat_events`, `play_by_play`. Schemas live in `lib/db/src/schema/*.ts`.
- **Routes**: `routes/games.ts`, `teams.ts`, `players.ts`, `stats.ts`, `playByPlay.ts`, `aggregates.ts` (box-score + possessions), `seed.ts` (`POST /seed` creates a sample game with two teams and rosters).
- **Possession state machine**: `artifacts/api-server/src/lib/possession.ts`. Recording a stat event automatically flips possession on made FG / TOV / STL / DREB / final FT, leaves it on OREB / missed FG / missed final FT (waits for rebound), and closes the open possession on `period_end`.
- **Database driver**: `lib/db/src/index.ts` prefers `SUPABASE_DATABASE_URL` and auto-enables SSL for Supabase hosts.

### Required secret
- `SUPABASE_DATABASE_URL` — must be a Postgres connection string (NOT the HTTPS Project URL). Use Supabase → Connect → Connection string → **Transaction pooler**:
  ```
  postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
  ```
  After updating the secret, run `pnpm --filter @workspace/db run push` to create the tables, then `POST /seed` for sample data.

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
