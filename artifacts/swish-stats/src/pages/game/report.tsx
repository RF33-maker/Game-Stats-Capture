import { useRoute, Link, useSearch } from "wouter";
import { useQuery } from "@tanstack/react-query";
import {
  useGetGame, useListTeams, useGetBoxScore, useListPlayByPlay,
  getGetGameQueryKey, getListTeamsQueryKey, getGetBoxScoreQueryKey, getListPlayByPlayQueryKey,
} from "@workspace/api-client-react";
import { format } from "date-fns";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatMinutes, periodLabel } from "@/lib/game-state";
import { ORGANISER_AVAILABLE, listOfficials, officialRoleName } from "@/lib/organiser";

type Line = {
  playerId: number; jerseyNumber: string; firstName: string; lastName: string; points: number;
  fgMade: number; fgAttempted: number; twoPtMade: number; twoPtAttempted: number; threePtMade: number; threePtAttempted: number;
  ftMade: number; ftAttempted: number; offensiveRebounds: number; defensiveRebounds: number; totalRebounds: number;
  assists: number; steals: number; turnovers: number; blocks: number; personalFouls: number; technicalFouls: number; flagrantFouls: number;
  secondsPlayed?: number; plusMinus?: number; isStarter?: boolean;
};
type TeamBox = { name: string; totalPoints: number; players: Line[]; teamLine?: Line; teamTotals: Line };

const pct = (m: number, a: number) => (a ? `${Math.round((m / a) * 100)}%` : "—");
const fouls = (l: Line) => l.personalFouls + l.technicalFouls + l.flagrantFouls;

