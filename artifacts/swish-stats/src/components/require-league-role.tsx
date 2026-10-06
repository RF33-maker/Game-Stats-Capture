import { Link, useLocation, useSearch } from "wouter";
import { Loader2, ShieldAlert } from "lucide-react";
import {
  useGetGame,
  useGetLeague,
  getGetGameQueryKey,
  getGetLeagueQueryKey,
  type LeagueRole,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { LOCAL_MODE_ENABLED } from "@/lib/local-mode";

const RANK: Record<LeagueRole, number> = {
  viewer: 0,
  scorer: 1,
  admin: 2,
};

interface Props {
  min: LeagueRole;
  children: React.ReactNode;
}

function Denied({
  min,
  leagueId,
  reason,
}: {
  min: LeagueRole;
  leagueId?: number | null;
  reason: "missing-league" | "insufficient-role" | "not-found";
}) {
  const backHref = leagueId ? `/leagues/${leagueId}` : "/leagues";
  const heading =
    reason === "missing-league"
      ? "League context required"
      : reason === "not-found"
        ? "Game not found"
        : "You do not have access";
  const detail =
    reason === "missing-league"
      ? "This game is not part of any league you can see. Pick a league from the hub to continue."
      : reason === "not-found"
        ? "This game has been deleted or is not visible to you."
        : `You need at least the '${min}' role in this league to view or edit this page.`;
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground p-6">
      <div className="max-w-sm w-full text-center space-y-4 sa-card p-8">
        <ShieldAlert className="w-10 h-10 mx-auto text-amber-500" />
        <h1 className="text-xl font-bold">{heading}</h1>
        <p className="text-sm text-muted-foreground">{detail}</p>
        <Link href={backHref}>
          <Button className="w-full">Back to leagues</Button>
        </Link>
      </div>
    </div>
  );
}

export function RequireLeagueRole({ min, children }: Props) {
  const [path] = useLocation();
  const search = useSearch();

  // 1. League id from explicit ?league=<id> query param.
  const leagueIdFromQuery = (() => {
    const v = new URLSearchParams(search).get("league");
    return v && Number.isFinite(Number(v)) ? Number(v) : null;
  })();

  // 2. Game id parsed from the current URL path (works for /setup/:id/...
  //    and /game/:id and /game/:id/box). Used to derive league when the
  //    ?league=... query param is absent (e.g., direct deep link).
  const gameIdFromPath = (() => {
    const m = path.match(/\/(?:setup|game)\/(\d+)/);
    return m && Number.isFinite(Number(m[1])) ? Number(m[1]) : null;
  })();

  const { data: game, isLoading: gameLoading, isError: gameError } =
    useGetGame(gameIdFromPath ?? 0, {
      query: {
        enabled:
          !LOCAL_MODE_ENABLED &&
          gameIdFromPath != null,
        queryKey: getGetGameQueryKey(gameIdFromPath ?? 0),
        retry: false,
      },
    });

  const leagueId =
    leagueIdFromQuery ??
    (game?.leagueId != null ? Number(game.leagueId) : null);

  const { data: league, isLoading: leagueLoading, isError: leagueError } =
    useGetLeague(leagueId ?? 0, {
      query: {
        enabled: !LOCAL_MODE_ENABLED && leagueId != null,
        queryKey: getGetLeagueQueryKey(leagueId ?? 0),
        retry: false,
      },
    });

  if (LOCAL_MODE_ENABLED) return <>{children}</>;

  // Still resolving the game so we can find its league.
  if (gameIdFromPath != null && gameLoading) {
    return <Spinner />;
  }

  // Game lookup failed (404/403) — treat as not-found / no access.
  if (gameError || (game && game.leagueId == null && leagueIdFromQuery == null)) {
    return <Denied min={min} reason="not-found" />;
  }

  if (leagueId == null) {
    return <Denied min={min} reason="missing-league" />;
  }

  if (leagueLoading) {
    return <Spinner />;
  }

  if (leagueError || !league) {
    return <Denied min={min} leagueId={leagueId} reason="insufficient-role" />;
  }

  // A volunteer who joined with a game code scores that one game without
  // holding a role in the league.
  const gameAccess = (game as { myAccess?: string | null } | undefined)?.myAccess;
  const role = league.viewerRole as LeagueRole | undefined;
  const rank = Math.max(role ? RANK[role] : -1, gameAccess === "scorer" ? RANK.scorer : -1);
  if (rank < RANK[min]) {
    return (
      <Denied min={min} leagueId={leagueId} reason="insufficient-role" />
    );
  }

  return <>{children}</>;
}

function Spinner() {
  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}
