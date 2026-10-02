import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Search, UserRound, Shield, Trophy, WifiOff } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  searchCompetitions, searchPlayers, searchTeams,
  type SiteCompetition, type SitePlayer, type SiteTeam,
} from "@/lib/directory";

function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

function seasonLabel(name: string, season: string | null) {
  return season ? `${name} · ${season}` : name;
}

function ResultState({ isLoading, error, empty, emptyText }: { isLoading: boolean; error: unknown; empty: boolean; emptyText: string }) {
  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>;
  }
  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-500">
        <WifiOff className="w-4 h-4 mt-0.5 shrink-0" />
        <span>{error instanceof Error ? error.message : String(error)}</span>
      </div>
    );
  }
  if (empty) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return null;
}

// ---------------------------------------------------------------------------

export function PlayerResult({ p, onPick, actionLabel = "Link" }: { p: SitePlayer; onPick?: (p: SitePlayer) => void; actionLabel?: string }) {
  const Row = onPick ? "button" : "div";
  return (
    <Row
      type={onPick ? "button" : undefined}
      onClick={onPick ? () => onPick(p) : undefined}
      className={`w-full flex items-center gap-3 rounded-lg border border-border p-2.5 text-left ${onPick ? "hover:bg-muted/60 hover:border-primary/40 transition-colors" : ""}`}
      data-testid="site-player-result"
    >
      {p.photoUrl ? (
        <img src={p.photoUrl} alt="" className="w-10 h-10 rounded-full object-cover bg-muted shrink-0" loading="lazy" />
      ) : (
        <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center shrink-0">
          <UserRound className="w-5 h-5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold truncate">{p.fullName}</span>
          {p.shirtNumber && <span className="font-mono text-xs text-muted-foreground">#{p.shirtNumber}</span>}
        </div>
        <div className="text-xs text-muted-foreground truncate">
          {[p.teamName, seasonLabel(p.competitionName, p.season)].filter(Boolean).join(" · ")}
        </div>
        {p.otherRows > 0 && (
          <div className="text-[11px] text-muted-foreground/80">Same name appears on {p.otherRows} other roster{p.otherRows === 1 ? "" : "s"}</div>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {p.ageGroup && <Badge variant="outline" className="text-[10px]">{p.ageGroup}</Badge>}
        {onPick && <span className="text-xs font-semibold text-primary">{actionLabel}</span>}
      </div>
    </Row>
  );
}

export function PlayerSearchDialog({
  open, onOpenChange, initialQuery = "", competitionId, teamId, onPick, title = "Find a player", description,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
  /** Search this competition first; the scorer can widen to everything. */
  competitionId?: string | null;
  teamId?: string | null;
  onPick: (p: SitePlayer) => void;
  title?: string;
  description?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [scope, setScope] = useState<"team" | "competition" | "all">(teamId ? "team" : competitionId ? "competition" : "all");
  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setScope(teamId ? "team" : competitionId ? "competition" : "all");
    }
  }, [open, initialQuery, teamId, competitionId]);
  const q = useDebounced(query.trim());

  const enabled = open && (q.length >= 2 || (scope === "team" && !!teamId));
  const { data, isLoading, error } = useQuery({
    queryKey: ["site-players", q, scope, competitionId, teamId],
    queryFn: () => searchPlayers(q, {
      teamId: scope === "team" ? teamId : null,
      competitionId: scope === "competition" ? competitionId : null,
      limit: 40,
    }),
    enabled,
    retry: false,
    staleTime: 60_000,
  });

  const scopes = [
    teamId ? { id: "team" as const, label: "This team" } : null,
    competitionId ? { id: "competition" as const, label: "This competition" } : null,
    { id: "all" as const, label: "All of Swish" },
  ].filter(Boolean) as { id: "team" | "competition" | "all"; label: string }[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description ?? "Pick the player's existing Swish profile so their stats land on it. Not listed? Close this and keep them as a new player."}
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input autoFocus className="pl-9" placeholder="Name or shirt number"
            value={query} onChange={(e) => setQuery(e.target.value)} data-testid="site-player-search" />
        </div>
        {scopes.length > 1 && (
          <div className="flex gap-1.5">
            {scopes.map(s => (
              <button key={s.id} type="button" onClick={() => setScope(s.id)}
                className={`px-2.5 py-1 rounded-full text-xs font-semibold border ${scope === s.id ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                {s.label}
              </button>
            ))}
          </div>
        )}
        <div className="max-h-[50vh] overflow-y-auto space-y-1.5 -mx-1 px-1">
          <ResultState
            isLoading={enabled && isLoading}
            error={error}
            empty={enabled && !isLoading && !error && (data?.length ?? 0) === 0}
            emptyText="No matching players."
          />
          {!enabled && !error && <p className="py-6 text-center text-sm text-muted-foreground">Type at least 2 letters.</p>}
          {data?.map(p => <PlayerResult key={p.playerId} p={p} onPick={onPick} />)}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function TeamResult({ t, onPick, actionLabel = "Link" }: { t: SiteTeam; onPick?: (t: SiteTeam) => void; actionLabel?: string }) {
  const Row = onPick ? "button" : "div";
  return (
    <Row type={onPick ? "button" : undefined} onClick={onPick ? () => onPick(t) : undefined}
      className={`w-full flex items-center gap-3 rounded-lg border border-border p-2.5 text-left ${onPick ? "hover:bg-muted/60 hover:border-primary/40 transition-colors" : ""}`}
      data-testid="site-team-result">
      {t.logoUrl ? (
        <img src={t.logoUrl} alt="" className="w-10 h-10 rounded-md object-contain bg-muted shrink-0" loading="lazy" />
      ) : (
        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0">
          <Shield className="w-5 h-5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{t.name}</div>
        <div className="text-xs text-muted-foreground truncate">
          {seasonLabel(t.competitionName, t.season)} · {t.playerCount} player{t.playerCount === 1 ? "" : "s"}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {t.ageGroup && <Badge variant="outline" className="text-[10px]">{t.ageGroup}</Badge>}
        {onPick && <span className="text-xs font-semibold text-primary">{actionLabel}</span>}
      </div>
    </Row>
  );
}

export function TeamSearchDialog({
  open, onOpenChange, initialQuery = "", competitionId, onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialQuery?: string;
  competitionId?: string | null;
  onPick: (t: SiteTeam) => void;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [inCompetition, setInCompetition] = useState(!!competitionId);
  useEffect(() => { if (open) { setQuery(initialQuery); setInCompetition(!!competitionId); } }, [open, initialQuery, competitionId]);
  const q = useDebounced(query.trim());
  const enabled = open && (q.length >= 2 || (inCompetition && !!competitionId));
  const { data, isLoading, error } = useQuery({
    queryKey: ["site-teams", q, inCompetition ? competitionId : null],
    queryFn: () => searchTeams(q, inCompetition ? competitionId : null, 40),
    enabled, retry: false, staleTime: 60_000,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Link to a Swish team</DialogTitle>
          <DialogDescription>
            Linking uses the team's existing page on Swish Assistant and lets you import its roster.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input autoFocus className="pl-9" placeholder="Team name" value={query}
            onChange={(e) => setQuery(e.target.value)} data-testid="site-team-search" />
        </div>
        {competitionId && (
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" checked={inCompetition} onChange={(e) => setInCompetition(e.target.checked)} />
            Only teams in this league's linked competition
          </label>
        )}
        <div className="max-h-[50vh] overflow-y-auto space-y-1.5 -mx-1 px-1">
          <ResultState isLoading={enabled && isLoading} error={error}
            empty={enabled && !isLoading && !error && (data?.length ?? 0) === 0} emptyText="No matching teams." />
          {!enabled && !error && <p className="py-6 text-center text-sm text-muted-foreground">Type at least 2 letters.</p>}
          {data?.map(t => <TeamResult key={t.teamId} t={t} onPick={onPick} />)}
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------

export function CompetitionResult({ c, onPick, actionLabel = "Link" }: { c: SiteCompetition; onPick?: (c: SiteCompetition) => void; actionLabel?: string }) {
  const Row = onPick ? "button" : "div";
  return (
    <Row type={onPick ? "button" : undefined} onClick={onPick ? () => onPick(c) : undefined}
      className={`w-full flex items-center gap-3 rounded-lg border border-border p-2.5 text-left ${onPick ? "hover:bg-muted/60 hover:border-primary/40 transition-colors" : ""}`}
      data-testid="site-competition-result">
      {c.logoUrl ? (
        <img src={c.logoUrl} alt="" className="w-10 h-10 rounded-md object-contain bg-muted shrink-0" loading="lazy" />
      ) : (
        <div className="w-10 h-10 rounded-md bg-muted flex items-center justify-center shrink-0">
          <Trophy className="w-5 h-5 text-muted-foreground" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="font-semibold truncate">{seasonLabel(c.name, c.season)}</div>
        <div className="text-xs text-muted-foreground truncate">
          {[c.organisation, `${c.teamCount} teams`, `${c.playerCount} players`].filter(Boolean).join(" · ")}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {c.ageGroup && <Badge variant="outline" className="text-[10px]">{c.ageGroup}</Badge>}
        {onPick && <span className="text-xs font-semibold text-primary">{actionLabel}</span>}
      </div>
    </Row>
  );
}

export function CompetitionSearchDialog({
  open, onOpenChange, onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (c: SiteCompetition) => void;
}) {
  const [query, setQuery] = useState("");
  const q = useDebounced(query.trim());
  const { data, isLoading, error } = useQuery({
    queryKey: ["site-competitions", q],
    queryFn: () => searchCompetitions(q, 40),
    enabled: open, retry: false, staleTime: 60_000,
  });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Link to a Swish competition</DialogTitle>
          <DialogDescription>
            Games from this league will be published into this competition on Swish Assistant.
          </DialogDescription>
        </DialogHeader>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input autoFocus className="pl-9" placeholder="Competition or organisation" value={query}
            onChange={(e) => setQuery(e.target.value)} data-testid="site-competition-search" />
        </div>
        <div className="max-h-[50vh] overflow-y-auto space-y-1.5 -mx-1 px-1">
          <ResultState isLoading={isLoading} error={error}
            empty={!isLoading && !error && (data?.length ?? 0) === 0} emptyText="No matching competitions." />
          {data?.map(c => <CompetitionResult key={c.competitionId} c={c} onPick={onPick} />)}
        </div>
      </DialogContent>
    </Dialog>
  );
}