/** The one-page game report: the sheet that gets printed, signed and filed. */
export default function GameReport() {
  const [, params] = useRoute("/game/:gameId/report");
  const gameId = Number(params?.gameId);
  const search = useSearch();
  const league = new URLSearchParams(search).get("league");
  const qs = league ? `?league=${league}` : "";

  const { data: game } = useGetGame(gameId, { query: { enabled: !!gameId, queryKey: getGetGameQueryKey(gameId) } });
  const { data: teams } = useListTeams(gameId, { query: { enabled: !!gameId, queryKey: getListTeamsQueryKey(gameId) } });
  const { data: box } = useGetBoxScore(gameId, { query: { enabled: !!gameId, queryKey: getGetBoxScoreQueryKey(gameId) } });
  const { data: pbp } = useListPlayByPlay(gameId, { query: { enabled: !!gameId, queryKey: getListPlayByPlayQueryKey(gameId) } });
  const g = game as (typeof game & {
    uid: string; tipoffTime?: string | null; roundLabel?: string | null; gameNumber?: number | null; attendance?: number | null;
  }) | undefined;
  const { data: officials } = useQuery({
    queryKey: ["organiser", "officials", g?.uid], queryFn: () => listOfficials(g!.uid),
    enabled: ORGANISER_AVAILABLE && !!g?.uid, retry: false,
  });

  if (!g || !teams || !box || !pbp) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }
  const home = teams.find(t => t.isHome)!;
  const away = teams.find(t => !t.isHome)!;
  const coach = (t: typeof home) => (t as typeof t & { headCoach?: string | null }).headCoach;

  // Score at the end of each period, from the running score on the plays.
  const periods = Array.from({ length: Math.max(g.periodCount, g.currentPeriod, ...pbp.map(p => p.period)) }, (_, i) => i + 1);
  const endOf = (period: number) => {
    const rows = pbp.filter(p => p.period <= period).sort((a, b) => a.id - b.id);
    const last = rows[rows.length - 1];
    return { home: last?.homeScore ?? 0, away: last?.awayScore ?? 0 };
  };
  const byPeriod = periods.map((p, i) => {
    const now = endOf(p), before = i ? endOf(periods[i - 1]) : { home: 0, away: 0 };
    return { period: p, home: now.home - before.home, away: now.away - before.away };
  });

  const info = [
    g.competition, g.roundLabel, g.gameNumber != null ? `Game ${g.gameNumber}` : null,
    `${format(new Date(g.date), "EEEE d MMMM yyyy")}${g.tipoffTime ? `, ${g.tipoffTime.slice(0, 5)}` : ""}`,
    g.venue, g.attendance != null ? `Attendance ${g.attendance}` : null,
  ].filter(Boolean);

  const table = (team: typeof home, stats: TeamBox) => {
    const rows = [...stats.players].sort((a, b) => Number(b.isStarter ?? false) - Number(a.isStarter ?? false) || Number(a.jerseyNumber) - Number(b.jerseyNumber));
    const t = stats.teamTotals;
    const cell = "px-1.5 py-1 text-right tabular-nums";
    const row = (l: Line, label: React.ReactNode, key: string, strong = false) => (
      <tr key={key} className={strong ? "font-bold border-t-2 border-black" : "border-t border-neutral-300"}>
        <td className="px-1.5 py-1 text-left whitespace-nowrap">{label}</td>
        <td className={cell}>{l.secondsPlayed != null ? formatMinutes(l.secondsPlayed) : ""}</td>
        <td className={`${cell} font-bold`}>{l.points}</td>
        <td className={cell}>{l.fgMade}/{l.fgAttempted}</td>
        <td className={cell}>{l.twoPtMade}/{l.twoPtAttempted}</td>
        <td className={cell}>{l.threePtMade}/{l.threePtAttempted}</td>
        <td className={cell}>{l.ftMade}/{l.ftAttempted}</td>
        <td className={cell}>{l.offensiveRebounds}</td>
        <td className={cell}>{l.defensiveRebounds}</td>
        <td className={cell}>{l.totalRebounds}</td>
        <td className={cell}>{l.assists}</td>
        <td className={cell}>{l.turnovers}</td>
        <td className={cell}>{l.steals}</td>
        <td className={cell}>{l.blocks}</td>
        <td className={cell}>{fouls(l)}</td>
        <td className={cell}>{l.plusMinus != null ? (l.plusMinus > 0 ? `+${l.plusMinus}` : l.plusMinus) : ""}</td>
      </tr>
    );
    return (
      <section className="break-inside-avoid">
        <div className="flex items-baseline justify-between border-b-2 border-black pb-1 mb-1">
          <h2 className="text-lg font-bold">{team.name} <span className="font-normal text-neutral-600">({team.isHome ? "home" : "away"})</span></h2>
          <span className="text-xs text-neutral-700">{coach(team) ? `Coach: ${coach(team)}` : ""}</span>
        </div>
        <table className="w-full text-[11px] border-collapse">
          <thead>
            <tr className="text-neutral-600">
              {["Player", "MIN", "PTS", "FG", "2PT", "3PT", "FT", "OR", "DR", "REB", "AST", "TO", "STL", "BLK", "PF", "+/-"].map((h, i) => (
                <th key={h} className={`px-1.5 py-1 font-semibold ${i ? "text-right" : "text-left"}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(l => row(l, <><span className="inline-block w-6 font-mono">{l.jerseyNumber}</span>{l.isStarter ? "*" : ""}{l.firstName} {l.lastName}</>, String(l.playerId)))}
            {stats.teamLine && (stats.teamLine.totalRebounds + stats.teamLine.turnovers + stats.teamLine.technicalFouls > 0)
              && row({ ...stats.teamLine, secondsPlayed: undefined, plusMinus: undefined }, <i>Team / bench</i>, "team")}
            {row({ ...t, secondsPlayed: undefined, plusMinus: undefined }, "Totals", "totals", true)}
          </tbody>
        </table>
        <p className="text-[10px] text-neutral-600 mt-1">
          FG {pct(t.fgMade, t.fgAttempted)} · 3PT {pct(t.threePtMade, t.threePtAttempted)} · FT {pct(t.ftMade, t.ftAttempted)} · * starter
        </p>
      </section>
    );
  };

  return (
    <div className="min-h-[100dvh] bg-neutral-200 print:bg-white text-black">
      <div className="print:hidden sticky top-0 z-10 bg-neutral-900 text-white px-4 py-2 flex items-center justify-between">
        <Link href={`/game/${gameId}/box${qs}`}>
          <Button variant="ghost" size="sm" className="text-white hover:bg-white/10"><ArrowLeft className="w-4 h-4 mr-2" />Box score</Button>
        </Link>
        <Button size="sm" onClick={() => window.print()} data-testid="print-report"><Printer className="w-4 h-4 mr-2" />Print or save as PDF</Button>
      </div>

      <main className="mx-auto max-w-[210mm] bg-white p-8 print:p-0 my-6 print:my-0 shadow-xl print:shadow-none space-y-5 font-sans" data-testid="game-report">
        <header className="space-y-2">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.2em] text-neutral-600">Game report {g.status !== "final" && "· not final"}</p>
              <h1 className="text-2xl font-bold leading-tight">{away.name} at {home.name}</h1>
            </div>
            <div className="text-right font-mono font-bold text-3xl whitespace-nowrap">{box.away.totalPoints} – {box.home.totalPoints}</div>
          </div>
          <p className="text-xs text-neutral-700">{info.join(" · ")}</p>
        </header>

        <table className="text-xs border-collapse">
          <thead>
            <tr className="text-neutral-600">
              <th className="px-2 py-1 text-left font-semibold">Score by period</th>
              {byPeriod.map(p => <th key={p.period} className="px-2 py-1 text-right font-semibold">{periodLabel(p.period, g.periodCount)}</th>)}
              <th className="px-2 py-1 text-right font-semibold">Final</th>
            </tr>
          </thead>
          <tbody>
            {([["away", away, box.away.totalPoints], ["home", home, box.home.totalPoints]] as const).map(([side, team, total]) => (
              <tr key={side} className="border-t border-neutral-300">
                <td className="px-2 py-1">{team.name}</td>
                {byPeriod.map(p => <td key={p.period} className="px-2 py-1 text-right tabular-nums">{p[side]}</td>)}
                <td className="px-2 py-1 text-right font-bold tabular-nums">{total}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {table(away, box.away as unknown as TeamBox)}
        {table(home, box.home as unknown as TeamBox)}

        <section className="grid grid-cols-2 gap-6 text-xs break-inside-avoid">
          <div>
            <h3 className="font-bold border-b border-black pb-1 mb-1">Officials</h3>
            {officials?.length
              ? officials.map(o => <p key={o.uid}><span className="text-neutral-600">{officialRoleName(o.role)}:</span> {o.name}</p>)
              : <p className="text-neutral-500">None recorded</p>}
          </div>
          <div className="space-y-5">
            <h3 className="font-bold border-b border-black pb-1">Signatures</h3>
            {["Crew chief", "Scorer"].map(s => <p key={s} className="border-b border-neutral-400 pb-4 text-neutral-600">{s}</p>)}
          </div>
        </section>

        <p className="text-[10px] text-neutral-500 text-center pt-2">Captured with Swish Stats · swishassistant.com</p>
      </main>
    </div>
  );
}
