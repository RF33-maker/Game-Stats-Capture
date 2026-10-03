import { useState, useEffect, useRef } from "react";
import { useRoute, Link, useLocation, useSearch } from "wouter";
import { 
  useGetGame, 
  useListTeams, 
  useListGamePlayers,
  useListPlayByPlay,
  useGetBoxScore,
  useGetPossessions,
  useRecordStatEvent,
  useSubstitutePlayers,
  useDeleteStatEvent,
  useUpdateStatEvent,
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
  getListGamesQueryKey,
  PlayByPlayEntry,
  StatEventType
} from "@workspace/api-client-react";
import { Loader2, Play, Pause, Undo2, ArrowLeft, ArrowRight, BarChart2, Pencil, Trash2, Home, X, Flag, FlagOff, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppMenu } from "@/components/app-menu";
import { BrandMark } from "@/components/brand";
import { LocalModeBadge } from "@/components/local-mode-badge";
import { LOCAL_MODE_ENABLED } from "@/lib/local-mode";
import { loadSettings } from "@/lib/app-settings";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CourtZones, SHOT_ZONES, ZONE_SHOT_VALUE, shotZoneLabel, type ShotZoneId } from "@/components/court-zones";
import { teamTextColor, appSurface } from "@/lib/team-colors";

// Field-goal make/miss event types — the only ones a shot zone applies to.
const FG_SHOT_TYPES = new Set<StatEventType>(['2ptm', '2pta', '3ptm', '3pta']);

// Point value a given FG stat button represents, or null for non-FG stats.
function fgShotValue(type: StatEventType): 2 | 3 | null {
  if (type === '2ptm' || type === '2pta') return 2;
  if (type === '3ptm' || type === '3pta') return 3;
  return null;
}

