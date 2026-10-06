import { captureModeName } from "@/lib/app-settings";
import { useRoute, useLocation, useSearch } from "wouter";
import { SetupLayout } from "@/components/layout/setup-layout";
import { useGetGame, useUpdateGame, useListTeams, useListGamePlayers, getGetGameQueryKey, getListTeamsQueryKey, getListGamePlayersQueryKey } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Loader2, Play, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { teamTextColor, appSurface } from "@/lib/team-colors";
import { ORGANISER_AVAILABLE } from "@/lib/organiser";
import { OfficialsEditor } from "@/components/organiser/game-day";

export default function SetupExtras() {
  const [, params] = useRoute("/setup/:gameId/extras");
  const gameId = Number(params?.gameId);
  const [, setLocation] = useLocation();
  const search = useSearch();
  const leagueQuery = new URLSearchParams(search).get("league");
  const qs = leagueQuery ? `?league=${leagueQuery}` : "";

  const { data: game, isLoading: gameLoading } = useGetGame(gameId, {
    query: { enabled: !!gameId, queryKey: getGetGameQueryKey(gameId) }
  });
  
  const { data: teams, isLoading: teamsLoading } = useListTeams(gameId, {
    query: { enabled: !!gameId, queryKey: getListTeamsQueryKey(gameId) }
  });

  const { data: players, isLoading: playersLoading } = useListGamePlayers(gameId, {
    query: { enabled: !!gameId, queryKey: getListGamePlayersQueryKey(gameId) }
  });

  const updateGame = useUpdateGame({
    mutation: {
      onSuccess: () => {
        toast.success("Game is now active!");
        setLocation(`/game/${gameId}${qs}`);
      },
      onError: () => toast.error("Failed to start game")
    }
  });

  if (gameLoading || teamsLoading || playersLoading) {
    return (
      <SetupLayout gameId={String(gameId)} title="Review & Start" step={4} leagueId={leagueQuery}>
        <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      </SetupLayout>
    );
  }

  const homeTeam = teams?.find(t => t.isHome);
  const awayTeam = teams?.find(t => !t.isHome);
  const homePlayers = players?.filter(p => p.teamId === homeTeam?.id) || [];
  const awayPlayers = players?.filter(p => p.teamId === awayTeam?.id) || [];

  const handleStart = () => {
    updateGame.mutate({ gameId, data: { status: 'active' } });
  };

  return (
    <SetupLayout gameId={String(gameId)} title="Review & Start" step={4} leagueId={leagueQuery}>
      <div className="space-y-8">
        <div className="sa-card p-8">
          <h2 className="text-2xl font-bold mb-6 border-b pb-4">Game Summary</h2>
          
          <div className="grid grid-cols-2 gap-8 mb-8">
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Matchup</p>
                <div className="text-xl font-bold flex items-center gap-2 mt-1">
                  <span style={{ color: teamTextColor(awayTeam?.colorPrimary, appSurface()) }}>{awayTeam?.abbreviation || 'AWAY'}</span>
                  <span className="text-muted-foreground text-sm font-normal">@</span>
                  <span style={{ color: teamTextColor(homeTeam?.colorPrimary, appSurface()) }}>{homeTeam?.abbreviation || 'HOME'}</span>
                </div>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">League</p>
                <p className="font-medium">{game?.competition || 'Exhibition'}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Date & Venue</p>
                <p className="font-medium">
                  {game?.date && format(new Date(game.date), "MMMM d, yyyy")}
                  {game?.venue && ` • ${game.venue}`}
                </p>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <p className="text-sm text-muted-foreground">Format</p>
                <p className="font-medium">{game?.periodCount} Periods × {game?.periodDurationMins} Mins</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Mode</p>
                <p className="font-medium">{captureModeName(game?.captureMode)}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 pt-6 border-t">
            <div>
              <h3 className="font-bold flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: homeTeam?.colorPrimary }} />
                {homeTeam?.name}
              </h3>
              <ul className="space-y-1 text-sm">
                <li className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {homePlayers.length} Total Players
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {homePlayers.filter(p => p.isStarter).length} Starters Configured
                </li>
              </ul>
            </div>
            <div>
              <h3 className="font-bold flex items-center gap-2 mb-3">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: awayTeam?.colorPrimary }} />
                {awayTeam?.name}
              </h3>
              <ul className="space-y-1 text-sm">
                <li className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {awayPlayers.length} Total Players
                </li>
                <li className="flex items-center gap-2 text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  {awayPlayers.filter(p => p.isStarter).length} Starters Configured
                </li>
              </ul>
            </div>
          </div>
        </div>

        {ORGANISER_AVAILABLE && game && (
          <div className="sa-card p-8 space-y-3">
            <div>
              <h2 className="text-xl font-bold">Officials</h2>
              <p className="text-sm text-muted-foreground">Referees and table crew, for the game report. Optional — you can add them after the game too.</p>
            </div>
            <OfficialsEditor gameUid={(game as typeof game & { uid: string }).uid} gameDate={game.date} canEdit />
          </div>
        )}

        <div className="flex justify-center pt-4">
          <Button 
            size="lg" 
            className="w-full max-w-sm h-16 text-lg font-bold shadow-lg"
            onClick={handleStart}
            disabled={updateGame.isPending}
          >
            {updateGame.isPending ? (
              <Loader2 className="w-6 h-6 mr-3 animate-spin" />
            ) : (
              <Play className="w-6 h-6 mr-3 fill-current" />
            )}
            START GAME
          </Button>
        </div>
      </div>
    </SetupLayout>
  );
}
