import { useState } from "react";
import { useRoute, useSearch } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  useGetGame, useListTeams, useListGamePlayers,
  getGetGameQueryKey, getListTeamsQueryKey, getListGamePlayersQueryKey,
  type Player, type Team,
} from "@workspace/api-client-react";
import { BadgeCheck, Check, Loader2, Pencil, Search, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlayerResult, PlayerSearchDialog } from "@/components/directory-search";
import { localApi, searchPlayers, type SitePlayer } from "@/lib/directory";

type LinkedTeam = Team & { siteTeamId?: string | null };
type LinkedPlayer = Player & { sitePlayerId?: string | null };

// Names typed on the day (offline, or nobody had the roster) get matched to
// existing Swish profiles after the game. Linking is metadata, so it's open
// to scorers at any time — even after the game is final.

function Suggestions({ player, team, competitionId, onLink }: {
  player: LinkedPlayer; team: LinkedTeam; competitionId: string | null; onLink: (sp: SitePlayer) => void;
}) {
  const name = `${player.firstName} ${player.lastName}`.trim();
  const { data, isLoading, error } = useQuery({
    queryKey: ["link-suggestions", name, team.siteTeamId, competitionId],
    queryFn: async () => {
      // Closest scope first: the linked team, then the competition, then everywhere.
      const scopes = [
        team.siteTeamId ? { teamId: team.siteTeamId } : null,
        competitionId ? { competitionId } : null,
        {},
      ].filter(Boolean) as { teamId?: string; competitionId?: string }[];
      for (const scope of scopes) {
        const hits = await searchPlayers(player.lastName || name, { ...scope, limit: 10 });
        const ranked = hits
          .map(h => ({ h, score:
            (h.fullName.toLowerCase() === name.toLowerCase() ? 4 : 0)
            + (h.fullName.toLowerCase().includes(player.firstName.toLowerCase()) ? 2 : 0)
            + (player.jerseyNumber && h.shirtNumber === player.jerseyNumber ? 1 : 0) }))
          .filter(x => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .map(x => x.h);
        if (ranked.length) return ranked.slice(0, 3);
      }
      return [];
    },
    enabled: name.length >= 2,
    retry: false,
    staleTime: 5 * 60_000,
  });
  if (isLoading) return <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3 h-3 animate-spin" /> Looking for matches…</div>;
  if (error) return <div className="text-xs text-amber-500">{error instanceof Error ? error.message : String(error)}</div>;
  if (!data?.length) return <div className="text-xs text-muted-foreground">No likely matches — search, or keep as a new player.</div>;
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">Likely matches</div>
      {data.map(sp => <PlayerResult key={sp.playerId} p={sp} onPick={onLink} />)}
    </div>
  );
}

function PlayerRow({ player, team, competitionId, onChanged }: {
  player: LinkedPlayer; team: LinkedTeam; competitionId: string | null; onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ jerseyNumber: player.jerseyNumber, firstName: player.firstName, lastName: player.lastName });
  const [searchOpen, setSearchOpen] = useState(false);
  const [keptNew, setKeptNew] = useState(false);

  const save = async (data: Record<string, unknown>, message: string) => {
    try {
      await localApi(`/api/players/${player.id}`, "PATCH", data);
      onChanged();
      toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save that");
    }
  };
  const link = (sp: SitePlayer) => save(
    { sitePlayerId: sp.playerId, headshotUrl: player.headshotUrl ?? sp.photoUrl },
    `Linked to ${sp.fullName}`,
  );

  return (
    <div className="rounded-xl border border-border bg-card p-3 space-y-3" data-testid="link-row">
      <div className="flex items-center gap-3">
        {editing ? (
          <form className="flex flex-1 gap-2" onSubmit={(e) => {
            e.preventDefault();
            setEditing(false);
            void save(draft, "Player updated");
          }}>
            <Input className="w-16" value={draft.jerseyNumber} onChange={(e) => setDraft({ ...draft, jerseyNumber: e.target.value })} placeholder="#" />
            <Input value={draft.firstName} onChange={(e) => setDraft({ ...draft, firstName: e.target.value })} placeholder="First" />
            <Input value={draft.lastName} onChange={(e) => setDraft({ ...draft, lastName: e.target.value })} placeholder="Last" />
            <Button type="submit" size="icon" title="Save"><Check className="w-4 h-4" /></Button>
            <Button type="button" size="icon" variant="ghost" title="Cancel" onClick={() => setEditing(false)}><X className="w-4 h-4" /></Button>
          </form>
        ) : (
          <>
            <div className="w-9 h-9 rounded-md border bg-background flex items-center justify-center font-mono font-bold text-sm shrink-0">
              {player.jerseyNumber || "–"}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-semibold truncate">{player.firstName} {player.lastName}</div>
              <div className="text-xs text-muted-foreground">{team.name}</div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit name or number" onClick={() => setEditing(true)}>
              <Pencil className="w-4 h-4" />
            </Button>
            {player.sitePlayerId ? (
              <>
                <span className="flex items-center gap-1 text-xs font-semibold text-emerald-500"><BadgeCheck className="w-4 h-4" /> Linked</span>
                <Button variant="ghost" size="sm" onClick={() => setSearchOpen(true)}>Change</Button>
                <Button variant="ghost" size="sm" onClick={() => save({ sitePlayerId: null }, "Unlinked")}>Unlink</Button>
              </>
            ) : (
              <>
                <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setSearchOpen(true)}>
                  <Search className="w-3.5 h-3.5" /> Search
                </Button>
                {!keptNew && (
                  <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => setKeptNew(true)} title="They're new to Swish — a profile is created when the game is published">
                    <UserPlus className="w-3.5 h-3.5" /> New player
                  </Button>
                )}
              </>
            )}
          </>
        )}
      </div>
      {!player.sitePlayerId && !keptNew && !editing && (
        <Suggestions player={player} team={team} competitionId={competitionId} onLink={link} />
      )}
      {!player.sitePlayerId && keptNew && (
        <div className="text-xs text-muted-foreground">Kept as new — a Swish profile is created for them when the game is published.</div>
      )}
      <PlayerSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        initialQuery={`${player.firstName} ${player.lastName}`.trim()}
        teamId={team.siteTeamId ?? null}
        competitionId={competitionId}
        title={`Link ${player.firstName} ${player.lastName}`.trim()}
        onPick={(sp) => { setSearchOpen(false); void link(sp); }}
      />
    </div>
  );
}

