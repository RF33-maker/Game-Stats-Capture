import { useRoute, Link, useSearch } from "wouter";
import { formatMinutes } from "@/lib/game-state";
import { 
  useGetGame, 
  useListTeams, 
  useGetBoxScore,
  getGetGameQueryKey,
  getListTeamsQueryKey,
  getGetBoxScoreQueryKey
} from "@workspace/api-client-react";
import { Loader2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppMenu } from "@/components/app-menu";
import { teamTextColor, textOnColor, appSurface } from "@/lib/team-colors";

// Stats credited to the team rather than a player (e.g. team rebounds).
// Only shown when there is something in it.
function teamRow<P extends { playerId: number }>(stats: { players: P[] }): P[] {
  const line = (stats as unknown as { teamLine?: P }).teamLine;
  if (!line) return [];
  const hasAnything = Object.entries(line as Record<string, unknown>)
    .some(([k, v]) => typeof v === "number" && v > 0 && k !== "playerId" && k !== "teamId");
  return hasAnything ? [line] : [];
}

// Minutes and plus/minus come from the on-device engine; the generated client doesn't know them.
const extra = (p: unknown) => p as { secondsPlayed?: number; plusMinus?: number };

export default function BoxScore() {
  const [, params] = useRoute("/game/:gameId/box");
  const gameId = Number(params?.gameId);
  const search = useSearch();
  const leagueQuery = new URLSearchParams(search).get("league");

  const { data: game, isLoading: gameLoading } = useGetGame(gameId, {
    query: { enabled: !!gameId, queryKey: getGetGameQueryKey(gameId) }
  });

  const effectiveLeagueId =
    leagueQuery ?? (game?.leagueId != null ? String(game.leagueId) : null);
  const backHref = effectiveLeagueId
    ? `/leagues/${effectiveLeagueId}`
    : `/game/${gameId}`;
  
  const { data: teams, isLoading: teamsLoading } = useListTeams(gameId, {
    query: { enabled: !!gameId, queryKey: getListTeamsQueryKey(gameId) }
  });

  const { data: boxScore, isLoading: boxLoading } = useGetBoxScore(gameId, {
    query: { enabled: !!gameId, queryKey: getGetBoxScoreQueryKey(gameId) }
  });

  if (gameLoading || teamsLoading || boxLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const homeTeam = teams?.find(t => t.isHome);
  const awayTeam = teams?.find(t => !t.isHome);

  if (!boxScore || !homeTeam || !awayTeam) return null;

  return (
    <div className="min-h-[100dvh] bg-background text-foreground p-8">
      <div className="max-w-6xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href={backHref}>
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">BOX SCORE</h1>
              <p className="text-muted-foreground text-sm">
                {game?.competition} • Period {game?.currentPeriod} • {Math.floor((game?.clockSeconds || 0) / 60)}:{(game?.clockSeconds || 0) % 60 < 10 ? '0' : ''}{(game?.clockSeconds || 0) % 60}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-8 text-3xl font-black font-mono">
              <div className="flex items-center gap-4">
                <span style={{ color: teamTextColor(awayTeam.colorPrimary, appSurface()) }}>{awayTeam.abbreviation}</span>
                <span>{boxScore.away.totalPoints}</span>
              </div>
              <span className="text-muted-foreground">-</span>
              <div className="flex items-center gap-4">
                <span>{boxScore.home.totalPoints}</span>
                <span style={{ color: teamTextColor(homeTeam.colorPrimary, appSurface()) }}>{homeTeam.abbreviation}</span>
              </div>
            </div>
            <AppMenu />
          </div>
        </header>

        <div className="space-y-8">
          {[
            { team: awayTeam, stats: boxScore.away },
            { team: homeTeam, stats: boxScore.home }
          ].map(({ team, stats }) => (
            <div key={team.id} className="sa-card overflow-hidden">
              <div 
                className="px-4 py-3 font-bold text-lg"
                style={{ backgroundColor: team.colorPrimary, color: textOnColor(team.colorPrimary) }}
              >
                {team.name}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 text-muted-foreground border-b text-xs font-semibold">
                    <tr>
                      <th className="px-4 py-3">PLAYER</th>
                      <th className="px-2 py-3 text-right">MIN</th>
                      <th className="px-2 py-3 text-right">PTS</th>
                      <th className="px-2 py-3 text-right">FG</th>
                      <th className="px-2 py-3 text-right">2PT</th>
                      <th className="px-2 py-3 text-right">3PT</th>
                      <th className="px-2 py-3 text-right">FT</th>
                      <th className="px-2 py-3 text-right">OREB</th>
                      <th className="px-2 py-3 text-right">DREB</th>
                      <th className="px-2 py-3 text-right">REB</th>
                      <th className="px-2 py-3 text-right">AST</th>
                      <th className="px-2 py-3 text-right">STL</th>
                      <th className="px-2 py-3 text-right">BLK</th>
                      <th className="px-2 py-3 text-right">TOV</th>
                      <th className="px-2 py-3 text-right">PF</th>
                      <th className="px-2 py-3 text-right">+/-</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {[...stats.players, ...teamRow(stats)].map((p) => (
                      <tr key={p.playerId} className="hover:bg-muted/20">
                        <td className="px-4 py-3 font-medium">
                          <span className="text-muted-foreground text-xs w-6 inline-block">{p.jerseyNumber}</span>
                          {p.playerId === 0 ? <span className="italic text-muted-foreground">Team</span> : <>{p.lastName}, {p.firstName[0]}.</>}
                        </td>
                        <td className="px-2 py-3 text-right text-muted-foreground tabular-nums">
                          {p.playerId === 0 ? "" : formatMinutes(extra(p).secondsPlayed ?? 0)}
                        </td>
                        <td className="px-2 py-3 text-right font-bold">{p.points}</td>
                        <td className="px-2 py-3 text-right">{p.fgMade}-{p.fgAttempted}</td>
                        <td className="px-2 py-3 text-right">{p.twoPtMade}-{p.twoPtAttempted}</td>
                        <td className="px-2 py-3 text-right">{p.threePtMade}-{p.threePtAttempted}</td>
                        <td className="px-2 py-3 text-right">{p.ftMade}-{p.ftAttempted}</td>
                        <td className="px-2 py-3 text-right">{p.offensiveRebounds}</td>
                        <td className="px-2 py-3 text-right">{p.defensiveRebounds}</td>
                        <td className="px-2 py-3 text-right font-semibold">{p.totalRebounds}</td>
                        <td className="px-2 py-3 text-right">{p.assists}</td>
                        <td className="px-2 py-3 text-right">{p.steals}</td>
                        <td className="px-2 py-3 text-right">{p.blocks}</td>
                        <td className="px-2 py-3 text-right">{p.turnovers}</td>
                        <td className="px-2 py-3 text-right">{p.personalFouls + p.technicalFouls + p.flagrantFouls}</td>
                        <td className="px-2 py-3 text-right tabular-nums text-muted-foreground">
                          {p.playerId === 0 ? "" : `${(extra(p).plusMinus ?? 0) > 0 ? "+" : ""}${extra(p).plusMinus ?? 0}`}
                        </td>
                      </tr>
                    ))}
                    <tr className="bg-muted/10 font-bold border-t-2 border-border">
                      <td className="px-4 py-3">TOTALS</td>
                      <td className="px-2 py-3 text-right">-</td>
                      <td className="px-2 py-3 text-right">{stats.teamTotals.points}</td>
                      <td className="px-2 py-3 text-right">{stats.teamTotals.fgMade}-{stats.teamTotals.fgAttempted}</td>
                      <td className="px-2 py-3 text-right">{stats.teamTotals.twoPtMade}-{stats.teamTotals.twoPtAttempted}</td>
                      <td className="px-2 py-3 text-right">{stats.teamTotals.threePtMade}-{stats.teamTotals.threePtAttempted}</td>
                      <td className="px-2 py-3 text-right">{stats.teamTotals.ftMade}-{stats.teamTotals.ftAttempted}</td>
                      <td className="px-2 py-3 text-right">{stats.teamTotals.offensiveRebounds}</td>
                      <td className="px-2 py-3 text-right">{stats.teamTotals.defensiveRebounds}</td>
                      <td className="px-2 py-3 text-right">{stats.teamTotals.totalRebounds}</td>
                      <td className="px-2 py-3 text-right">{stats.teamTotals.assists}</td>
                      <td className="px-2 py-3 text-right">{stats.teamTotals.steals}</td>
                      <td className="px-2 py-3 text-right">{stats.teamTotals.blocks}</td>
                      <td className="px-2 py-3 text-right">{stats.teamTotals.turnovers}</td>
                      <td className="px-2 py-3 text-right">{stats.teamTotals.personalFouls + stats.teamTotals.technicalFouls + stats.teamTotals.flagrantFouls}</td>
                      <td className="px-2 py-3 text-right" />
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
