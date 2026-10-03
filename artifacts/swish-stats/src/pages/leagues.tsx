import { useState } from "react";
import { Link, useLocation } from "wouter";
import {
  useListLeagues,
  useCreateLeague,
  useListGames,
  listLeagueMembers,
  getListLeaguesQueryKey,
  getListGamesQueryKey,
  type Game,
} from "@workspace/api-client-react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import {
  Loader2,
  Plus,
  Users,
  Calendar,
  MapPin,
  ChevronRight,
  ArrowRight,
  Settings,
  Trophy,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { AppHeader } from "@/components/app-header";
import { LOCAL_MODE_ENABLED } from "@/lib/local-mode";

function statusLabel(status: Game["status"]) {
  if (status === "active") return "Live";
  if (status === "final") return "Final";
  return "Setup";
}

function statusClasses(status: Game["status"]) {
  if (status === "active")
    return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (status === "final")
    return "bg-muted text-muted-foreground border-border";
  return "bg-blue-500/20 text-blue-400 border-blue-500/30";
}

function gameAction(game: Game): { label: string; href: string } {
  if (game.status === "setup")
    return {
      label: "Finish setup",
      href: `/setup/${game.id}/info?league=${game.leagueId}`,
    };
  if (game.status === "final")
    return {
      label: "Box score",
      href: `/game/${game.id}/box?league=${game.leagueId}`,
    };
  return {
    label: "Open capture",
    href: `/game/${game.id}?league=${game.leagueId}`,
  };
}

function roleBadge(role: string) {
  const classes =
    role === "admin"
      ? "bg-primary/20 text-primary border-primary/30"
      : role === "scorer"
        ? "bg-violet-500/20 text-violet-400 border-violet-500/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border ${classes}`}
    >
      {role}
    </span>
  );
}

