import { Link } from "wouter";
import {
  useListLeagues,
  useListGames,
  type Game,
} from "@workspace/api-client-react";
import { AppHeader } from "@/components/app-header";
import { Card, CardContent } from "@/components/ui/card";
import {
  Loader2,
  ClipboardList,
  Users,
  ChevronRight,
  Calendar,
  Trophy,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SwishDirectory } from "@/components/swish-directory";
import { DIRECTORY_AVAILABLE } from "@/lib/directory";

function statusLabel(status: Game["status"]) {
  if (status === "active") return "Live";
  if (status === "final") return "Final";
  return "Setup";
}

function statusClasses(status: Game["status"]) {
  if (status === "active")
    return "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
  if (status === "final") return "bg-muted text-muted-foreground border-border";
  return "bg-blue-500/20 text-blue-400 border-blue-500/30";
}

export default function Organizer() {
  const { data: leagues, isLoading: leaguesLoading } = useListLeagues();
  const { data: games, isLoading: gamesLoading } = useListGames();

  const loading = leaguesLoading || gamesLoading;
  const allGames = games ?? [];
  const hasLeagues = (leagues?.length ?? 0) > 0;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <AppHeader showBack={{ href: "/leagues", label: "League hub" }} />

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
          <div>
            <p className="sa-eyebrow mb-2">Organiser</p>
            <h1 className="text-4xl md:text-5xl font-bold">
              Swish Organiser
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage teams and player rosters across your leagues. Open a game
              to edit its teams and players.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : !hasLeagues ? (
            <div className="flex flex-col items-center justify-center py-24 gap-5 text-center sa-card">
              <div className="sa-icon-tile !w-14 !h-14 !rounded-2xl">
                <ClipboardList className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Nothing to organize yet</h2>
                <p className="text-muted-foreground mt-1 max-w-xs mx-auto">
                  Create a league and a game first, then manage its teams and
                  players here.
                </p>
              </div>
              <Link href="/leagues">
                <Button>
                  <Trophy className="w-4 h-4 mr-2" />
                  Go to League Hub
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-8">
              {(leagues ?? []).map((league) => {
                const leagueGames = allGames
                  .filter((g) => g.leagueId === league.id)
                  .sort(
                    (a, b) =>
                      new Date(b.date).getTime() - new Date(a.date).getTime(),
                  );
                const canManage = league.viewerRole === "admin";

                return (
                  <section key={league.id} className="space-y-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <Trophy className="w-4 h-4 text-primary shrink-0" />
                        <h2 className="text-2xl font-bold truncate">
                          {league.name}
                        </h2>
                        <span className="text-sm text-muted-foreground shrink-0">
                          ({leagueGames.length})
                        </span>
                      </div>
                      <Link href={`/leagues/${league.id}`}>
                        <Button variant="outline" size="sm" className="shrink-0">
                          Open league
                          <ChevronRight className="w-3.5 h-3.5 ml-1" />
                        </Button>
                      </Link>
                    </div>

                    {leagueGames.length === 0 ? (
                      <div className="sa-card px-6 py-8 text-center text-muted-foreground text-sm">
                        No games in this league yet.
                        {canManage && (
                          <>
                            {" "}
                            Open the league to{" "}
                            <span className="text-foreground font-medium">
                              create a game
                            </span>
                            .
                          </>
                        )}
                      </div>
                    ) : (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {leagueGames.map((game) => {
                          const teamsHref = `/setup/${game.id}/teams?league=${league.id}`;
                          const playersHref = `/setup/${game.id}/players?league=${league.id}`;
                          return (
                            <Card
                              key={game.id}
                              className="bg-card border hover:border-primary/30 transition-colors"
                            >
                              <CardContent className="p-5 space-y-4">
                                <div className="flex items-center justify-between">
                                  <span
                                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border ${statusClasses(game.status)}`}
                                  >
                                    {statusLabel(game.status)}
                                  </span>
                                  <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                                    <Calendar className="w-3 h-3" />
                                    {new Date(game.date).toLocaleDateString(
                                      undefined,
                                      {
                                        month: "short",
                                        day: "numeric",
                                      },
                                    )}
                                  </span>
                                </div>

                                <h3 className="font-semibold leading-tight truncate">
                                  {game.competition || "Exhibition game"}
                                </h3>

                                {canManage ? (
                                  <div className="grid grid-cols-2 gap-2">
                                    <Link href={teamsHref} className="contents">
                                      <Button
                                        size="sm"
                                        variant="secondary"
                                        className="w-full gap-1.5"
                                      >
                                        <Users className="w-3.5 h-3.5" />
                                        Teams
                                      </Button>
                                    </Link>
                                    <Link href={playersHref} className="contents">
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        className="w-full gap-1.5"
                                      >
                                        <ClipboardList className="w-3.5 h-3.5" />
                                        Players
                                      </Button>
                                    </Link>
                                  </div>
                                ) : (
                                  <p className="text-xs text-muted-foreground">
                                    Admin role required to edit rosters.
                                  </p>
                                )}
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {DIRECTORY_AVAILABLE && (
            <section className="space-y-4 border-t border-border pt-8">
              <div>
                <h2 className="text-2xl font-bold">Swish directory</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  Every player, team and competition on Swish Assistant. Find people before game day,
                  then link them in game setup so their stats land on their existing profiles.
                </p>
              </div>
              <SwishDirectory />
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
