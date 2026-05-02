import { useState, useEffect, useRef } from "react";
import { useRoute, Link } from "wouter";
import { 
  useGetGame, 
  useListTeams, 
  useListGamePlayers,
  useListPlayByPlay,
  useGetBoxScore,
  useGetPossessions,
  useRecordStatEvent,
  useDeleteStatEvent,
  useUpdateClock,
  useUpdateGame,
  useListStatEvents,
  getGetGameQueryKey,
  getListTeamsQueryKey,
  getListGamePlayersQueryKey,
  getListPlayByPlayQueryKey,
  getGetBoxScoreQueryKey,
  getGetPossessionsQueryKey,
  getListStatEventsQueryKey,
  Player,
  Team,
  StatEventType
} from "@workspace/api-client-react";
import { Loader2, Play, Pause, Undo2, ChevronLeft, ChevronRight, Activity, ArrowLeft, ArrowRight, BarChart2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function GameCapture() {
  const [, params] = useRoute("/game/:gameId");
  const gameId = Number(params?.gameId);
  const queryClient = useQueryClient();

  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [localClock, setLocalClock] = useState(0);
  const [ftDialog, setFtDialog] = useState<{ open: boolean; eventType?: StatEventType }>({ open: false });

  // Data fetching
  const { data: game, isLoading: gameLoading } = useGetGame(gameId, { query: { enabled: !!gameId, queryKey: getGetGameQueryKey(gameId) } });
  const { data: teams, isLoading: teamsLoading } = useListTeams(gameId, { query: { enabled: !!gameId, queryKey: getListTeamsQueryKey(gameId) } });
  const { data: players, isLoading: playersLoading } = useListGamePlayers(gameId, { query: { enabled: !!gameId, queryKey: getListGamePlayersQueryKey(gameId) } });
  const { data: pbp } = useListPlayByPlay(gameId, { query: { enabled: !!gameId, queryKey: getListPlayByPlayQueryKey(gameId) } });
  const { data: boxScore } = useGetBoxScore(gameId, { query: { enabled: !!gameId, queryKey: getGetBoxScoreQueryKey(gameId) } });
  const { data: possessions } = useGetPossessions(gameId, { query: { enabled: !!gameId, queryKey: getGetPossessionsQueryKey(gameId) } });
  const { data: statEvents } = useListStatEvents(gameId, { query: { enabled: !!gameId, queryKey: getListStatEventsQueryKey(gameId) } });

  // Mutations
  const recordStat = useRecordStatEvent();
  const deleteStat = useDeleteStatEvent();
  const updateClock = useUpdateClock();
  const updateGame = useUpdateGame();

  const homeTeam = teams?.find(t => t.isHome);
  const awayTeam = teams?.find(t => !t.isHome);

  // Sync clock
  useEffect(() => {
    if (game?.clockSeconds !== undefined && !isRunning) {
      setLocalClock(game.clockSeconds);
    }
  }, [game?.clockSeconds, isRunning]);

  // Timer
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const lastSyncRef = useRef<number>(Date.now());
  
  useEffect(() => {
    if (isRunning) {
      timerRef.current = setInterval(() => {
        setLocalClock(prev => Math.max(0, prev - 1));
        
        // Sync every 5 seconds
        if (Date.now() - lastSyncRef.current > 5000) {
          updateClock.mutate({ 
            gameId, 
            data: { clockSeconds: localClock, currentPeriod: game?.currentPeriod } 
          });
          lastSyncRef.current = Date.now();
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      // Final sync on pause
      if (game && localClock !== game.clockSeconds) {
        updateClock.mutate({ 
          gameId, 
          data: { clockSeconds: localClock, currentPeriod: game.currentPeriod } 
        });
      }
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, localClock, gameId, game, updateClock]);

  if (gameLoading || teamsLoading || playersLoading) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin" /></div>;
  }

  if (!game || !homeTeam || !awayTeam || !players) return null;

  // Compute on-court 5 based on starters + substitutions
  const getOnCourtPlayers = (teamId: number) => {
    const teamPlayers = players.filter(p => p.teamId === teamId);
    let onCourtIds = new Set(teamPlayers.filter(p => p.isStarter).map(p => p.id));
    
    // Process sub events in order
    const subs = statEvents?.filter(e => e.teamId === teamId && (e.eventType === 'sub_in' || e.eventType === 'sub_out'))
      .sort((a, b) => a.id - b.id) || [];
      
    for (const sub of subs) {
      if (sub.playerId) {
        if (sub.eventType === 'sub_in') onCourtIds.add(sub.playerId);
        if (sub.eventType === 'sub_out') onCourtIds.delete(sub.playerId);
      }
    }
    
    return teamPlayers.filter(p => onCourtIds.has(p.id));
  };

  const homeOnCourt = getOnCourtPlayers(homeTeam.id);
  const awayOnCourt = getOnCourtPlayers(awayTeam.id);

  const invalidateData = () => {
    queryClient.invalidateQueries({ queryKey: getListStatEventsQueryKey(gameId) });
    queryClient.invalidateQueries({ queryKey: getListPlayByPlayQueryKey(gameId) });
    queryClient.invalidateQueries({ queryKey: getGetBoxScoreQueryKey(gameId) });
    queryClient.invalidateQueries({ queryKey: getGetPossessionsQueryKey(gameId) });
    queryClient.invalidateQueries({ queryKey: getGetGameQueryKey(gameId) });
  };

  const handleStat = async (eventType: StatEventType, value: number = 0, ftData?: any) => {
    if (!selectedTeamId && !['timeout', 'period_start', 'period_end', 'jump_ball'].includes(eventType)) {
      toast.error("Select a player first");
      return;
    }
    
    const isFt = eventType === 'ftm' || eventType === 'fta';
    if (isFt && !ftData && !ftDialog.open) {
      setFtDialog({ open: true, eventType });
      return;
    }

    try {
      await recordStat.mutateAsync({
        gameId,
        data: {
          teamId: selectedTeamId,
          playerId: selectedPlayerId,
          period: game.currentPeriod,
          clockSeconds: localClock,
          eventType,
          value,
          ...ftData
        }
      });
      invalidateData();
      if (!isFt) {
        setSelectedPlayerId(null);
        setSelectedTeamId(null);
      }
    } catch (e) {
      toast.error("Failed to record stat");
    }
  };

  const handleUndo = async () => {
    const lastEvent = statEvents?.[0];
    if (!lastEvent) return;
    try {
      await deleteStat.mutateAsync({ gameId, statEventId: lastEvent.id });
      invalidateData();
    } catch {
      toast.error("Failed to undo");
    }
  };

  const formatClock = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const activeMode = game.captureMode;

  const complexStats = [
    { type: '2ptm', label: '2PT MAKE', color: 'bg-green-600 hover:bg-green-700', val: 2 },
    { type: '2pta', label: '2PT MISS', color: 'bg-red-600 hover:bg-red-700' },
    { type: '3ptm', label: '3PT MAKE', color: 'bg-green-600 hover:bg-green-700', val: 3 },
    { type: '3pta', label: '3PT MISS', color: 'bg-red-600 hover:bg-red-700' },
    { type: 'ftm', label: 'FT MAKE', color: 'bg-green-700 hover:bg-green-800', val: 1 },
    { type: 'fta', label: 'FT MISS', color: 'bg-red-700 hover:bg-red-800' },
    { type: 'oreb', label: 'O REB', color: 'bg-blue-600 hover:bg-blue-700' },
    { type: 'dreb', label: 'D REB', color: 'bg-indigo-600 hover:bg-indigo-700' },
    { type: 'ast', label: 'ASSIST', color: 'bg-sky-600 hover:bg-sky-700' },
    { type: 'tov', label: 'TOV', color: 'bg-orange-600 hover:bg-orange-700' },
    { type: 'stl', label: 'STEAL', color: 'bg-cyan-600 hover:bg-cyan-700' },
    { type: 'blk', label: 'BLOCK', color: 'bg-teal-600 hover:bg-teal-700' },
    { type: 'pf', label: 'P FOUL', color: 'bg-purple-600 hover:bg-purple-700' },
    { type: 'tf', label: 'T FOUL', color: 'bg-purple-700 hover:bg-purple-800' },
  ];

  const simpleStats = [
    { type: '2ptm', label: '2PT MAKE', color: 'bg-green-600 hover:bg-green-700', val: 2 },
    { type: '2pta', label: '2PT MISS', color: 'bg-red-600 hover:bg-red-700' },
    { type: '3ptm', label: '3PT MAKE', color: 'bg-green-600 hover:bg-green-700', val: 3 },
    { type: '3pta', label: '3PT MISS', color: 'bg-red-600 hover:bg-red-700' },
    { type: 'ftm', label: 'FT MAKE', color: 'bg-green-700 hover:bg-green-800', val: 1 },
    { type: 'fta', label: 'FT MISS', color: 'bg-red-700 hover:bg-red-800' },
    { type: 'dreb', label: 'REBOUND', color: 'bg-blue-600 hover:bg-blue-700' },
    { type: 'ast', label: 'ASSIST', color: 'bg-sky-600 hover:bg-sky-700' },
    { type: 'tov', label: 'TOV', color: 'bg-orange-600 hover:bg-orange-700' },
    { type: 'stl', label: 'STEAL', color: 'bg-cyan-600 hover:bg-cyan-700' },
    { type: 'blk', label: 'BLOCK', color: 'bg-teal-600 hover:bg-teal-700' },
    { type: 'pf', label: 'FOUL', color: 'bg-purple-600 hover:bg-purple-700' },
  ];

  const statButtons = activeMode === 'complex' ? complexStats : simpleStats;

  return (
    <div className="h-[100dvh] flex flex-col bg-zinc-950 text-white overflow-hidden font-sans select-none">
      
      {/* Top Header Scoreboard */}
      <header className="h-16 border-b border-white/10 bg-zinc-900 flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center w-1/3 gap-4">
          <div className="text-3xl font-black font-mono tracking-tighter" style={{ color: awayTeam.colorPrimary }}>
            {awayTeam.abbreviation}
          </div>
          <div className="text-4xl font-black font-mono tracking-tighter">
            {boxScore?.away.totalPoints || 0}
          </div>
          {possessions?.currentPossessionTeamId === awayTeam.id && <ArrowLeft className="w-5 h-5 text-white/50" />}
        </div>
        
        <div className="flex-1 flex justify-center items-center gap-6">
          <div className="text-center font-mono font-bold">
            <div className="text-xs text-zinc-400">PERIOD</div>
            <div className="text-xl leading-none">{game.currentPeriod}</div>
          </div>
          
          <div className="bg-black/50 rounded-lg px-4 py-1 flex items-center gap-4">
            <span className="text-4xl font-black font-mono text-amber-500 tabular-nums tracking-tighter">
              {formatClock(localClock)}
            </span>
            <Button 
              variant="outline" 
              size="icon" 
              className={`h-10 w-10 border-zinc-700 ${isRunning ? 'bg-amber-500/20 text-amber-500 border-amber-500/50' : 'bg-zinc-800 text-white'}`}
              onClick={() => setIsRunning(!isRunning)}
            >
              {isRunning ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
            </Button>
          </div>
        </div>

        <div className="flex items-center justify-end w-1/3 gap-4">
          {possessions?.currentPossessionTeamId === homeTeam.id && <ArrowRight className="w-5 h-5 text-white/50" />}
          <div className="text-4xl font-black font-mono tracking-tighter">
            {boxScore?.home.totalPoints || 0}
          </div>
          <div className="text-3xl font-black font-mono tracking-tighter" style={{ color: homeTeam.colorPrimary }}>
            {homeTeam.abbreviation}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Play Capture Area */}
        <div className="flex-1 flex flex-col p-4 gap-4">
          
          {/* Team Panels */}
          <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
            {[awayTeam, homeTeam].map(team => {
              const onCourt = team.id === homeTeam.id ? homeOnCourt : awayOnCourt;
              return (
                <div key={team.id} className="flex flex-col bg-zinc-900 rounded-xl overflow-hidden border border-white/5 shadow-xl relative">
                  <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: team.colorPrimary }} />
                  
                  <div className="flex-1 p-2 grid grid-rows-5 gap-2">
                    {onCourt.map(p => {
                      const isSelected = selectedPlayerId === p.id;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setSelectedPlayerId(p.id);
                            setSelectedTeamId(team.id);
                          }}
                          className={`flex items-center gap-4 px-4 rounded-lg border-2 transition-all font-bold ${
                            isSelected 
                              ? 'border-white bg-white/10 shadow-[0_0_20px_rgba(255,255,255,0.1)]' 
                              : 'border-transparent bg-zinc-950/50 hover:bg-zinc-800'
                          }`}
                        >
                          <div 
                            className="text-2xl font-black font-mono w-12 text-center"
                            style={{ color: team.colorPrimary }}
                          >
                            {p.jerseyNumber}
                          </div>
                          <div className="text-left flex-1 min-w-0 text-xl tracking-tight uppercase">
                            {p.lastName}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                  
                  {/* Team Actions */}
                  <div className="h-16 border-t border-white/5 bg-zinc-950/50 flex p-2 gap-2">
                    <Button 
                      className="flex-1 h-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold"
                      onClick={() => handleStat('timeout' as StatEventType, 0, { teamId: team.id })}
                    >
                      TIMEOUT
                    </Button>
                    <Button 
                      className="flex-1 h-full bg-zinc-800 hover:bg-zinc-700 text-white font-bold"
                      onClick={() => handleStat('tf' as StatEventType, 0, { teamId: team.id })}
                    >
                      TEAM FOUL
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stat Buttons Matrix */}
          <div className="h-64 bg-zinc-900 rounded-xl border border-white/5 p-4 flex flex-col gap-4">
            <div className="grid grid-cols-6 gap-2 flex-1">
              {statButtons.map(btn => (
                <button
                  key={btn.type}
                  disabled={!selectedPlayerId}
                  onClick={() => handleStat(btn.type as StatEventType, btn.val)}
                  className={`rounded-lg font-black text-lg tracking-tighter uppercase transition-all
                    ${btn.color} 
                    ${!selectedPlayerId ? 'opacity-20 cursor-not-allowed grayscale' : 'shadow-lg active:scale-95'}
                  `}
                >
                  {btn.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2 h-12">
              <Button 
                variant="outline" 
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 border-zinc-700 font-bold"
                onClick={() => handleStat('jump_ball' as StatEventType)}
              >
                JUMP BALL
              </Button>
              <Button 
                variant="outline" 
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 border-zinc-700 font-bold"
                onClick={() => handleStat('period_end' as StatEventType)}
              >
                END PERIOD
              </Button>
              <Button 
                variant="outline" 
                className="flex-1 bg-zinc-800 hover:bg-zinc-700 border-zinc-700 font-bold"
                onClick={() => handleStat('period_start' as StatEventType)}
              >
                START PERIOD
              </Button>
            </div>
          </div>

        </div>

        {/* Right Rail - PBP */}
        <div className="w-80 bg-zinc-900 border-l border-white/10 flex flex-col">
          <div className="p-4 border-b border-white/10 flex justify-between items-center bg-zinc-950">
            <h2 className="font-bold text-zinc-400">PLAY BY PLAY</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 bg-zinc-800 border-zinc-700 hover:bg-zinc-700" onClick={handleUndo}>
                <Undo2 className="w-4 h-4 mr-2" /> Undo
              </Button>
              <Link href={`/game/${gameId}/box`}>
                <Button size="sm" variant="outline" className="h-8 bg-zinc-800 border-zinc-700 hover:bg-zinc-700">
                  <BarChart2 className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {pbp?.map(entry => {
              const t = entry.teamId ? teams.find(x => x.id === entry.teamId) : null;
              return (
                <div key={entry.id} className="text-sm p-3 bg-zinc-950/50 rounded flex items-start gap-3 border border-white/5">
                  <div className="text-xs font-mono text-zinc-500 shrink-0 w-12 text-right pt-0.5">
                    {formatClock(entry.clockSeconds)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      {t && <div className="w-2 h-2 rounded-full" style={{ backgroundColor: t.colorPrimary }} />}
                      <span className="font-bold font-mono tracking-tighter text-white">
                        {entry.awayScore} - {entry.homeScore}
                      </span>
                    </div>
                    <div className="text-zinc-300 leading-tight">
                      {entry.eventText}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-zinc-950 border-t border-white/10">
            <Button 
              className="w-full font-bold bg-blue-600 hover:bg-blue-700" 
              onClick={() => updateGame.mutate({ gameId, data: { status: 'final' } })}
            >
              FINALIZE GAME
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={ftDialog.open} onOpenChange={(open) => !open && setFtDialog({ open: false })}>
        <DialogContent className="bg-zinc-900 text-white border-zinc-800 sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Free Throw Sequence</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[1, 2, 3].map(total => (
              <div key={total} className="space-y-2">
                <div className="text-center font-bold text-zinc-500 mb-2">{total} SHOTS</div>
                {Array.from({ length: total }).map((_, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    className="w-full bg-zinc-800 border-zinc-700 hover:bg-zinc-700 hover:text-white"
                    onClick={() => {
                      setFtDialog({ open: false });
                      handleStat(ftDialog.eventType!, ftDialog.eventType === 'ftm' ? 1 : 0, {
                        ftSequenceIndex: idx + 1,
                        ftSequenceTotal: total
                      });
                    }}
                  >
                    Shot {idx + 1}
                  </Button>
                ))}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
