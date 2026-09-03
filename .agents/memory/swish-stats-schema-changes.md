---
name: Swish Stats schema/API field addition workflow
description: The exact chain to follow when adding a new field to StatEvent/PlayByPlay (or any API-backed entity) in Swish Stats — skipping a layer causes silent type drift between hosted and local mode.
---

Adding a field that must appear in both the hosted API and local (offline) mode requires touching layers in this order, or generated code and local mode silently fall out of sync:

1. `lib/api-spec/openapi.yaml` — source of truth for the schema/body/response shapes.
2. Run codegen (`pnpm --filter @workspace/api-spec run codegen`, i.e. `orval --config ./orval.config.ts && ... && pnpm -w run typecheck:libs`) to regenerate `lib/api-zod/src/generated/api.ts` and `lib/api-client-react/src/generated/*`. Never hand-edit these generated files.
3. `lib/db/src/schema/*.ts` (Drizzle) — add the column, then `pnpm --filter @workspace/db run push` to apply to the real Postgres DB.
4. `artifacts/api-server/src/routes/*.ts` — wire the field into inserts/updates/guards.
5. `artifacts/swish-stats/src/lib/local-store.ts` (types) and `local-handler.ts` (the fetch-interceptor implementing the same routes against localStorage for offline/local mode) — must mirror step 4's logic exactly, including every object literal that constructs the affected entity (seed data, generic create routes, specialized routes like substitutions).

**Why:** Swish Stats runs two parallel implementations of the same API contract — a real Postgres-backed server and a localStorage-backed offline mode — and both must independently satisfy the same generated TypeScript types. Missing a layer (e.g. forgetting local-handler.ts) doesn't fail to compile server-side but breaks local/offline mode at runtime or leaves its object literals rejected by the shared generated types.

**How to apply:** Any time a task asks to add a column/field to `stat_events`, `play_by_play`, or another entity shared between hosted and local mode, work through all 5 layers before considering the change done, and typecheck both `@workspace/api-server` and `@workspace/swish-stats` afterward.