export default function LinkPlayers() {
  const [, params] = useRoute("/game/:gameId/link");
  const gameId = Number(params?.gameId);
  const leagueQuery = new URLSearchParams(useSearch()).get("league");
  const queryClient = useQueryClient();

  const { data: game } = useGetGame(gameId, { query: { enabled: !!gameId, queryKey: getGetGameQueryKey(gameId) } });
  const { data: teams, isLoading: teamsLoading } = useListTeams(gameId, { query: { enabled: !!gameId, queryKey: getListTeamsQueryKey(gameId) } });
  const { data: players, isLoading: playersLoading } = useListGamePlayers(gameId, { query: { enabled: !!gameId, queryKey: getListGamePlayersQueryKey(gameId) } });
  const leagueId = leagueQuery ?? (game?.leagueId != null ? String(game.leagueId) : null);
  const { data: league } = useQuery({
    queryKey: ["league-site-link", leagueId],
    queryFn: () => localApi<{ siteLeagueId?: string | null }>(`/api/leagues/${leagueId}`, "GET"),
    enabled: !!leagueId,
  });
  const competitionId = league?.siteLeagueId ?? null;
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListGamePlayersQueryKey(gameId) });

  const all = (players ?? []) as LinkedPlayer[];
  const linkedCount = all.filter(p => p.sitePlayerId).length;
  const backHref = leagueId ? `/leagues/${leagueId}` : "/leagues";

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <AppHeader showBack={{ href: backHref, label: "League" }} />
      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Link players to Swish</h1>
            <p className="text-muted-foreground mt-1">
              Match everyone to their Swish Assistant profile so their stats land in the right place.
              You can fix names and numbers here too.
            </p>
            {all.length > 0 && (
              <p className="mt-3 text-sm font-semibold" data-testid="link-progress">
                {linkedCount} of {all.length} linked
              </p>
            )}
          </div>

          {teamsLoading || playersLoading ? (
            <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
          ) : (
            ((teams ?? []) as LinkedTeam[])
              .slice()
              .sort((a, b) => Number(b.isHome) - Number(a.isHome))
              .map(team => {
                const roster = all
                  .filter(p => p.teamId === team.id)
                  .sort((a, b) => Number(!!a.sitePlayerId) - Number(!!b.sitePlayerId) || (parseInt(a.jerseyNumber) || 0) - (parseInt(b.jerseyNumber) || 0));
                return (
                  <section key={team.id} className="space-y-3">
                    <h2 className="text-lg font-bold">
                      {team.name}
                      <span className="ml-2 text-sm font-normal text-muted-foreground">
                        {roster.filter(p => p.sitePlayerId).length}/{roster.length} linked
                      </span>
                    </h2>
                    {roster.map(p => (
                      <PlayerRow key={p.id} player={p} team={team} competitionId={competitionId} onChanged={refresh} />
                    ))}
                  </section>
                );
              })
          )}
        </div>
      </main>
    </div>
  );
}