export default function LeaguesHub() {
  const queryClient = useQueryClient();
  const { data: leagues, isLoading: leaguesLoading } = useListLeagues();
  const { data: allGames, isLoading: gamesLoading } = useListGames();

  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [season, setSeason] = useState("");
  const [, setLocation] = useLocation();

  const memberQueries = useQueries({
    queries: (leagues ?? []).map((league) => ({
      queryKey: ["leagueMembers", league.id],
      queryFn: () => listLeagueMembers(league.id),
      staleTime: 60_000,
    })),
  });

  const memberCountMap = new Map(
    (leagues ?? []).map((league, i) => [
      league.id,
      memberQueries[i]?.data?.length ?? null,
    ]),
  );

  const createLeague = useCreateLeague({
    mutation: {
      onSuccess: (league) => {
        toast.success("League created");
        setCreateOpen(false);
        setName("");
        setSeason("");
        queryClient.invalidateQueries({ queryKey: getListLeaguesQueryKey() });
        queryClient.invalidateQueries({ queryKey: getListGamesQueryKey() });
        setLocation(`/leagues/${league.id}`);
      },
      onError: () => toast.error("Failed to create league"),
    },
  });

  const upcomingGames =
    allGames
      ?.filter((g) => g.status !== "final")
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      .slice(0, 10) ?? [];

  const leagueMap = new Map((leagues ?? []).map((l) => [l.id, l]));

  const hasLeagues = (leagues?.length ?? 0) > 0;
  const canCreateLeague = true;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <AppHeader />

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <p className="sa-eyebrow mb-2">Swish Stats</p>
              <h1 className="text-4xl md:text-5xl font-bold">League hub</h1>
              <p className="text-muted-foreground mt-1">
                {hasLeagues
                  ? "Your active leagues and upcoming games"
                  : "Create your first league to start tracking games"}
              </p>
            </div>
            {canCreateLeague && hasLeagues && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="w-4 h-4" />
                New league
              </Button>
            )}
          </div>

          {leaguesLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !hasLeagues ? (
            <div className="flex flex-col items-center justify-center py-24 gap-6 text-center sa-card">
              <span className="sa-icon-tile !w-14 !h-14 !rounded-2xl">
                <Trophy className="w-7 h-7" />
              </span>
              <div>
                <h2 className="text-2xl font-bold">No leagues yet</h2>
                <p className="text-muted-foreground mt-1 max-w-xs mx-auto">
                  {LOCAL_MODE_ENABLED
                    ? "Local mode is active — leagues you create live in this browser."
                    : "Create your first league and invite your team to start tracking games."}
                </p>
              </div>
              {canCreateLeague && (
                <Button size="lg" onClick={() => setCreateOpen(true)}>
                  <Plus className="w-5 h-5 mr-2" />
                  Create first league
                </Button>
              )}
            </div>
          ) : (
            <>
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">Upcoming games</h2>
                  {gamesLoading && (
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  )}
                </div>

                {!gamesLoading && upcomingGames.length === 0 ? (
                  <div className="sa-card px-6 py-10 text-center text-muted-foreground text-sm">
                    No upcoming games across your leagues. Open a league to
                    schedule one.
                  </div>
                ) : (
                  <div className="divide-y divide-border sa-card overflow-hidden">
                    {upcomingGames.map((game) => {
                      const league = game.leagueId
                        ? leagueMap.get(game.leagueId)
                        : null;
                      const role = league?.viewerRole;
                      const canScore =
                        role === "scorer" || role === "admin";
                      const canAdmin = role === "admin";

                      const allowed =
                        game.status === "active"
                          ? canScore
                          : game.status === "setup"
                            ? canAdmin
                            : true;

                      const actionLabel =
                        game.status === "active"
                          ? canScore
                            ? "Open capture"
                            : "View only"
                          : game.status === "setup"
                            ? canAdmin
                              ? "Finish setup"
                              : "Awaiting setup"
                            : "Box score";

                      const { href } = gameAction(game);

                      return (
                        <div
                          key={game.id}
                          className="flex items-center gap-4 px-5 py-4 hover:bg-accent/30 transition-colors"
                        >
                          <div
                            className={`w-2 h-2 rounded-full shrink-0 ${
                              game.status === "active"
                                ? "bg-emerald-400"
                                : "bg-blue-400"
                            }`}
                          />
                          <div className="flex-1 min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium truncate">
                                {game.competition || "Exhibition game"}
                              </span>
                              <span
                                className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border ${statusClasses(game.status)}`}
                              >
                                {statusLabel(game.status)}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                              {league && (
                                <span className="font-medium text-foreground/60">
                                  {league.name}
                                </span>
                              )}
                              <span className="flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(game.date), "MMM d, yyyy")}
                              </span>
                              {game.venue && (
                                <span className="flex items-center gap-1">
                                  <MapPin className="w-3 h-3" />
                                  {game.venue}
                                </span>
                              )}
                            </div>
                          </div>
                          {allowed ? (
                            <Link href={href}>
                              <Button
                                size="sm"
                                variant={
                                  game.status === "active"
                                    ? "default"
                                    : "outline"
                                }
                                className="shrink-0 gap-1.5"
                              >
                                {game.status === "active" && (
                                  <Zap className="w-3.5 h-3.5" />
                                )}
                                {actionLabel}
                              </Button>
                            </Link>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="shrink-0"
                              disabled
                            >
                              {actionLabel}
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-bold">
                    Your leagues{" "}
                    <span className="text-muted-foreground font-normal text-base">
                      ({leagues?.length ?? 0})
                    </span>
                  </h2>
                </div>

                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {(leagues ?? []).map((league) => {
                    const activeGame = allGames?.find(
                      (g) => g.leagueId === league.id && g.status === "active",
                    );
                    const memberCount = memberCountMap.get(league.id);
                    return (
                      <Link
                        key={league.id}
                        href={`/leagues/${league.id}`}
                        className="sa-card sa-card-hover group block p-5"
                        data-testid="league-card"
                      >
                        <div className="flex items-start gap-3">
                          <span className="sa-icon-tile">
                            <Trophy className="w-5 h-5" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <h3 className="sa-display text-2xl font-bold leading-none truncate">
                              {league.name}
                            </h3>
                            <p className="text-xs text-muted-foreground mt-1.5 truncate">
                              {league.season || "League"}
                            </p>
                          </div>
                          {roleBadge(league.viewerRole)}
                        </div>

                        <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
                          <span className="flex items-center gap-1.5">
                            <Users className="w-4 h-4" />
                            {memberCount == null ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <>
                                {memberCount} member
                                {memberCount !== 1 ? "s" : ""}
                              </>
                            )}
                          </span>
                          {activeGame && (
                            <span className="flex items-center gap-1.5 text-emerald-400 font-medium">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block animate-pulse" />
                              Live now
                            </span>
                          )}
                        </div>

                        <span className="sa-link mt-5">
                          {league.viewerRole === "admin" ? "Manage league" : "Open league"}
                          <ArrowRight className="w-4 h-4" />
                        </span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            </>
          )}
        </div>
      </main>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create a new league</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="lname">League name</Label>
              <Input
                id="lname"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Saturday Hoops"
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lseason">Season (optional)</Label>
              <Input
                id="lseason"
                value={season}
                onChange={(e) => setSeason(e.target.value)}
                placeholder="e.g. Spring 2026"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() =>
                createLeague.mutate({
                  data: {
                    name,
                    season: season.trim() ? season.trim() : null,
                  },
                })
              }
              disabled={!name.trim() || createLeague.isPending}
            >
              {createLeague.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Create league
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
