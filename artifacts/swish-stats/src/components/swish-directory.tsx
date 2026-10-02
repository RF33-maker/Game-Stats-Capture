import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Loader2, Search, WifiOff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { CompetitionResult, PlayerResult, TeamResult } from "@/components/directory-search";
import {
  dedupeRoster, searchCompetitions, searchPlayers, searchTeams,
  type SiteCompetition, type SiteTeam,
} from "@/lib/directory";

// Browse the whole Swish database — competitions → teams → rosters — or search
// players directly, to plan rosters before game day. Read-only: linking happens
// in game setup or on the "Link players" screen.

type Tab = "players" | "teams" | "competitions";

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function Status({ loading, error, empty, hint }: { loading: boolean; error: unknown; empty: boolean; hint?: string }) {
  if (loading) return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
  if (error) return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500">
      <WifiOff className="w-4 h-4 mt-0.5 shrink-0" />{error instanceof Error ? error.message : String(error)}
    </div>
  );
  if (empty) return <p className="py-8 text-center text-sm text-muted-foreground">{hint ?? "Nothing found."}</p>;
  return null;
}

export function SwishDirectory() {
  const [tab, setTab] = useState<Tab>("players");
  const [query, setQuery] = useState("");
  const [competition, setCompetition] = useState<SiteCompetition | null>(null);
  const [team, setTeam] = useState<SiteTeam | null>(null);
  const q = useDebounced(query.trim());

  // Drill-down: competition → its teams → a team's roster.
  const drilled = team ? "roster" : competition ? "teams-in" : null;

  const players = useQuery({
    queryKey: ["dir-players", q],
    queryFn: () => searchPlayers(q, { limit: 50 }),
    enabled: !drilled && tab === "players" && q.length >= 2,
    retry: false, staleTime: 60_000,
  });
  const teams = useQuery({
    queryKey: ["dir-teams", q],
    queryFn: () => searchTeams(q, null, 50),
    enabled: !drilled && tab === "teams" && q.length >= 2,
    retry: false, staleTime: 60_000,
  });
  const competitions = useQuery({
    queryKey: ["dir-competitions", q],
    queryFn: () => searchCompetitions(q, 50),
    enabled: !drilled && tab === "competitions",
    retry: false, staleTime: 60_000,
  });
  const teamsIn = useQuery({
    queryKey: ["dir-teams-in", competition?.competitionId],
    queryFn: () => searchTeams("", competition!.competitionId, 100),
    enabled: drilled === "teams-in",
    retry: false, staleTime: 60_000,
  });
  const roster = useQuery({
    queryKey: ["dir-roster", team?.teamId],
    queryFn: async () => dedupeRoster(await searchPlayers("", { teamId: team!.teamId, limit: 200 })),
    enabled: drilled === "roster",
    retry: false, staleTime: 60_000,
  });

  const tabs: { id: Tab; label: string }[] = [
    { id: "players", label: "Players" },
    { id: "teams", label: "Teams" },
    { id: "competitions", label: "Competitions" },
  ];

  return (
    <div className="space-y-4" data-testid="swish-directory">
      {drilled ? (
        <div className="flex items-center gap-1.5 text-sm flex-wrap">
          <button className="text-muted-foreground hover:text-foreground" onClick={() => { setCompetition(null); setTeam(null); }}>
            Directory
          </button>
          {competition && (
            <>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <button className={team ? "text-muted-foreground hover:text-foreground" : "font-semibold"} onClick={() => setTeam(null)}>
                {competition.name}{competition.season ? ` · ${competition.season}` : ""}
              </button>
            </>
          )}
          {team && (
            <>
              <ChevronRight className="w-4 h-4 text-muted-foreground" />
              <span className="font-semibold">{team.name}</span>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="flex gap-1.5">
            {tabs.map(t => (
              <button key={t.id} type="button" onClick={() => { setTab(t.id); setQuery(""); }}
                className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${tab === t.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder={tab === "players" ? "Search players by name or number" : tab === "teams" ? "Search teams" : "Search competitions"}
              data-testid="directory-search" />
          </div>
        </>
      )}

      <div className="space-y-1.5">
        {drilled === "roster" && (
          <>
            <Status loading={roster.isLoading} error={roster.error} empty={!roster.isLoading && !roster.error && (roster.data?.length ?? 0) === 0} hint="No players on this team yet." />
            {roster.data?.map(p => <PlayerResult key={p.playerId} p={p} />)}
          </>
        )}
        {drilled === "teams-in" && (
          <>
            <Status loading={teamsIn.isLoading} error={teamsIn.error} empty={!teamsIn.isLoading && !teamsIn.error && (teamsIn.data?.length ?? 0) === 0} hint="No teams in this competition yet." />
            {teamsIn.data?.map(t => <TeamResult key={t.teamId} t={t} onPick={setTeam} actionLabel="Roster" />)}
          </>
        )}
        {!drilled && tab === "players" && (
          q.length < 2 ? <p className="py-8 text-center text-sm text-muted-foreground">Type at least 2 letters to search every player on Swish.</p> : (
            <>
              <Status loading={players.isLoading} error={players.error} empty={!players.isLoading && !players.error && (players.data?.length ?? 0) === 0} />
              {players.data?.map(p => <PlayerResult key={p.playerId} p={p} />)}
            </>
          )
        )}
        {!drilled && tab === "teams" && (
          q.length < 2 ? <p className="py-8 text-center text-sm text-muted-foreground">Type at least 2 letters to search teams.</p> : (
            <>
              <Status loading={teams.isLoading} error={teams.error} empty={!teams.isLoading && !teams.error && (teams.data?.length ?? 0) === 0} />
              {teams.data?.map(t => <TeamResult key={t.teamId} t={t} onPick={(picked) => { setTeam(picked); setCompetition({ competitionId: picked.competitionId, name: picked.competitionName, season: picked.season } as SiteCompetition); }} actionLabel="Roster" />)}
            </>
          )
        )}
        {!drilled && tab === "competitions" && (
          <>
            <Status loading={competitions.isLoading} error={competitions.error} empty={!competitions.isLoading && !competitions.error && (competitions.data?.length ?? 0) === 0} />
            {competitions.data?.map(c => <CompetitionResult key={c.competitionId} c={c} onPick={setCompetition} actionLabel="Teams" />)}
          </>
        )}
      </div>
    </div>
  );
}
