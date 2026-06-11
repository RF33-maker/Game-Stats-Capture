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
  Trophy,
  CalendarDays,
  Zap,
  CheckCircle2,
  Clock,
  ChevronRight,
  BarChart3,
} from "lucide-react";

export default function Stats() {
  const { data: leagues, isLoading: leaguesLoading } = useListLeagues();
  const { data: games, isLoading: gamesLoading } = useListGames();

  const loading = leaguesLoading || gamesLoading;

  const allGames = games ?? [];
  const totals = {
    leagues: leagues?.length ?? 0,
    games: allGames.length,
    live: allGames.filter((g) => g.status === "active").length,
    final: allGames.filter((g) => g.status === "final").length,
    setup: allGames.filter((g) => g.status === "setup").length,
  };

  const leagueMap = new Map((leagues ?? []).map((l) => [l.id, l]));

  const perLeague = (leagues ?? [])
    .map((league) => {
      const lg = allGames.filter((g) => g.leagueId === league.id);
      return {
        league,
        total: lg.length,
        live: lg.filter((g) => g.status === "active").length,
        final: lg.filter((g) => g.status === "final").length,
      };
    })
    .sort((a, b) => b.total - a.total);

  const recentFinal = allGames
    .filter((g) => g.status === "final")
    .sort(
      (a, b) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    )
    .slice(0, 6);

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <AppHeader showBack={{ href: "/leagues", label: "League hub" }} />

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Stats &amp; analytics
            </h1>
            <p className="text-muted-foreground mt-1">
              A snapshot across all of your leagues and games.
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : totals.games === 0 && totals.leagues === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 gap-5 text-center border border-dashed rounded-2xl bg-card/40">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
                <BarChart3 className="w-8 h-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-bold">No data yet</h2>
                <p className="text-muted-foreground mt-1 max-w-xs mx-auto">
                  Create a league and capture a game to see your analytics here.
                </p>
              </div>
              <Link href="/leagues">
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline cursor-pointer">
                  Go to League Hub
                  <ChevronRight className="w-4 h-4" />
                </span>
              </Link>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <StatCard icon={Trophy} label="Leagues" value={totals.leagues} />
                <StatCard
                  icon={CalendarDays}
                  label="Games"
                  value={totals.games}
                />
                <StatCard
                  icon={Zap}
                  label="Live now"
                  value={totals.live}
                  accent="text-emerald-400"
                />
                <StatCard
                  icon={CheckCircle2}
                  label="Completed"
                  value={totals.final}
                />
              </div>

              <section className="space-y-4">
                <h2 className="text-lg font-semibold">By league</h2>
                {perLeague.length === 0 ? (
                  <EmptyRow text="No leagues yet." />
                ) : (
                  <div className="divide-y divide-border rounded-xl border bg-card overflow-hidden">
                    {perLeague.map(({ league, total, live, final }) => (
                      <Link
                        key={league.id}
                        href={`/leagues/${league.id}`}
                        className="flex items-center gap-4 px-5 py-4 hover:bg-accent/30 transition-colors"
                      >
                        <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                          <Trophy className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {league.name}
                          </div>
                          {league.season && (
                            <div className="text-xs text-muted-foreground truncate">
                              {league.season}
                            </div>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                          <Metric label="games" value={total} />
                          {live > 0 && (
                            <Metric
                              label="live"
                              value={live}
                              className="text-emerald-400"
                            />
                          )}
                          <Metric label="final" value={final} />
                        </div>
                        <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                      </Link>
                    ))}
                  </div>
                )}
              </section>

              <section className="space-y-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  Recent completed games
                </h2>
                {recentFinal.length === 0 ? (
                  <EmptyRow text="No completed games yet." />
                ) : (
                  <div className="divide-y divide-border rounded-xl border bg-card overflow-hidden">
                    {recentFinal.map((game) => (
                      <FinalGameRow
                        key={game.id}
                        game={game}
                        leagueName={
                          game.leagueId
                            ? leagueMap.get(game.leagueId)?.name ?? null
                            : null
                        }
                      />
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Trophy;
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            {label}
          </span>
          <Icon className={`w-4 h-4 ${accent ?? "text-primary"}`} />
        </div>
        <div className={`mt-2 text-3xl font-black tabular-nums ${accent ?? ""}`}>
          {value}
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <span className={`flex flex-col items-center ${className ?? ""}`}>
      <span className="text-sm font-bold tabular-nums text-foreground">
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wider">{label}</span>
    </span>
  );
}

function FinalGameRow({
  game,
  leagueName,
}: {
  game: Game;
  leagueName: string | null;
}) {
  const href = `/game/${game.id}/box${game.leagueId ? `?league=${game.leagueId}` : ""}`;
  return (
    <Link
      href={href}
      className="flex items-center gap-4 px-5 py-4 hover:bg-accent/30 transition-colors"
    >
      <div className="w-9 h-9 rounded-lg bg-muted text-muted-foreground flex items-center justify-center shrink-0">
        <BarChart3 className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {game.competition || "Exhibition game"}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {leagueName ? `${leagueName} · ` : ""}
          {new Date(game.date).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
    </Link>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-card/40 px-6 py-10 text-center text-muted-foreground text-sm">
      {text}
    </div>
  );
}
