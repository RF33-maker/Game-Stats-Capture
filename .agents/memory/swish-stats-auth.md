---
name: Swish Stats auth / local-mode
description: How auth gating and local mode work in the swish-stats artifact
---

Swish Stats is a login-required (paid) app. `LOCAL_MODE_ENABLED` in
`src/lib/local-mode.ts` defaults to false and is opt-in via
`VITE_LOCAL_MODE=true` (dev only: auth bypass + in-browser data store).

**Why:** The product requires sign-in; local mode is a developer convenience,
not the default.

**How to apply:** Gate routes with `ProtectedRoute` (and `RequireLeagueRole`
for league-scoped pages). `useAuth` from `@workspace/replit-auth-web` exposes
`{ user, isAuthenticated, isLoading, login(returnTo?), logout() }`; `login`
redirects to `/api/login`. Build return paths with BASE_URL (wouter base =
`import.meta.env.BASE_URL`). Treat LOCAL_MODE as "signed in" in UI components.
