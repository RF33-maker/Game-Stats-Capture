import { useRoute, useLocation } from "wouter";
import { SetupLayout } from "@/components/layout/setup-layout";
import { useListTeams, useListGamePlayers, useCreatePlayer, useUpdatePlayer, useDeletePlayer, getListGamePlayersQueryKey, getListTeamsQueryKey, Player, Team } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, Plus, Trash2, UserCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

const playerSchema = z.object({
  jerseyNumber: z.string().min(1, "Req"),
  firstName: z.string().min(1, "Req"),
  lastName: z.string().min(1, "Req"),
  isStarter: z.boolean(),
  position: z.string().optional(),
});

function TeamRoster({ team, players, gameId }: { team: Team, players: Player[], gameId: number }) {
  const queryClient = useQueryClient();
  const createPlayer = useCreatePlayer();
  const updatePlayer = useUpdatePlayer();
  const deletePlayer = useDeletePlayer();
  
  const startersCount = players.filter(p => p.isStarter).length;

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
        className="p-4 flex items-center justify-between text-white"
        style={{ backgroundColor: team.colorPrimary }}
      >
        <div>
          <h3 className="font-bold text-lg">{team.name}</h3>
          <p className="text-xs opacity-90">{team.abbreviation} • {players.length} Players</p>
        </div>
        <div className={`px-3 py-1 rounded-full text-xs font-bold ${startersCount === 5 ? 'bg-green-500/20 text-green-100' : 'bg-white/20 text-white'}`}>
          {startersCount}/5 Starters
        </div>
      </div>

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

  const { data: teams, isLoading: teamsLoading } = useListTeams(gameId, {
    query: { enabled: !!gameId, queryKey: getListTeamsQueryKey(gameId) }
  });
  
  const { data: players, isLoading: playersLoading } = useListGamePlayers(gameId, {
    query: { enabled: !!gameId, queryKey: getListGamePlayersQueryKey(gameId) }
  });

  if (teamsLoading || playersLoading) {
    return (
      <SetupLayout gameId={String(gameId)} title="Rosters" step={3}>
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

    setLocation(`/setup/${gameId}/extras`);
  };

  return (
    <SetupLayout gameId={String(gameId)} title="Rosters" step={3}>
      <div className="max-w-[1200px] mx-auto w-full" style={{ width: '100%', minWidth: '800px' }}>
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {homeTeam && <TeamRoster team={homeTeam} players={players?.filter(p => p.teamId === homeTeam.id) || []} gameId={gameId} />}
          {awayTeam && <TeamRoster team={awayTeam} players={players?.filter(p => p.teamId === awayTeam.id) || []} gameId={gameId} />}
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
