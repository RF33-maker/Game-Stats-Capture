import { useRoute, useLocation, useSearch } from "wouter";
import { SetupLayout } from "@/components/layout/setup-layout";
import { useListTeams, useListGamePlayers, useCreatePlayer, useUpdatePlayer, useDeletePlayer, getListGamePlayersQueryKey, getListTeamsQueryKey, Player, Team } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Trash2, UserCircle2, Search, Download, BadgeCheck, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { PlayerSearchDialog } from "@/components/directory-search";
import { DIRECTORY_AVAILABLE, dedupeRoster, localApi, searchPlayers, splitName, type SitePlayer } from "@/lib/directory";

type LinkedTeam = Team & { siteTeamId?: string | null };
type LinkedPlayer = Player & { sitePlayerId?: string | null };
import { textOnColor } from "@/lib/team-colors";

const playerSchema = z.object({
  jerseyNumber: z.string().min(1, "Req"),
  firstName: z.string().min(1, "Req"),
  lastName: z.string().min(1, "Req"),
  isStarter: z.boolean(),
  position: z.string().optional(),
});

function TeamRoster({ team, players, gameId, competitionId }: { team: LinkedTeam, players: LinkedPlayer[], gameId: number, competitionId: string | null }) {
  const queryClient = useQueryClient();
  const createPlayer = useCreatePlayer();
  const updatePlayer = useUpdatePlayer();
  const deletePlayer = useDeletePlayer();
  
  const startersCount = players.filter(p => p.isStarter).length;
  // null = closed; "add" = add a Swish player; otherwise the roster row being linked
  const [searching, setSearching] = useState<"add" | LinkedPlayer | null>(null);
  const [importing, setImporting] = useState(false);
  const refresh = () => queryClient.invalidateQueries({ queryKey: getListGamePlayersQueryKey(gameId) });

  const addFromSwish = async (sp: SitePlayer) => {
    if (players.some(p => p.sitePlayerId === sp.playerId)) {
      toast.error(`${sp.fullName} is already on this roster`);
      return;
    }
    const { firstName, lastName } = splitName(sp);
    await localApi(`/api/teams/${team.id}/players`, "POST", {
      jerseyNumber: sp.shirtNumber ?? "", firstName, lastName,
      position: sp.position ?? null, headshotUrl: sp.photoUrl, isStarter: false, sitePlayerId: sp.playerId,
    });
    refresh();
    toast.success(`${sp.fullName} added`);
  };

  const linkRow = async (row: LinkedPlayer, sp: SitePlayer) => {
    await localApi(`/api/players/${row.id}`, "PATCH", {
      sitePlayerId: sp.playerId,
      headshotUrl: row.headshotUrl ?? sp.photoUrl,
      jerseyNumber: row.jerseyNumber || (sp.shirtNumber ?? ""),
    });
    refresh();
    toast.success(`Linked to ${sp.fullName}`);
  };

  // Bring in the linked Swish team's roster. Rows already on this roster
  // (same Swish player, or same name not yet linked) are linked, not duplicated.
  const importRoster = async () => {
    if (!team.siteTeamId) return;
    setImporting(true);
    try {
      const roster = dedupeRoster(await searchPlayers("", { teamId: team.siteTeamId, limit: 200 }));
      let added = 0, linked = 0;
      for (const sp of roster) {
        if (players.some(p => p.sitePlayerId === sp.playerId)) continue;
        const { firstName, lastName } = splitName(sp);
        const sameName = players.find(p => !p.sitePlayerId
          && p.firstName.trim().toLowerCase() === firstName.trim().toLowerCase()
          && p.lastName.trim().toLowerCase() === lastName.trim().toLowerCase());
        if (sameName) {
          await localApi(`/api/players/${sameName.id}`, "PATCH", { sitePlayerId: sp.playerId });
          linked++;
        } else {
          await localApi(`/api/teams/${team.id}/players`, "POST", {
            jerseyNumber: sp.shirtNumber ?? "", firstName, lastName,
            position: sp.position ?? null, headshotUrl: sp.photoUrl, isStarter: false, sitePlayerId: sp.playerId,
          });
          added++;
        }
      }
      refresh();
      toast.success(roster.length === 0 ? "That Swish team has no players yet"
        : `Imported ${added} player${added === 1 ? "" : "s"}${linked ? `, linked ${linked}` : ""}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't import the roster");
    } finally {
      setImporting(false);
    }
  };
  const headerText = textOnColor(team.colorPrimary);

  const form = useForm<z.infer<typeof playerSchema>>({
    resolver: zodResolver(playerSchema),
    defaultValues: { jerseyNumber: "", firstName: "", lastName: "", isStarter: false, position: "" }
  });

  const onSubmitNew = async (data: z.infer<typeof playerSchema>) => {
    try {
      await createPlayer.mutateAsync({ teamId: team.id, data: { ...data, headshotUrl: null } });
      form.reset();
      queryClient.invalidateQueries({ queryKey: getListGamePlayersQueryKey(gameId) });
      toast.success("Player added");
    } catch {
      toast.error("Failed to add player");
    }
  };

  const handleToggleStarter = async (player: Player) => {
    if (!player.isStarter && startersCount >= 5) {
      toast.error("Maximum 5 starters allowed");
      return;
    }
    try {
      await updatePlayer.mutateAsync({
        playerId: player.id,
        data: { isStarter: !player.isStarter }
      });
      queryClient.invalidateQueries({ queryKey: getListGamePlayersQueryKey(gameId) });
    } catch {
      toast.error("Failed to update starter status");
    }
  };

  const handleDelete = async (playerId: number) => {
    try {
      await deletePlayer.mutateAsync({ playerId });
      queryClient.invalidateQueries({ queryKey: getListGamePlayersQueryKey(gameId) });
      toast.success("Player removed");
    } catch {
      toast.error("Failed to remove player");
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl shadow-sm overflow-hidden flex flex-col h-[600px]">
      <div 
        className="p-4 flex items-center justify-between"
        style={{ backgroundColor: team.colorPrimary, color: headerText }}
      >
        <div>
          <h3 className="font-bold text-lg">{team.name}</h3>
          <p className="text-xs opacity-90">{team.abbreviation} • {players.length} Players</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${headerText === '#ffffff' ? 'bg-white/20' : 'bg-black/10'}`}>
          {startersCount}/5 Starters
        </div>
      </div>

      {DIRECTORY_AVAILABLE && (
        <div className="flex gap-2 px-4 pt-3">
          <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={() => setSearching("add")}>
            <Search className="w-3.5 h-3.5" /> Find player
          </Button>
          {team.siteTeamId && (
            <Button type="button" variant="secondary" size="sm" className="gap-1.5" onClick={importRoster} disabled={importing}
              data-testid="import-roster">
              {importing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Import Swish roster
            </Button>
          )}
        </div>
      )}
      <PlayerSearchDialog
        open={searching !== null}
        onOpenChange={(o) => { if (!o) setSearching(null); }}
        initialQuery={searching && searching !== "add" ? `${searching.firstName} ${searching.lastName}`.trim() : ""}
        teamId={team.siteTeamId ?? null}
        competitionId={competitionId}
        title={searching && searching !== "add" ? `Link ${searching.firstName} ${searching.lastName}`.trim() : `Add a player to ${team.name}`}
        onPick={async (sp) => {
          const target = searching;
          setSearching(null);
          try {
            if (target === "add") await addFromSwish(sp);
            else if (target) await linkRow(target, sp);
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Couldn't save that");
          }
        }}
      />

      <div className="flex-1 overflow-auto p-4 space-y-2">
        {players.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-muted-foreground">
            <UserCircle2 className="w-12 h-12 mb-2 opacity-20" />
            <p>No players added yet</p>
          </div>
        ) : (
          players.sort((a, b) => parseInt(a.jerseyNumber) - parseInt(b.jerseyNumber)).map(p => (
            <div key={p.id} className="flex items-center gap-3 p-2 bg-muted/30 rounded-lg hover:bg-muted/50 transition-colors border border-transparent hover:border-border">
              <Checkbox 
                checked={p.isStarter} 
                onCheckedChange={() => handleToggleStarter(p)}
                id={`starter-${p.id}`}
                className={p.isStarter ? "border-primary bg-primary" : ""}
              />
              <div className="w-8 h-8 rounded-md bg-background border flex items-center justify-center font-mono font-bold text-sm shrink-0">
                {p.jerseyNumber}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm truncate">{p.lastName}, {p.firstName}</p>
                <p className="text-xs text-muted-foreground truncate">{p.position || "N/A"}</p>
              </div>
              {DIRECTORY_AVAILABLE && (p.sitePlayerId ? (
                <button type="button" title="Linked to a Swish profile — tap to change"
                  className="flex items-center gap-1 text-[11px] font-semibold text-emerald-500 shrink-0"
                  onClick={() => setSearching(p)} data-testid="player-linked">
                  <BadgeCheck className="w-4 h-4" /> Swish
                </button>
              ) : (
                <button type="button" title="Link to an existing Swish profile"
                  className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground hover:text-foreground shrink-0"
                  onClick={() => setSearching(p)} data-testid="player-link">
                  <Link2 className="w-4 h-4" /> Link
                </button>
              ))}
              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive opacity-50 hover:opacity-100 shrink-0" onClick={() => handleDelete(p.id)}>
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          ))
        )}
      </div>

      <div className="p-4 bg-muted/20 border-t">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmitNew)} className="flex gap-2 items-start">
            <FormField control={form.control} name="jerseyNumber" render={({ field }) => (
              <FormItem className="w-16 shrink-0"><FormControl><Input placeholder="#" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="firstName" render={({ field }) => (
              <FormItem className="flex-1 min-w-0"><FormControl><Input placeholder="First" {...field} /></FormControl></FormItem>
            )} />
            <FormField control={form.control} name="lastName" render={({ field }) => (
              <FormItem className="flex-1 min-w-0"><FormControl><Input placeholder="Last" {...field} /></FormControl></FormItem>
            )} />
            <Button type="submit" size="icon" disabled={createPlayer.isPending} className="shrink-0">
              {createPlayer.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            </Button>
          </form>
        </Form>
      </div>
    </div>
  );
}

export default function SetupPlayers() {
  const [, params] = useRoute("/setup/:gameId/players");
  const gameId = Number(params?.gameId);
  const [, setLocation] = useLocation();
  const search = useSearch();
  const leagueQuery = new URLSearchParams(search).get("league");
  const qs = leagueQuery ? `?league=${leagueQuery}` : "";

  const { data: teams, isLoading: teamsLoading } = useListTeams(gameId, {
    query: { enabled: !!gameId, queryKey: getListTeamsQueryKey(gameId) }
  });
  
  const { data: players, isLoading: playersLoading } = useListGamePlayers(gameId, {
    query: { enabled: !!gameId, queryKey: getListGamePlayersQueryKey(gameId) }
  });

  const { data: league } = useQuery({
    queryKey: ["league-site-link", leagueQuery],
    queryFn: () => localApi<{ siteLeagueId?: string | null }>(`/api/leagues/${leagueQuery}`, "GET"),
    enabled: !!leagueQuery,
  });
  const competitionId = league?.siteLeagueId ?? null;

  if (teamsLoading || playersLoading) {
    return (
      <SetupLayout gameId={String(gameId)} title="Rosters" step={3} leagueId={leagueQuery}>
        <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      </SetupLayout>
    );
  }

  const homeTeam = teams?.find(t => t.isHome);
  const awayTeam = teams?.find(t => !t.isHome);

  const handleContinue = () => {
    if (!homeTeam || !awayTeam) {
      toast.error("Both teams must be configured first");
      return;
    }

    const homePlayers = players?.filter(p => p.teamId === homeTeam.id) || [];
    const awayPlayers = players?.filter(p => p.teamId === awayTeam.id) || [];
    
    if (homePlayers.filter(p => p.isStarter).length !== 5) {
      toast.error(`Please select exactly 5 starters for ${homeTeam.name}`);
      return;
    }
    if (awayPlayers.filter(p => p.isStarter).length !== 5) {
      toast.error(`Please select exactly 5 starters for ${awayTeam.name}`);
      return;
    }

    setLocation(`/setup/${gameId}/extras${qs}`);
  };

  return (
    <SetupLayout gameId={String(gameId)} title="Rosters" step={3} leagueId={leagueQuery}>
      <div className="max-w-[1200px] mx-auto w-full" style={{ width: '100%', minWidth: '800px' }}>
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {homeTeam && <TeamRoster team={homeTeam} players={players?.filter(p => p.teamId === homeTeam.id) || []} gameId={gameId} competitionId={competitionId} />}
          {awayTeam && <TeamRoster team={awayTeam} players={players?.filter(p => p.teamId === awayTeam.id) || []} gameId={gameId} competitionId={competitionId} />}
        </div>
        
        <div className="flex justify-end">
          <Button size="lg" onClick={handleContinue}>
            Save & Continue
          </Button>
        </div>
      </div>
    </SetupLayout>
  );
}