export default function GameCapture() {
  const [, params] = useRoute("/game/:gameId");
  const gameId = Number(params?.gameId);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const leagueQuery = new URLSearchParams(search).get("league");

  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [selectedZone, setSelectedZone] = useState<ShotZoneId | null>(null);
  // When an operator taps a 2PT/3PT button before picking a zone, we "arm"
  // that shot type: the court diagram filters to matching zones, and a
  // second tap on the same button (or an edit/undo) confirms without a zone.
  const [pendingFgEvent, setPendingFgEvent] = useState<StatEventType | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [localClock, setLocalClock] = useState(0);
  const [ftDialog, setFtDialog] = useState<{ open: boolean; eventType?: StatEventType }>({ open: false });
  const [editPbp, setEditPbp] = useState<PlayByPlayEntry | null>(null);
  // Substitution flow: tapping a bench player arms it, then tapping an
  // on-court player on the same team completes the swap.
  const [subMode, setSubMode] = useState<{ teamId: number; benchPlayerId: number } | null>(null);
  const [editForm, setEditForm] = useState<{ eventType: StatEventType; teamId: number | null; playerId: number | null; shotZone: ShotZoneId | null }>({ eventType: '2ptm' as StatEventType, teamId: null, playerId: null, shotZone: null });
  const [finalizeDialogOpen, setFinalizeDialogOpen] = useState(false);
  // Non-blocking prompt shown after a period ends or a timeout is called,
  // listing plays flagged "needs review" in the relevant period so the
  // scorer can double-check them while it's fresh rather than only at
  // finalize time.
  const [reviewPrompt, setReviewPrompt] = useState<{ open: boolean; periodLabel: string; entries: PlayByPlayEntry[] }>({ open: false, periodLabel: '', entries: [] });

  // Data fetching
  const { data: game, isLoading: gameLoading } = useGetGame(gameId, { query: { enabled: !!gameId, queryKey: getGetGameQueryKey(gameId) } });
  const { data: teams, isLoading: teamsLoading } = useListTeams(gameId, { query: { enabled: !!gameId, queryKey: getListTeamsQueryKey(gameId) } });
  const { data: players, isLoading: playersLoading } = useListGamePlayers(gameId, { query: { enabled: !!gameId, queryKey: getListGamePlayersQueryKey(gameId) } });
  const { data: pbp } = useListPlayByPlay(gameId, { query: { enabled: !!gameId, queryKey: getListPlayByPlayQueryKey(gameId) } });
  const { data: boxScore } = useGetBoxScore(gameId, { query: { enabled: !!gameId, queryKey: getGetBoxScoreQueryKey(gameId) } });
  const { data: possessions } = useGetPossessions(gameId, { query: { enabled: !!gameId, queryKey: getGetPossessionsQueryKey(gameId) } });
  const { data: statEvents } = useListStatEvents(gameId, { query: { enabled: !!gameId, queryKey: getListStatEventsQueryKey(gameId) } });

  const effectiveLeagueId =
    leagueQuery ?? (game?.leagueId != null ? String(game.leagueId) : null);
  const homeHref = effectiveLeagueId
    ? `/leagues/${effectiveLeagueId}`
    : "/leagues";

  // Mutations
  const recordStat = useRecordStatEvent();
  const substitutePlayers = useSubstitutePlayers();
  const deleteStat = useDeleteStatEvent();
  const updateStat = useUpdateStatEvent();
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
  const transitioningRef = useRef<boolean>(false);
  // Only a running → paused transition should write the clock back. Without
  // this, the first render (localClock still 0, game just loaded) wrote 0
  // over the saved clock every time the capture screen was opened.
  const wasRunningRef = useRef<boolean>(false);
  
  useEffect(() => {
    if (isRunning) {
      wasRunningRef.current = true;
      timerRef.current = setInterval(() => {
        setLocalClock(prev => Math.max(0, prev - 1));
        
        // Sync every 5 seconds
        if (Date.now() - lastSyncRef.current > 5000 && !transitioningRef.current) {
          updateClock.mutate({ 
            gameId, 
            data: { clockSeconds: localClock, currentPeriod: game?.currentPeriod } 
          });
          lastSyncRef.current = Date.now();
        }
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      // Final sync on pause — but skip if we're in the middle of a period transition
      // because handleEndPeriod will issue its own authoritative clock+period write.
      if (wasRunningRef.current && game && localClock !== game.clockSeconds && !transitioningRef.current) {
        updateClock.mutate({ 
          gameId, 
          data: { clockSeconds: localClock, currentPeriod: game.currentPeriod } 
        });
      }
      wasRunningRef.current = false;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isRunning, localClock, gameId, game, updateClock]);

  if (gameLoading || teamsLoading || playersLoading) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-background"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>;
  }

  if (!game || !homeTeam || !awayTeam || !players) return null;

  if (game.status === 'final') {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground">
        <div className="text-center space-y-6 p-8 max-w-sm">
          <div className="flex justify-center"><BrandMark className="h-16" /></div>
          <div>
            <p className="sa-eyebrow mb-2">Final</p>
            <h1 className="text-4xl font-bold mb-2">Game finalized</h1>
            <p className="text-muted-foreground text-sm">This game has already been finalized and is locked for editing.</p>
          </div>
          <div className="flex flex-col gap-3">
            <Link href={`/game/${gameId}/box${effectiveLeagueId ? `?league=${effectiveLeagueId}` : ""}`}>
              <Button className="w-full">
                <BarChart2 className="w-4 h-4 mr-2" /> View Box Score
              </Button>
            </Link>
            <Link href={homeHref}>
              <Button variant="outline" className="w-full border-[hsl(var(--border-strong))] bg-card hover:bg-accent">
                <Home className="w-4 h-4 mr-2" /> Back to League
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

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

  // Bench = active roster players not currently on the court. This is a
  // read-only placeholder for now (see TeamPanel) — no sub-in/sub-out UI yet.
  const getBenchPlayers = (teamId: number, onCourt: { id: number }[]) => {
    const onCourtIds = new Set(onCourt.map(p => p.id));
    return players
      .filter(p => p.teamId === teamId && p.isActive && !onCourtIds.has(p.id))
      .sort((a, b) => Number(a.jerseyNumber) - Number(b.jerseyNumber));
  };

  const homeBench = getBenchPlayers(homeTeam.id, homeOnCourt);
  const awayBench = getBenchPlayers(awayTeam.id, awayOnCourt);

  const invalidateData = () => {
    queryClient.invalidateQueries({ queryKey: getListStatEventsQueryKey(gameId) });
    queryClient.invalidateQueries({ queryKey: getListPlayByPlayQueryKey(gameId) });
    queryClient.invalidateQueries({ queryKey: getGetBoxScoreQueryKey(gameId) });
    queryClient.invalidateQueries({ queryKey: getGetPossessionsQueryKey(gameId) });
    queryClient.invalidateQueries({ queryKey: getGetGameQueryKey(gameId) });
  };

  const handleStat = async (eventType: StatEventType, value: number = 0, ftData?: any, zoneOverride?: ShotZoneId | null) => {
    if (!selectedTeamId && !['timeout', 'period_start', 'period_end', 'jump_ball'].includes(eventType)) {
      toast.error("Select a player first");
      return;
    }
    
    const isFt = eventType === 'ftm' || eventType === 'fta';
    if (isFt && !ftData && !ftDialog.open) {
      setFtDialog({ open: true, eventType });
      return;
    }

    const isFgShot = FG_SHOT_TYPES.has(eventType);
    const shotZone = zoneOverride !== undefined ? zoneOverride : selectedZone;

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
          shotZone: isFgShot ? shotZone : null,
          ...ftData
        }
      });
      invalidateData();
      if (!isFt) {
        setSelectedPlayerId(null);
        setSelectedTeamId(null);
      }
      if (isFgShot) {
        setSelectedZone(null);
        setPendingFgEvent(null);
      }
      if (eventType === 'timeout') {
        const flaggedThisPeriod = (pbp ?? []).filter(
          p => p.period === game.currentPeriod && p.needsReview,
        );
        if (flaggedThisPeriod.length > 0) {
          setReviewPrompt({ open: true, periodLabel: periodLabel(game.currentPeriod), entries: flaggedThisPeriod });
        }
      }
    } catch (e) {
      toast.error("Failed to record stat");
    }
  };

  // Click handler for the 2PT/3PT/etc stat buttons. FG buttons are "armed"
  // rather than fired immediately when no zone is selected yet, so the
  // court diagram can filter to matching zones (see handleZoneSelect).
  const handleStatButtonClick = (eventType: StatEventType | 'reb', value?: number) => {
    if (eventType === 'reb') {
      // A missed shot leaves possession with the shooting team until the
      // rebound, so a board by the team in possession is offensive.
      const possessionTeamId = possessions?.currentPossessionTeamId ?? null;
      handleStat(possessionTeamId != null && possessionTeamId === selectedTeamId ? 'oreb' : 'dreb', value);
      return;
    }

    if (game.captureMode === 'simple') {
      // Lite has no court, so shots never wait for a location.
      handleStat(eventType, value, undefined, null);
      return;
    }

    if (!FG_SHOT_TYPES.has(eventType)) {
      handleStat(eventType, value);
      return;
    }

    const btnValue = fgShotValue(eventType);
    if (selectedZone) {
      // A zone is already chosen — only a matching type may fire (the
      // button is disabled otherwise, this is just a safety net).
      if (ZONE_SHOT_VALUE[selectedZone] !== btnValue) return;
      handleStat(eventType, value);
      return;
    }

    if (pendingFgEvent === eventType) {
      // Second tap on the same armed button — confirm without a zone.
      handleStat(eventType, value);
      setPendingFgEvent(null);
      return;
    }

    // Arm this shot type and wait for a matching zone (or a repeat tap).
    setPendingFgEvent(eventType);
  };

  // Click handler passed to the court diagram. When a shot type is armed,
  // tapping a (matching) zone completes the recording in one step.
  const handleZoneSelect = (zone: ShotZoneId | null) => {
    if (zone && pendingFgEvent) {
      const btn = statButtons.find(b => b.type === pendingFgEvent);
      handleStat(pendingFgEvent, btn?.val, undefined, zone);
      return;
    }
    setSelectedZone(zone);
  };

  const handleBenchPlayerClick = (teamId: number, benchPlayerId: number) => {
    // Ignore taps while a substitution is in flight so a rapid double-tap
    // can't arm a second player before the first swap's request settles.
    if (substitutePlayers.isPending) return;
    if (subMode && subMode.teamId === teamId && subMode.benchPlayerId === benchPlayerId) {
      setSubMode(null);
      return;
    }
    setSubMode({ teamId, benchPlayerId });
  };

  const handleSubstitute = async (teamId: number, onCourtPlayerId: number) => {
    if (!subMode || subMode.teamId !== teamId) return;
    // Guard against a second tap landing before this request settles and
    // clears subMode — the swap is a single atomic API call either way, but
    // this stops a duplicate request for the same pair from firing.
    if (substitutePlayers.isPending) return;
    const benchPlayerId = subMode.benchPlayerId;
    const outPlayer = players.find(p => p.id === onCourtPlayerId);
    const inPlayer = players.find(p => p.id === benchPlayerId);
    try {
      await substitutePlayers.mutateAsync({
        gameId,
        data: {
          teamId,
          outPlayerId: onCourtPlayerId,
          inPlayerId: benchPlayerId,
          period: game.currentPeriod,
          clockSeconds: localClock,
        },
      });
      setSubMode(null);
      invalidateData();
      toast.success(`${inPlayer?.lastName ?? 'Player'} subs in for ${outPlayer?.lastName ?? 'player'}`);
    } catch (err) {
      // Leave subMode armed on failure — the swap did not happen (the API
      // validates and writes both sides in one transaction), so the bench
      // player is still correctly armed and the scorer can retry or cancel.
      const message = err instanceof Error ? err.message : "Failed to substitute";
      toast.error(message);
    }
  };

  const handleUndo = async () => {
    const lastEvent = statEvents?.[0];
    if (!lastEvent) return;
    try {
      await deleteStat.mutateAsync({ statEventId: lastEvent.id });
      invalidateData();
    } catch {
      toast.error("Failed to undo");
    }
  };

  const handleEndPeriod = async () => {
    if (!game) return;
    // Mark that we're transitioning BEFORE pausing the clock so the timer
    // useEffect's pause-sync branch skips its competing write.
    transitioningRef.current = true;
    setIsRunning(false);
    try {
      await recordStat.mutateAsync({
        gameId,
        data: {
          teamId: null,
          playerId: null,
          period: game.currentPeriod,
          clockSeconds: 0,
          eventType: 'period_end' as StatEventType,
          value: 0,
        },
      });

      const isLastRegPeriod = game.currentPeriod >= game.periodCount;
      const nextPeriod = game.currentPeriod + 1;
      const nextDurationSec = (isLastRegPeriod ? 5 : game.periodDurationMins) * 60;

      await updateClock.mutateAsync({
        gameId,
        data: {
          currentPeriod: nextPeriod,
          clockSeconds: nextDurationSec,
        },
      });

      setLocalClock(nextDurationSec);
      setSelectedPlayerId(null);
      setSelectedTeamId(null);
      setSelectedZone(null);
      setPendingFgEvent(null);
      invalidateData();

      const label = isLastRegPeriod
        ? `OT${nextPeriod - game.periodCount}`
        : `Q${nextPeriod}`;
      toast.success(`Period ended — advanced to ${label}`);

      const flaggedThisPeriod = (pbp ?? []).filter(
        p => p.period === game.currentPeriod && p.needsReview,
      );
      if (flaggedThisPeriod.length > 0) {
        setReviewPrompt({ open: true, periodLabel: periodLabel(game.currentPeriod), entries: flaggedThisPeriod });
      }
    } catch {
      toast.error("Failed to end period");
    } finally {
      transitioningRef.current = false;
    }
  };

  const handleStartPeriod = async () => {
    if (!game) return;
    try {
      await recordStat.mutateAsync({
        gameId,
        data: {
          teamId: null,
          playerId: null,
          period: game.currentPeriod,
          clockSeconds: localClock,
          eventType: 'period_start' as StatEventType,
          value: 0,
        },
      });
      invalidateData();
      setIsRunning(true);
    } catch {
      toast.error("Failed to start period");
    }
  };

  const openEditPbp = (entry: PlayByPlayEntry) => {
    if (entry.statEventId == null) {
      toast.error("This entry can't be edited");
      return;
    }
    const ev = statEvents?.find(e => e.id === entry.statEventId);
    if (!ev) {
      toast.error("Original event not found");
      return;
    }
    setEditPbp(entry);
    setEditForm({
      eventType: ev.eventType as StatEventType,
      teamId: ev.teamId ?? null,
      playerId: ev.playerId ?? null,
      shotZone: (ev.shotZone as ShotZoneId | null) ?? null,
    });
  };

  const closeEditPbp = () => {
    setEditPbp(null);
  };

  const handleSaveEdit = async () => {
    if (!editPbp || editPbp.statEventId == null) return;
    // Auto-normalize: structural events should not carry a team/player.
    const structural = new Set<StatEventType>([
      'period_start' as StatEventType,
      'period_end' as StatEventType,
      'jump_ball' as StatEventType,
    ]);
    const isStructural = structural.has(editForm.eventType);
    const isFgShot = FG_SHOT_TYPES.has(editForm.eventType);
    try {
      await updateStat.mutateAsync({
        statEventId: editPbp.statEventId,
        data: {
          eventType: editForm.eventType,
          teamId: isStructural ? null : editForm.teamId,
          playerId: isStructural ? null : editForm.playerId,
          shotZone: isFgShot ? editForm.shotZone : null,
        },
      });
      invalidateData();
      toast.success("Play updated");
      closeEditPbp();
    } catch {
      toast.error("Failed to update play");
    }
  };

  const handleDeletePbp = async () => {
    if (!editPbp || editPbp.statEventId == null) return;
    try {
      await deleteStat.mutateAsync({ statEventId: editPbp.statEventId });
      invalidateData();
      toast.success("Play deleted");
      closeEditPbp();
    } catch {
      toast.error("Failed to delete play");
    }
  };

  const handleFinalizeGame = async () => {
    setFinalizeDialogOpen(false);
    setIsRunning(false);
    try {
      await updateGame.mutateAsync({ gameId, data: { status: 'final' } });
      queryClient.invalidateQueries({ queryKey: getGetGameQueryKey(gameId) });
      queryClient.invalidateQueries({ queryKey: getListGamesQueryKey() });
      toast.success("Game finalized!");
      setLocation(`/game/${gameId}/box${effectiveLeagueId ? `?league=${effectiveLeagueId}` : ""}`);
    } catch {
      toast.error("Failed to finalize game. Please try again.");
    }
  };

  const formatClock = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const periodLabel = (period: number) =>
    period > game.periodCount ? `OT${period - game.periodCount}` : `Q${period}`;

  const handleToggleReview = async (entry: PlayByPlayEntry) => {
    if (entry.statEventId == null) return;
    try {
      await updateStat.mutateAsync({
        statEventId: entry.statEventId,
        data: { needsReview: !entry.needsReview },
      });
      invalidateData();
      toast.success(entry.needsReview ? "Marked as reviewed" : "Flagged for review");
    } catch {
      toast.error("Failed to update flag");
    }
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
    { type: 'fd', label: 'FOUL DRAWN', color: 'bg-amber-600 hover:bg-amber-700' },
  ];

  const simpleStats = [
    { type: '2ptm', label: '2PT MAKE', color: 'bg-green-600 hover:bg-green-700', val: 2 },
    { type: '2pta', label: '2PT MISS', color: 'bg-red-600 hover:bg-red-700' },
    { type: '3ptm', label: '3PT MAKE', color: 'bg-green-600 hover:bg-green-700', val: 3 },
    { type: '3pta', label: '3PT MISS', color: 'bg-red-600 hover:bg-red-700' },
    { type: 'ftm', label: 'FT MAKE', color: 'bg-green-700 hover:bg-green-800', val: 1 },
    { type: 'fta', label: 'FT MISS', color: 'bg-red-700 hover:bg-red-800' },
    { type: 'reb', label: 'REBOUND', color: 'bg-blue-600 hover:bg-blue-700' },
    { type: 'ast', label: 'ASSIST', color: 'bg-sky-600 hover:bg-sky-700' },
    { type: 'tov', label: 'TOV', color: 'bg-orange-600 hover:bg-orange-700' },
    { type: 'stl', label: 'STEAL', color: 'bg-cyan-600 hover:bg-cyan-700' },
    { type: 'blk', label: 'BLOCK', color: 'bg-teal-600 hover:bg-teal-700' },
    { type: 'pf', label: 'FOUL', color: 'bg-purple-600 hover:bg-purple-700' },
    { type: 'fd', label: 'FOUL DRAWN', color: 'bg-amber-600 hover:bg-amber-700' },
  ];

  const isLite = activeMode === 'simple';
  const statButtons = isLite ? simpleStats : complexStats;

  const shootingTeam = selectedTeamId === homeTeam.id ? homeTeam : selectedTeamId === awayTeam.id ? awayTeam : null;

  return (
    <div className="h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden font-sans select-none">
      
      {/* Top Header Scoreboard */}
      <div className="sa-topline shrink-0" />
      <header className="h-16 border-b border-border bg-card flex items-center justify-between px-4 shrink-0">
        <div className="flex items-center w-1/3 gap-3">
          <Link href={homeHref} title="Back to league (does not finalize)" className="shrink-0 hover:opacity-90 transition-opacity">
            <BrandMark className="h-8" />
          </Link>
          <AppMenu triggerClassName="text-muted-foreground hover:text-foreground hover:bg-accent" />
          <div className="text-3xl font-black font-mono tracking-tighter" style={{ color: teamTextColor(awayTeam.colorPrimary, appSurface()) }}>
            {awayTeam.abbreviation}
          </div>
          <div className="text-4xl font-black font-mono tracking-tighter text-foreground">
            {boxScore?.away.totalPoints || 0}
          </div>
          {possessions?.currentPossessionTeamId === awayTeam.id && <ArrowLeft className="w-5 h-5 text-muted-foreground" />}
        </div>
        
        <div className="flex-1 flex justify-center items-center gap-6">
          <div className="text-center font-mono font-bold">
            <div className="text-xs text-muted-foreground">PERIOD</div>
            <div className="text-xl leading-none text-foreground">{game.currentPeriod}</div>
          </div>
          
          <div className="bg-[#0b0d10] border border-white/10 rounded-xl px-4 py-1 flex items-center gap-4">
            <span className="text-4xl font-bold font-mono text-amber-400 tabular-nums">
              {formatClock(localClock)}
            </span>
            <Button 
              variant="outline" 
              size="icon" 
              className={`h-10 w-10 ${isRunning ? 'bg-amber-500/20 text-amber-400 border-amber-500/50 hover:bg-amber-500/30' : 'bg-white/10 text-white border-white/15 hover:bg-white/20'}`}
              onClick={() => setIsRunning(!isRunning)}
            >
              {isRunning ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
            </Button>
          </div>
          <LocalModeBadge inline />
        </div>

        <div className="flex items-center justify-end w-1/3 gap-4">
          {possessions?.currentPossessionTeamId === homeTeam.id && <ArrowRight className="w-5 h-5 text-muted-foreground" />}
          <div className="text-4xl font-black font-mono tracking-tighter text-foreground">
            {boxScore?.home.totalPoints || 0}
          </div>
          <div className="text-3xl font-black font-mono tracking-tighter" style={{ color: teamTextColor(homeTeam.colorPrimary, appSurface()) }}>
            {homeTeam.abbreviation}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        
        {/* Play Capture Area */}
        <div className="flex-1 flex flex-col p-4 gap-4 overflow-hidden">
          
          {/* Team Panels + Court */}
          <div className={`flex-1 grid grid-rows-1 gap-3 xl:gap-4 min-h-0 ${isLite ? 'grid-cols-2' : 'grid-cols-[0.9fr_1.4fr_0.9fr] xl:grid-cols-[0.7fr_1.6fr_0.7fr]'}`}>
            {[awayTeam].map(team => (
              <TeamPanel
                key={team.id}
                team={team}
                onCourt={awayOnCourt}
                bench={awayBench}
                selectedPlayerId={selectedPlayerId}
                onSelectPlayer={(id) => {
                  if (subMode && subMode.teamId === team.id) { handleSubstitute(team.id, id); return; }
                  setSelectedPlayerId(id); setSelectedTeamId(team.id); setPendingFgEvent(null);
                }}
                onTimeout={() => handleStat('timeout' as StatEventType, 0, { teamId: team.id })}
                onTeamFoul={() => handleStat('tf' as StatEventType, 0, { teamId: team.id })}
                subModeBenchPlayerId={subMode && subMode.teamId === team.id ? subMode.benchPlayerId : null}
                onSelectBenchPlayer={(id) => handleBenchPlayerClick(team.id, id)}
                benchBeside={isLite}
              />
            ))}

            {/* Court zone picker (Pro only) */}
            {!isLite && (
            <div className="flex flex-col bg-card rounded-xl border border-border shadow-sm p-3 min-h-0">
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2 text-center shrink-0">
                {pendingFgEvent ? (
                  <span className="text-amber-600">
                    Tap a {fgShotValue(pendingFgEvent)}PT zone, or press the button again to skip
                  </span>
                ) : (
                  <>Shot Location <span className="font-normal normal-case text-muted-foreground/60">(optional)</span></>
                )}
              </div>
              <CourtZones
                selectedZone={selectedZone}
                onSelectZone={handleZoneSelect}
                accentColor={shootingTeam?.colorPrimary ?? '#f97316'}
                allowedShotValue={
                  selectedZone
                    ? null
                    : pendingFgEvent
                    ? fgShotValue(pendingFgEvent)
                    : null
                }
                className="flex-1 min-h-0"
              />
              {(selectedZone || pendingFgEvent) && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-2 h-7 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => { setSelectedZone(null); setPendingFgEvent(null); }}
                >
                  <X className="w-3 h-3 mr-1" /> Clear zone
                </Button>
              )}
            </div>
            )}

            {[homeTeam].map(team => (
              <TeamPanel
                key={team.id}
                team={team}
                onCourt={homeOnCourt}
                bench={homeBench}
                selectedPlayerId={selectedPlayerId}
                onSelectPlayer={(id) => {
                  if (subMode && subMode.teamId === team.id) { handleSubstitute(team.id, id); return; }
                  setSelectedPlayerId(id); setSelectedTeamId(team.id); setPendingFgEvent(null);
                }}
                onTimeout={() => handleStat('timeout' as StatEventType, 0, { teamId: team.id })}
                onTeamFoul={() => handleStat('tf' as StatEventType, 0, { teamId: team.id })}
                subModeBenchPlayerId={subMode && subMode.teamId === team.id ? subMode.benchPlayerId : null}
                onSelectBenchPlayer={(id) => handleBenchPlayerClick(team.id, id)}
                benchBeside={isLite}
              />
            ))}
          </div>

          {/* Stat Buttons Matrix */}
          <div className={`${isLite ? 'h-72 xl:h-80' : 'h-64'} bg-card rounded-xl border border-border shadow-sm p-4 flex flex-col gap-4 shrink-0`}>
            <div className={`grid gap-2 flex-1 ${isLite ? 'grid-cols-6 xl:gap-3' : 'grid-cols-6'}`}>
              {statButtons.map(btn => {
                const btnType = btn.type as StatEventType;
                const btnShotValue = fgShotValue(btnType);
                const enforcedShotValue = selectedZone
                  ? ZONE_SHOT_VALUE[selectedZone]
                  : pendingFgEvent
                  ? fgShotValue(pendingFgEvent)
                  : null;
                const isMismatched = btnShotValue != null && enforcedShotValue != null && btnShotValue !== enforcedShotValue;
                const isArmed = pendingFgEvent === btnType;
                const isDisabled = !selectedPlayerId || isMismatched;
                return (
                  <button
                    key={btn.type}
                    disabled={isDisabled}
                    onClick={() => handleStatButtonClick(btn.type as StatEventType | 'reb', btn.val)}
                    className={`rounded-[10px] sa-display font-bold leading-none ${isLite ? 'text-2xl xl:text-3xl' : 'text-xl xl:text-2xl'} text-white transition-all
                      ${btn.color} 
                      ${isDisabled ? 'opacity-20 cursor-not-allowed grayscale' : 'shadow-md active:scale-95'}
                      ${isArmed ? 'ring-4 ring-amber-400 ring-offset-1' : ''}
                    `}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2 h-12">
              <Button 
                variant="outline" 
                className="flex-1 bg-card hover:bg-accent border-[hsl(var(--border-strong))] text-foreground font-bold"
                onClick={() => handleStat('jump_ball' as StatEventType)}
              >
                JUMP BALL
              </Button>
              <Button 
                variant="outline" 
                className="flex-1 bg-card hover:bg-accent border-[hsl(var(--border-strong))] text-foreground font-bold"
                onClick={handleEndPeriod}
              >
                END PERIOD
              </Button>
              <Button 
                variant="outline" 
                className="flex-1 bg-card hover:bg-accent border-[hsl(var(--border-strong))] text-foreground font-bold"
                onClick={handleStartPeriod}
              >
                START PERIOD
              </Button>
            </div>
          </div>

        </div>

        {/* Right Rail - PBP */}
        <div className="w-64 xl:w-80 bg-card border-l border-border flex flex-col shrink-0">
          <div className="p-4 border-b border-border flex justify-between items-center bg-secondary/60">
            <h2 className="font-bold text-muted-foreground text-sm tracking-wide">PLAY BY PLAY</h2>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="h-8 bg-card border-[hsl(var(--border-strong))] text-foreground hover:bg-accent" onClick={handleUndo}>
                <Undo2 className="w-4 h-4 mr-2" /> Undo
              </Button>
              <Link href={`/game/${gameId}/box`}>
                <Button size="sm" variant="outline" className="h-8 bg-card border-[hsl(var(--border-strong))] text-foreground hover:bg-accent">
                  <BarChart2 className="w-4 h-4" />
                </Button>
              </Link>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto p-2 space-y-1">
            {pbp?.map(entry => {
              const t = entry.teamId ? teams?.find(x => x.id === entry.teamId) : null;
              const editable = entry.statEventId != null;
              return (
                <div
                  key={entry.id}
                  role={editable ? "button" : undefined}
                  tabIndex={editable ? 0 : undefined}
                  onClick={editable ? () => openEditPbp(entry) : undefined}
                  onKeyDown={editable ? (e) => { if (e.key === 'Enter') openEditPbp(entry); } : undefined}
                  className={`w-full text-left text-sm p-3 rounded flex items-start gap-3 border group ${entry.needsReview ? 'bg-amber-50 border-amber-300' : 'bg-secondary/60 border-border'} ${editable ? 'hover:bg-accent hover:border-amber-400 cursor-pointer' : 'opacity-70 cursor-default'}`}
                >
                  <div className="text-xs font-mono text-muted-foreground shrink-0 w-12 text-right pt-0.5">
                    {formatClock(entry.clockSeconds)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {t && <div className="w-2 h-2 rounded-full ring-1 ring-foreground/25" style={{ backgroundColor: t.colorPrimary }} />}
                      <span className="font-bold font-mono tracking-tighter text-foreground">
                        {entry.awayScore} - {entry.homeScore}
                      </span>
                    </div>
                    <div className="text-muted-foreground leading-tight">
                      {entry.eventText}
                    </div>
                  </div>
                  {editable && (
                    <button
                      type="button"
                      title={entry.needsReview ? "Mark as reviewed" : "Flag for review"}
                      onClick={(e) => { e.stopPropagation(); handleToggleReview(entry); }}
                      className={`shrink-0 mt-0.5 p-0.5 rounded ${entry.needsReview ? 'text-amber-600 hover:text-amber-700' : 'text-muted-foreground/60 hover:text-amber-500'}`}
                    >
                      {entry.needsReview ? <Flag className="w-3.5 h-3.5 fill-current" /> : <Flag className="w-3.5 h-3.5" />}
                    </button>
                  )}
                  {editable && (
                    <Pencil className="w-3.5 h-3.5 text-muted-foreground/60 group-hover:text-amber-500 shrink-0 mt-0.5" />
                  )}
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-secondary/60 border-t border-border">
            <Button 
              className="w-full font-bold" 
              onClick={() => {
                const flagged = (pbp ?? []).filter(p => p.needsReview);
                // Outstanding flags always force the confirmation dialog —
                // even if the scorer turned off "confirm before finalize" —
                // so a flagged play is never silently finalized unseen.
                if (loadSettings().confirmBeforeFinalize || flagged.length > 0) {
                  setFinalizeDialogOpen(true);
                } else {
                  handleFinalizeGame();
                }
              }}
              disabled={updateGame.isPending}
            >
              {updateGame.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> FINALIZING...
                </>
              ) : (
                'FINALIZE GAME'
              )}
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={!!editPbp} onOpenChange={(open) => !open && closeEditPbp()}>
        <DialogContent className="bg-card text-foreground border-border sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter">
              Edit play
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Correct the event type, team, player, or shot location for this play.
            </DialogDescription>
          </DialogHeader>
          {editPbp && (() => {
            const allEventTypes: StatEventType[] = complexStats.map(s => s.type as StatEventType);
            const eventTypeOptions: { value: StatEventType; label: string }[] = [
              ...allEventTypes.map(t => ({ value: t, label: (complexStats.find(b => b.type === t)?.label ?? t) })),
              { value: 'flagrant' as StatEventType, label: 'FLAGRANT' },
              { value: 'sub_in' as StatEventType, label: 'SUB IN' },
              { value: 'sub_out' as StatEventType, label: 'SUB OUT' },
              { value: 'timeout' as StatEventType, label: 'TIMEOUT' },
              { value: 'jump_ball' as StatEventType, label: 'JUMP BALL' },
              { value: 'period_start' as StatEventType, label: 'PERIOD START' },
              { value: 'period_end' as StatEventType, label: 'PERIOD END' },
            ].filter((opt, i, arr) => arr.findIndex(o => o.value === opt.value) === i);

            const currentTeam = editForm.teamId ? teams?.find(t => t.id === editForm.teamId) : null;
            const eligiblePlayers = editForm.teamId
              ? (players ?? []).filter(p => p.teamId === editForm.teamId)
              : [];
            const isFgShot = FG_SHOT_TYPES.has(editForm.eventType);
            return (
              <div className="space-y-4 mt-2">
                <div className="text-xs text-muted-foreground font-mono">
                  Q{editPbp.period} • {formatClock(editPbp.clockSeconds)}
                </div>
                <div className="text-sm text-muted-foreground bg-secondary/60 rounded p-3 border border-border">
                  Currently: {editPbp.eventText}
                </div>

                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Event type</div>
                  <Select
                    value={editForm.eventType}
                    onValueChange={(v) => {
                      const nextType = v as StatEventType;
                      const nextShotValue = fgShotValue(nextType);
                      // Clear a shot zone that no longer matches the new event type's
                      // point value, mirroring the capture screen's zone/type guard.
                      const keepZone =
                        editForm.shotZone && (nextShotValue == null || ZONE_SHOT_VALUE[editForm.shotZone] === nextShotValue);
                      setEditForm({ ...editForm, eventType: nextType, shotZone: keepZone ? editForm.shotZone : null });
                    }}
                  >
                    <SelectTrigger className="bg-card border-[hsl(var(--border-strong))] text-foreground h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-[hsl(var(--border-strong))] text-foreground">
                      {eventTypeOptions.map(opt => (
                        <SelectItem key={opt.value} value={opt.value} className="focus:bg-accent focus:text-foreground">
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Team</div>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { id: null, label: 'NONE', color: '#94a3b8' },
                      { id: awayTeam.id, label: awayTeam.abbreviation, color: teamTextColor(awayTeam.colorPrimary, appSurface()) },
                      { id: homeTeam.id, label: homeTeam.abbreviation, color: teamTextColor(homeTeam.colorPrimary, appSurface()) },
                    ].map(opt => {
                      const selected = editForm.teamId === opt.id;
                      return (
                        <button
                          key={String(opt.id)}
                          type="button"
                          onClick={() => setEditForm({ ...editForm, teamId: opt.id, playerId: opt.id === editForm.teamId ? editForm.playerId : null })}
                          className={`h-10 rounded font-black text-sm tracking-tighter border-2 transition ${selected ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-secondary'}`}
                          style={{ color: opt.color }}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                    Player {currentTeam ? `(${currentTeam.abbreviation})` : ''}
                  </div>
                  <Select
                    value={editForm.playerId == null ? 'none' : String(editForm.playerId)}
                    onValueChange={(v) => setEditForm({ ...editForm, playerId: v === 'none' ? null : Number(v) })}
                    disabled={editForm.teamId == null}
                  >
                    <SelectTrigger className="bg-card border-[hsl(var(--border-strong))] text-foreground h-10 disabled:opacity-50">
                      <SelectValue placeholder={editForm.teamId == null ? 'Select a team first' : 'No player'} />
                    </SelectTrigger>
                    <SelectContent className="bg-card border-[hsl(var(--border-strong))] text-foreground">
                      <SelectItem value="none" className="focus:bg-accent focus:text-foreground">No player</SelectItem>
                      {eligiblePlayers.map(p => (
                        <SelectItem key={p.id} value={String(p.id)} className="focus:bg-accent focus:text-foreground">
                          #{p.jerseyNumber} {p.firstName} {p.lastName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {isFgShot && !isLite && (() => {
                  const editShotValue = fgShotValue(editForm.eventType);
                  const eligibleZones = SHOT_ZONES.filter(
                    (z) => editShotValue == null || ZONE_SHOT_VALUE[z.id] === editShotValue,
                  );
                  return (
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">
                        Shot location <span className="font-normal normal-case text-muted-foreground/60">(optional)</span>
                      </div>
                      <Select
                        value={editForm.shotZone ?? 'none'}
                        onValueChange={(v) => setEditForm({ ...editForm, shotZone: v === 'none' ? null : v as ShotZoneId })}
                      >
                        <SelectTrigger className="bg-card border-[hsl(var(--border-strong))] text-foreground h-10">
                          <SelectValue placeholder="No zone" />
                        </SelectTrigger>
                        <SelectContent className="bg-card border-[hsl(var(--border-strong))] text-foreground">
                          <SelectItem value="none" className="focus:bg-accent focus:text-foreground">No zone</SelectItem>
                          {eligibleZones.map(z => (
                            <SelectItem key={z.id} value={z.id} className="focus:bg-accent focus:text-foreground">
                              {z.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
          <DialogFooter className="gap-2 sm:gap-2 mt-4">
            <Button
              variant="outline"
              className="bg-red-50 border-red-200 hover:bg-red-100 hover:text-red-700 text-red-600"
              onClick={handleDeletePbp}
              disabled={updateStat.isPending || deleteStat.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" /> Delete
            </Button>
            <div className="flex-1" />
            <Button
              variant="outline"
              className="bg-card border-[hsl(var(--border-strong))] text-foreground hover:bg-accent"
              onClick={closeEditPbp}
              disabled={updateStat.isPending || deleteStat.isPending}
            >
              Cancel
            </Button>
            <Button
              className="bg-amber-500 hover:bg-amber-600 text-white font-bold"
              onClick={handleSaveEdit}
              disabled={updateStat.isPending || deleteStat.isPending}
            >
              {updateStat.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={finalizeDialogOpen} onOpenChange={(open) => !updateGame.isPending && setFinalizeDialogOpen(open)}>
        <DialogContent className="bg-card text-foreground border-border sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter">
              Finalize this game?
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              This locks the game and stops all stat capture. You won't be able to record or edit any more plays. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          {(() => {
            const flaggedPlays = (pbp ?? []).filter(p => p.needsReview);
            if (flaggedPlays.length === 0) return null;
            return (
              <div className="mt-2 border border-amber-300 bg-amber-50 rounded-lg p-3 max-h-48 overflow-auto">
                <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase tracking-wide mb-2">
                  <ShieldAlert className="w-4 h-4" />
                  Quality check — {flaggedPlays.length} flagged {flaggedPlays.length === 1 ? 'play' : 'plays'}
                </div>
                <div className="space-y-1.5">
                  {flaggedPlays.map(entry => (
                    <button
                      key={entry.id}
                      type="button"
                      className="w-full text-left text-xs text-foreground hover:text-foreground flex items-start gap-2"
                      onClick={() => { setFinalizeDialogOpen(false); openEditPbp(entry); }}
                    >
                      <Flag className="w-3 h-3 fill-current text-amber-600 shrink-0 mt-0.5" />
                      <span>{periodLabel(entry.period)} {formatClock(entry.clockSeconds)} — {entry.eventText}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })()}
          <DialogFooter className="gap-2 sm:gap-2 mt-4">
            <Button
              variant="outline"
              className="bg-card border-[hsl(var(--border-strong))] text-foreground hover:bg-accent"
              onClick={() => setFinalizeDialogOpen(false)}
              disabled={updateGame.isPending}
            >
              Cancel
            </Button>
            <Button
              className="font-bold"
              onClick={handleFinalizeGame}
              disabled={updateGame.isPending}
            >
              {updateGame.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Finalizing...
                </>
              ) : (
                'Yes, finalize game'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Non-blocking prompt after a period ends or a timeout is called —
          surfaces flagged plays from the relevant period while it's still
          fresh, without stopping the scorer from continuing. */}
      <Dialog open={reviewPrompt.open} onOpenChange={(open) => !open && setReviewPrompt(p => ({ ...p, open: false }))}>
        <DialogContent className="bg-card text-foreground border-border sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-black uppercase tracking-tighter flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-amber-500" />
              Flagged plays — {reviewPrompt.periodLabel}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">
              These plays were flagged for review during {reviewPrompt.periodLabel}. Take a look now, or check them again before you finalize.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-auto">
            {reviewPrompt.entries.map(entry => (
              <div key={entry.id} className="flex items-start gap-2 p-2 rounded border border-amber-200 bg-amber-50">
                <div className="flex-1 min-w-0 text-sm">
                  <div className="text-xs font-mono text-muted-foreground">{formatClock(entry.clockSeconds)}</div>
                  <div className="text-foreground leading-tight">{entry.eventText}</div>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs bg-card border-[hsl(var(--border-strong))]"
                    onClick={() => { setReviewPrompt(p => ({ ...p, open: false })); openEditPbp(entry); }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-amber-700 hover:text-amber-800"
                    onClick={async () => {
                      await handleToggleReview(entry);
                      setReviewPrompt(p => ({ ...p, entries: p.entries.filter(e => e.id !== entry.id) }));
                    }}
                  >
                    <FlagOff className="w-3.5 h-3.5 mr-1" /> Reviewed
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter className="mt-2">
            <Button
              variant="outline"
              className="bg-card border-[hsl(var(--border-strong))] text-foreground hover:bg-accent"
              onClick={() => setReviewPrompt(p => ({ ...p, open: false }))}
            >
              Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={ftDialog.open} onOpenChange={(open) => !open && setFtDialog({ open: false })}>
        <DialogContent className="bg-card text-foreground border-border sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Free Throw Sequence</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 mt-4">
            {[1, 2, 3].map(total => (
              <div key={total} className="space-y-2">
                <div className="text-center font-bold text-muted-foreground mb-2">{total} SHOTS</div>
                {Array.from({ length: total }).map((_, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    className="w-full bg-card border-[hsl(var(--border-strong))] text-foreground hover:bg-accent"
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

function TeamPanel({
  team,
  onCourt,
  bench,
  selectedPlayerId,
  onSelectPlayer,
  onTimeout,
  onTeamFoul,
  subModeBenchPlayerId,
  onSelectBenchPlayer,
  benchBeside = false,
}: {
  team: { id: number; abbreviation: string; colorPrimary: string };
  onCourt: { id: number; jerseyNumber: string | number; lastName: string }[];
  bench: { id: number; jerseyNumber: string | number; lastName: string }[];
  selectedPlayerId: number | null;
  onSelectPlayer: (id: number) => void;
  onTimeout: () => void;
  onTeamFoul: () => void;
  // Non-null when a bench player on this team is armed for a substitution —
  // the value is that bench player's id, and on-court rows become tap
  // targets to complete the swap.
  subModeBenchPlayerId: number | null;
  onSelectBenchPlayer: (id: number) => void;
  // Wide panels (Lite has no court) put the bench beside the on-court five
  // instead of underneath, so it stays visible without scrolling.
  benchBeside?: boolean;
}) {
  const subActive = subModeBenchPlayerId != null;
  return (
    <div className="flex flex-col min-h-0 bg-card rounded-xl border border-border shadow-sm relative overflow-y-auto overflow-x-hidden">
      <div className="sticky top-0 left-0 w-full h-1 z-10" style={{ backgroundColor: team.colorPrimary }} />

      <div className={benchBeside ? "flex-1 min-h-0 grid grid-cols-[3fr_2fr]" : "contents"}>
      <div className="p-2 grid grid-rows-5 gap-2 shrink-0">
        {onCourt.map(p => {
          const isSelected = selectedPlayerId === p.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelectPlayer(p.id)}
              title={subActive ? "Tap to sub this player out" : undefined}
              className={`flex items-center gap-2 px-2 xl:gap-4 xl:px-4 py-2 rounded-lg border-2 transition-all font-bold ${
                subActive
                  ? 'border-amber-400 bg-amber-50 hover:bg-amber-100 ring-2 ring-amber-200'
                  : isSelected
                  ? 'border-primary bg-primary/10'
                  : 'border-transparent bg-secondary/60 hover:bg-accent'
              }`}
            >
              <div
                className="text-xl xl:text-2xl font-black font-mono w-9 xl:w-12 shrink-0 text-center"
                style={{ color: teamTextColor(team.colorPrimary, appSurface()) }}
              >
                {p.jerseyNumber}
              </div>
              <div className="text-left flex-1 min-w-0 truncate sa-display font-semibold text-lg xl:text-2xl text-foreground">
                {p.lastName}
              </div>
            </button>
          );
        })}
      </div>

      {/* Bench — tap a bench player, then tap an on-court player to swap them in.
          min-h floor keeps this from collapsing to invisible on short viewports;
          the panel as a whole scrolls (see overflow-y-auto above) if space is tight. */}
      <div className={`flex-1 min-h-[72px] flex flex-col border-border px-2 pt-2 ${benchBeside ? 'border-l min-h-0' : 'border-t'}`}>
        <div className="flex items-center justify-between px-1 shrink-0">
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Bench</span>
          <span className="text-[10px] font-mono text-muted-foreground/60">{bench.length}</span>
        </div>
        <div className="flex-1 min-h-[40px] overflow-y-auto space-y-1 py-1">
          {bench.length === 0 ? (
            <div className="h-full flex items-center justify-center text-center text-[11px] text-muted-foreground/60 italic px-2">
              No bench players
            </div>
          ) : (
            bench.map(p => {
              const isArmed = subModeBenchPlayerId === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelectBenchPlayer(p.id)}
                  title={isArmed ? "Tap an on-court player to sub in this player" : "Tap to substitute this player in"}
                  className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-lg border transition-all select-none ${
                    isArmed
                      ? 'border-amber-400 bg-amber-50 ring-2 ring-amber-300'
                      : 'border-transparent bg-secondary/60 hover:bg-accent'
                  }`}
                >
                  <div className={`text-sm font-black font-mono w-8 text-center ${isArmed ? 'text-amber-600' : 'text-muted-foreground'}`}>
                    {p.jerseyNumber}
                  </div>
                  <div className={`text-left flex-1 min-w-0 truncate text-sm tracking-tight uppercase ${isArmed ? 'text-amber-700' : 'text-muted-foreground'}`}>
                    {p.lastName}
                  </div>
                </button>
              );
            })
          )}
        </div>
        {subActive && (
          <div className="text-[9px] font-bold uppercase tracking-wider text-amber-600 text-center py-1 shrink-0">
            Tap an on-court player to sub in
          </div>
        )}
      </div>
      </div>

      {/* Team Actions */}
      <div className="sticky bottom-0 mt-auto h-14 xl:h-16 shrink-0 border-t border-border bg-secondary/60 flex p-2 gap-2">
        <Button
          className="flex-1 min-w-0 h-full px-1 text-xs xl:text-sm bg-card hover:bg-accent text-foreground border border-[hsl(var(--border-strong))] font-bold"
          onClick={onTimeout}
        >
          TIMEOUT
        </Button>
        <Button
          className="flex-1 min-w-0 h-full px-1 text-xs xl:text-sm bg-card hover:bg-accent text-foreground border border-[hsl(var(--border-strong))] font-bold"
          onClick={onTeamFoul}
        >
          TEAM FOUL
        </Button>
      </div>
    </div>
  );
}
