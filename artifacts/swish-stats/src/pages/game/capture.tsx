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
import { Loader2, Play, Pause, Undo2, ArrowLeft, ArrowRight, ArrowLeftRight, BarChart2, ListOrdered, Pencil, Trash2, Home, X, Flag, FlagOff, ShieldAlert } from "lucide-react";
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
import { ShotCourt, FullCourt, type CourtShot, type FullCourtShot } from "@/components/shot-court";
import {
  attacksLeft, classifyShot, classifyStored, distanceMetres, distanceMetresStored, fullToStored,
  halfPointFor, halfPointToStored, storedToFull,
  type CourtPoint, type FullPoint, type ShotZoneKey, type StoredShot,
} from "@/lib/shot-geometry";
import { teamTextColor, appSurface } from "@/lib/team-colors";
import {
  TURNOVER_TYPES, arrowTeam, gameRules, inGameOrder, periodLabel as gamePeriodLabel, playerFouls, teamFouls, timeoutsLeft,
  type GameEvent, type PlayerFouls,
} from "@/lib/game-state";

// Field-goal make/miss event types — the only ones a shot zone applies to.
const FG_SHOT_TYPES = new Set<StatEventType>(['2ptm', '2pta', '3ptm', '3pta']);

// Point value a given FG stat button represents, or null for non-FG stats.
function fgShotValue(type: StatEventType): 2 | 3 | null {
  if (type === '2ptm' || type === '2pta') return 2;
  if (type === '3ptm' || type === '3pta') return 3;
  return null;
}

// A shot the scorer has started in Pro. It completes as soon as both a result
// and a shooter are known, in whichever order the scorer gives them.
type PendingShot = {
  // Where it was taken: a real floor position (full court), a spot on the
  // half-court diagram (which basket depends on the shooter's team), or null
  // when recorded without a location.
  tap: { kind: 'full'; stored: StoredShot } | { kind: 'half'; point: CourtPoint } | null;
  // Full court: the team attacking the basket that was tapped (or the team of
  // a player picked first). Only that team can be the shooter.
  teamId: number | null;
  value: 2 | 3;
  zone: ShotZoneKey | null;
  label: string;
  metres: number | null;
  made: boolean | null;
  // Optional detail: "layup", "dunk", "fastbreak"...
  tags?: string[];
};

// What usually comes next. `teamId` is always the team whose player the
// scorer is being asked to tap. A prompt never blocks — any other action
// simply dismisses it.
type FollowUp =
  // Assist after a make (the shooter's team); rebound after a miss (teamId = the shooting team).
  | { kind: 'assist' | 'rebound'; teamId: number; shooterId: number | null; blocked?: boolean }
  // Who blocked it (the defending team), then back to the rebound.
  | { kind: 'block'; teamId: number; shotTeamId: number; shooterId: number | null }
  // After a turnover: who stole it. After a steal: who lost it.
  | { kind: 'steal' | 'turnover'; teamId: number }
  // After a foul: who was fouled, and how many free throws they get.
  | { kind: 'fouled'; teamId: number; fts: number; recordFd: boolean; noRebound: boolean };

// A trip to the line. total 0 = still asking how many shots.
type FtSeq = { teamId: number; playerId: number; total: number; index: number; noRebound: boolean };

type FoulChoice = 'personal' | 'shooting2' | 'shooting3' | 'and1' | 'offensive' | 'technical' | 'unsportsmanlike' | 'disqualifying' | 'coach' | 'bench';

// "7:42" or "742" → seconds; null if it isn't a clock.
function parseClock(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2}):?([0-5]\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

type ShotEvent = { id: number; eventType: string; teamId: number | null; period: number; shotX?: number | null; shotY?: number | null; shotZone?: string | null };

export default function GameCapture() {
  const [, params] = useRoute("/game/:gameId");
  const gameId = Number(params?.gameId);
  const queryClient = useQueryClient();
  const [, setLocation] = useLocation();
  const search = useSearch();
  const leagueQuery = new URLSearchParams(search).get("league");

  const [selectedPlayerId, setSelectedPlayerId] = useState<number | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [pendingShot, setPendingShot] = useState<PendingShot | null>(null);
  const [followUp, setFollowUp] = useState<FollowUp | null>(null);
  // Full-court Pro tucks the play-by-play into a slide-in panel.
  const [playsOpen, setPlaysOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [localClock, setLocalClock] = useState(0);
  const [ftSeq, setFtSeq] = useState<FtSeq | null>(null);
  const [foulDialog, setFoulDialog] = useState<{ teamId: number; playerId: number | null } | null>(null);
  const [tovDialog, setTovDialog] = useState<{ teamId: number; playerId: number | null } | null>(null);
  const [tipDialog, setTipDialog] = useState(false);
  const [endsOpen, setEndsOpen] = useState(false);
  const [editPbp, setEditPbp] = useState<PlayByPlayEntry | null>(null);
  // Substitution flow: tapping a bench player arms it, then tapping an
  // on-court player on the same team completes the swap.
  const [subMode, setSubMode] = useState<{ teamId: number; benchPlayerId: number } | null>(null);
  const [editForm, setEditForm] = useState<{ eventType: StatEventType; teamId: number | null; playerId: number | null; shotZone: string | null; shotX: number | null; shotY: number | null; period: number; clock: string }>({ eventType: '2ptm' as StatEventType, teamId: null, playerId: null, shotZone: null, shotX: null, shotY: null, period: 1, clock: '' });
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

  // Before the first play of a full-court game, check the teams are shown
  // attacking the right baskets — every shot location depends on it.
  const endsKey = `swish-stats:ends:${gameId}`;
  useEffect(() => {
    if (!game || !statEvents || game.status === 'final') return;
    if (game.captureMode === 'simple' || loadSettings().courtView !== 'full') return;
    if (statEvents.length === 0 && !window.localStorage.getItem(endsKey)) setEndsOpen(true);
  }, [game?.id, game?.status, game?.captureMode, statEvents?.length, endsKey]);

  // Keyboard: space starts/stops the clock, Ctrl/Cmd+Z undoes the last play.
  const undoRef = useRef<() => void>(() => {});
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.code === 'Space') { e.preventDefault(); setIsRunning(r => !r); }
      else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undoRef.current(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  // Table-crew state, worked out from the plays so far.
  const rules = gameRules(game as unknown as Parameters<typeof gameRules>[0]);
  const evAsc = inGameOrder((statEvents ?? []) as unknown as GameEvent[]);
  const otherTeamId = (id: number) => (id === homeTeam.id ? awayTeam.id : homeTeam.id);
  const abbr = (id: number | null) => (id === homeTeam.id ? homeTeam.abbreviation : awayTeam.abbreviation);
  const playerName = (id: number | null) => {
    const p = players.find(x => x.id === id);
    return p ? `#${p.jerseyNumber} ${p.lastName}` : 'player';
  };
  const foulsByPlayer = new Map<number, PlayerFouls>(players.map(p => [p.id, playerFouls(evAsc, p.id, rules)]));
  const teamFoulCount = (teamId: number) => teamFouls(evAsc, teamId, game.currentPeriod, rules);
  // At the limit, every further foul sends the other team to the line.
  const inPenalty = (teamId: number) => teamFoulCount(teamId) >= rules.bonusAfterTeamFouls;
  const arrowId = arrowTeam(evAsc, homeTeam.id, awayTeam.id);
  const detail = loadSettings().detailPrompts;

  const invalidateData = () => {
    queryClient.invalidateQueries({ queryKey: getListStatEventsQueryKey(gameId) });
    queryClient.invalidateQueries({ queryKey: getListPlayByPlayQueryKey(gameId) });
    queryClient.invalidateQueries({ queryKey: getGetBoxScoreQueryKey(gameId) });
    queryClient.invalidateQueries({ queryKey: getGetPossessionsQueryKey(gameId) });
    queryClient.invalidateQueries({ queryKey: getGetGameQueryKey(gameId) });
  };

  // `extra` overrides the defaults below: free-throw sequence data, a team
  // for team events, the shooter + location for a shot, or qualifier tags.
  // `opts.next` says what to ask for afterwards instead of the usual prompt.
  const handleStat = async (eventType: StatEventType, value: number = 0, ftData?: any, opts?: { next?: FollowUp | null }): Promise<boolean> => {
    if (!(ftData?.teamId ?? selectedTeamId) && !['timeout', 'period_start', 'period_end', 'jump_ball'].includes(eventType)) {
      toast.error("Select a player first");
      return false;
    }

    const isFt = eventType === 'ftm' || eventType === 'fta';
    const isFgShot = FG_SHOT_TYPES.has(eventType);

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
          shotZone: null,
          ...ftData
        }
      });
      invalidateData();
      if (!isFt) {
        setSelectedPlayerId(null);
        setSelectedTeamId(null);
      }
      if (isFgShot) setPendingShot(null);

      const eventTeamId: number | null = ftData?.teamId ?? selectedTeamId;
      const eventPlayerId: number | null = ftData?.playerId !== undefined ? ftData.playerId : selectedPlayerId;

      // Foul trouble: say so the moment it happens.
      if (eventPlayerId != null && ['pf', 'tf', 'flagrant'].includes(eventType)) {
        const after = playerFouls(
          [...evAsc, { id: -1, teamId: eventTeamId, playerId: eventPlayerId, period: game.currentPeriod, clockSeconds: localClock, eventType, qualifiers: ftData?.qualifiers }],
          eventPlayerId, rules);
        if (after.out === 'ejected') toast.error(`${playerName(eventPlayerId)} is ejected — substitute them now`, { duration: 8000 });
        else if (after.out === 'fouls') toast.error(`${playerName(eventPlayerId)} has fouled out (${after.total}) — substitute them now`, { duration: 8000 });
        else if (after.total === rules.foulLimit - 1) toast.warning(`${playerName(eventPlayerId)} is on ${after.total} fouls`);
      }

      // Offer the natural next step (see FollowUp).
      if (opts?.next !== undefined) setFollowUp(opts.next);
      else if (!loadSettings().followUpPrompts || eventTeamId == null) setFollowUp(null);
      else if (eventType === '2ptm' || eventType === '3ptm') setFollowUp({ kind: 'assist', teamId: eventTeamId, shooterId: eventPlayerId });
      else if (eventType === '2pta' || eventType === '3pta') setFollowUp({ kind: 'rebound', teamId: eventTeamId, shooterId: eventPlayerId });
      else if (eventType === 'tov' && eventPlayerId != null) setFollowUp({ kind: 'steal', teamId: otherTeamId(eventTeamId) });
      else if (eventType === 'stl') setFollowUp({ kind: 'turnover', teamId: otherTeamId(eventTeamId) });
      else setFollowUp(null);

      if (eventType === 'timeout') {
        const flaggedThisPeriod = (pbp ?? []).filter(
          p => p.period === game.currentPeriod && p.needsReview,
        );
        if (flaggedThisPeriod.length > 0) {
          setReviewPrompt({ open: true, periodLabel: periodLabel(game.currentPeriod), entries: flaggedThisPeriod });
        }
      }
      return true;
    } catch (e) {
      toast.error("Failed to record stat");
      return false;
    }
  };

  // ---- Fouls: what kind, who was fouled, then the free throws.

  const openFoul = (teamId: number, playerId: number | null) => {
    setIsRunning(false); // a whistle stops the clock
    setFollowUp(null);
    setFoulDialog({ teamId, playerId });
  };

  const recordFoul = async (choice: FoulChoice) => {
    const f = foulDialog;
    if (!f) return;
    setFoulDialog(null);
    const who = { teamId: f.teamId, playerId: f.playerId };
    const victim = otherTeamId(f.teamId);
    const fouled = (fts: number, recordFd: boolean, noRebound: boolean): FollowUp => ({ kind: 'fouled', teamId: victim, fts, recordFd, noRebound });
    switch (choice) {
      case 'personal':
        // In the penalty, even a non-shooting foul is two shots.
        await handleStat('pf' as StatEventType, 0, who, { next: fouled(inPenalty(f.teamId) ? 2 : 0, true, false) });
        break;
      case 'shooting2': case 'shooting3': case 'and1':
        await handleStat('pf' as StatEventType, 0, { ...who, qualifiers: ['shooting'] },
          { next: fouled(choice === 'shooting3' ? 3 : choice === 'and1' ? 1 : 2, true, false) });
        break;
      case 'offensive':
        // No free throws; the ball goes the other way.
        if (await handleStat('pf' as StatEventType, 0, { ...who, qualifiers: ['offensive'] }, { next: null })) {
          await handleStat('tov' as StatEventType, 0, { ...who, qualifiers: ['offensive_foul'] }, { next: null });
        }
        break;
      case 'technical':
        await handleStat('tf' as StatEventType, 0, who, { next: fouled(1, false, true) });
        break;
      case 'unsportsmanlike': case 'disqualifying':
        await handleStat('flagrant' as StatEventType, 0, { ...who, qualifiers: [choice] }, { next: fouled(2, true, true) });
        break;
      case 'coach': case 'bench':
        await handleStat('tf' as StatEventType, 0, { teamId: f.teamId, playerId: null, qualifiers: [choice] }, { next: fouled(1, false, true) });
        break;
    }
  };

  const handleFreeThrow = async (made: boolean) => {
    const s = ftSeq;
    if (!s || !s.total) return;
    const last = s.index >= s.total;
    // Only the last shot is live: a miss needs a rebound (not after a
    // technical or unsportsmanlike, where the shooting team keeps the ball).
    const next: FollowUp | null = last && !made && !s.noRebound && loadSettings().followUpPrompts
      ? { kind: 'rebound', teamId: s.teamId, shooterId: s.playerId } : null;
    setFtSeq(last ? null : { ...s, index: s.index + 1 });
    await handleStat((made ? 'ftm' : 'fta') as StatEventType, made ? 1 : 0,
      { teamId: s.teamId, playerId: s.playerId, ftSequenceIndex: s.index, ftSequenceTotal: s.total }, { next });
  };

  const handleTimeout = (teamId: number) => {
    const go = () => { setIsRunning(false); void handleStat('timeout' as StatEventType, 0, { teamId, playerId: null }); };
    if (timeoutsLeft(evAsc, teamId, game.currentPeriod, rules).left > 0) { go(); return; }
    toast.warning(`${abbr(teamId)} have no timeouts left`, { action: { label: 'Record anyway', onClick: go } });
  };

  const recordTurnover = (teamId: number, playerId: number | null, type?: string) => {
    void handleStat('tov' as StatEventType, 0, { teamId, playerId, ...(type ? { qualifiers: [type] } : {}) });
  };
  const handleTeamTurnover = (teamId: number) => {
    if (detail) setTovDialog({ teamId, playerId: null });
    else recordTurnover(teamId, null);
  };

  // Jump ball: the opening tip asks who won it; after that the arrow decides.
  const handleJumpBall = () => {
    setFollowUp(null);
    if (arrowId == null) { setTipDialog(true); return; }
    void handleStat('jump_ball' as StatEventType, 0, { teamId: arrowId, playerId: null }, { next: null });
    toast.info(`Held ball — ${abbr(arrowId)} ball. The arrow now points to ${abbr(otherTeamId(arrowId))}.`);
  };

  const handleStatButtonClick = (eventType: StatEventType | 'reb' | 'ft', value?: number) => {
    if (selectedTeamId == null || selectedPlayerId == null) return;
    if (eventType === 'reb') {
      // A missed shot leaves possession with the shooting team until the
      // rebound, so a board by the team in possession is offensive.
      const possessionTeamId = possessions?.currentPossessionTeamId ?? null;
      handleStat(possessionTeamId != null && possessionTeamId === selectedTeamId ? 'oreb' : 'dreb', value);
      return;
    }
    if (eventType === 'ft') {
      setFollowUp(null);
      setFtSeq({ teamId: selectedTeamId, playerId: selectedPlayerId, total: 0, index: 1, noRebound: false });
      return;
    }
    if (eventType === 'pf') { openFoul(selectedTeamId, selectedPlayerId); return; }
    if (eventType === 'tov' && detail) { setTovDialog({ teamId: selectedTeamId, playerId: selectedPlayerId }); return; }
    if (eventType === 'blk' && followUp?.kind === 'rebound' && followUp.teamId !== selectedTeamId) {
      // A block on the shot that was just missed: keep asking for the rebound.
      handleStat(eventType, value, undefined, { next: { ...followUp, blocked: true } });
      return;
    }
    handleStat(eventType, value);
  };

  // ---- Pro shots: tap the court, then Made / Missed, then (or first) the shooter.

  // Which basket a team attacks (they swap at half-time).
  const homeLeftFirst = (game as unknown as { homeAttacksLeftFirstHalf?: boolean }).homeAttacksLeftFirstHalf ?? false;
  const teamAttacksLeft = (teamId: number | null, period: number = game.currentPeriod) =>
    attacksLeft({ isHome: teamId === homeTeam.id, period, periodCount: game.periodCount, homeAttacksLeftFirstHalf: homeLeftFirst });
  const leftTeam = teamAttacksLeft(homeTeam.id) ? homeTeam : awayTeam;
  const rightTeam = leftTeam.id === homeTeam.id ? awayTeam : homeTeam;
  const fullCourt = game.captureMode !== 'simple' && loadSettings().courtView === 'full';

  const handleSwapEnds = async () => {
    try {
      await updateGame.mutateAsync({ gameId, data: { homeAttacksLeftFirstHalf: !homeLeftFirst } as never });
      setPendingShot(null);
      invalidateData();
    } catch {
      toast.error("Couldn't swap ends");
    }
  };

  // A full-court tap read for a given team: what it's worth and from where.
  const readFullTap = (stored: StoredShot, teamId: number) => {
    const left = teamAttacksLeft(teamId);
    const call = classifyStored(stored, left);
    return { value: call.value, zone: call.zone, label: call.label, metres: distanceMetresStored(stored, left) };
  };

  const recordShot = (shot: PendingShot, made: boolean, who: { teamId: number; playerId: number }) => {
    const left = teamAttacksLeft(who.teamId);
    let value = shot.value;
    let location: Record<string, unknown> = {};
    if (shot.tap?.kind === 'full') {
      const call = classifyStored(shot.tap.stored, left);
      value = call.value;
      location = { ...shot.tap.stored, shotZone: call.zone };
    } else if (shot.tap?.kind === 'half') {
      // The diagram shows one basket; put the shot at the end this team attacks.
      location = { ...halfPointToStored(shot.tap.point, left), shotZone: classifyShot(shot.tap.point).zone };
    }
    const type = `${value}pt${made ? 'm' : 'a'}` as StatEventType;
    void handleStat(type, made ? value : 0, {
      teamId: who.teamId, playerId: who.playerId, ...location,
      ...(shot.tags?.length ? { qualifiers: shot.tags } : {}),
    });
  };

  // A rebound nobody secured (out of bounds, a foul on the rebound, the ball
  // wedged...) goes to a team. Offensive if that team took the shot — or,
  // with no prompt showing, if it's the team still in possession.
  const handleTeamRebound = (teamId: number) => {
    const shootingTeamId = followUp?.kind === 'rebound' ? followUp.teamId : (possessions?.currentPossessionTeamId ?? null);
    void handleStat((teamId === shootingTeamId ? 'oreb' : 'dreb') as StatEventType, 0, { teamId, playerId: null }, { next: null });
  };

  const handleFullCourtTap = (point: FullPoint) => {
    setFollowUp(null);
    const stored = fullToStored(point);
    // The basket tapped says which team shot — unless a player is already
    // picked, in which case it's theirs (a backcourt heave if it's the far end).
    const teamId = selectedTeamId ?? (stored.shotX <= 50 ? leftTeam.id : rightTeam.id);
    setFtSeq(null);
    setPendingShot(prev => ({ tap: { kind: 'full', stored }, teamId, ...readFullTap(stored, teamId), made: prev?.made ?? null, tags: prev?.tags }));
  };

  const handleCourtTap = (point: CourtPoint) => {
    setFollowUp(null);
    const call = classifyShot(point);
    // Re-tapping just moves the spot; keep a result that was already chosen.
    setPendingShot(prev => ({
      tap: { kind: 'half', point }, teamId: null,
      value: call.value, zone: call.zone, label: call.label, metres: distanceMetres(point),
      made: prev?.made ?? null, tags: prev?.tags,
    }));
  };

  const handleShotWithoutLocation = (value: 2 | 3) => {
    setFollowUp(null);
    setPendingShot({ tap: null, teamId: null, value, zone: null, label: 'No location', metres: null, made: null });
  };

  const handleShotResult = (made: boolean) => {
    if (!pendingShot) return;
    if (selectedPlayerId != null && selectedTeamId != null) {
      recordShot(pendingShot, made, { teamId: selectedTeamId, playerId: selectedPlayerId });
    } else {
      setPendingShot({ ...pendingShot, made });
    }
  };

  const handlePlayerTap = (teamId: number, playerId: number) => {
    if (subMode && subMode.teamId === teamId) { handleSubstitute(teamId, playerId); return; }
    if (pendingShot && pendingShot.made != null) {
      // The shot was only waiting for its shooter.
      if (pendingShot.teamId != null && pendingShot.teamId !== teamId) {
        const owner = pendingShot.teamId === homeTeam.id ? homeTeam : awayTeam;
        toast.error(`That's ${owner.abbreviation}'s basket — tap a ${owner.abbreviation} player, or swap ends if they're the wrong way round.`);
        return;
      }
      recordShot(pendingShot, pendingShot.made, { teamId, playerId });
      return;
    }
    if (pendingShot?.tap?.kind === 'full' && pendingShot.teamId !== teamId) {
      // Shooter picked after the tap and they attack the other basket: it's
      // their shot, from the backcourt.
      setPendingShot({ ...pendingShot, teamId, ...readFullTap(pendingShot.tap.stored, teamId) });
    }
    if (followUp && !pendingShot && !ftSeq) {
      const f = followUp;
      if (f.kind === 'rebound') {
        // Same team as the shooter = offensive board, otherwise defensive.
        void handleStat((teamId === f.teamId ? 'oreb' : 'dreb') as StatEventType, 0, { teamId, playerId }, { next: null });
        return;
      }
      if (f.kind === 'assist' && teamId === f.teamId && playerId !== f.shooterId) {
        void handleStat('ast' as StatEventType, 0, { teamId, playerId }, { next: null });
        return;
      }
      if (f.kind === 'block' && teamId === f.teamId) {
        void handleStat('blk' as StatEventType, 0, { teamId, playerId },
          { next: { kind: 'rebound', teamId: f.shotTeamId, shooterId: f.shooterId, blocked: true } });
        return;
      }
      if (f.kind === 'steal' && teamId === f.teamId) {
        void handleStat('stl' as StatEventType, 0, { teamId, playerId }, { next: null });
        return;
      }
      if (f.kind === 'turnover' && teamId === f.teamId) {
        void handleStat('tov' as StatEventType, 0, { teamId, playerId }, { next: null });
        return;
      }
      if (f.kind === 'fouled' && teamId === f.teamId) {
        void (async () => {
          if (f.recordFd) await handleStat('fd' as StatEventType, 0, { teamId, playerId }, { next: null });
          else setFollowUp(null);
          if (f.fts > 0) setFtSeq({ teamId, playerId, total: f.fts, index: 1, noRebound: f.noRebound });
        })();
        return;
      }
      // Anyone else is the scorer moving on: drop the prompt and select the
      // player as usual.
      setFollowUp(null);
    }
    setSelectedPlayerId(playerId);
    setSelectedTeamId(teamId);
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
    setFollowUp(null);
    setFtSeq(null);
    const lastEvent = statEvents?.[0];
    if (!lastEvent) return;
    try {
      await deleteStat.mutateAsync({ statEventId: lastEvent.id });
      invalidateData();
    } catch {
      toast.error("Failed to undo");
    }
  };

  undoRef.current = () => { void handleUndo(); };

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
      const nextDurationSec = (isLastRegPeriod ? rules.overtimeDurationMins : game.periodDurationMins) * 60;

      // Regulation (or an overtime) is over and someone is ahead: that's the
      // game. Don't roll on into an overtime nobody is going to play.
      if (isLastRegPeriod && (boxScore?.home.totalPoints ?? 0) !== (boxScore?.away.totalPoints ?? 0)) {
        await updateClock.mutateAsync({ gameId, data: { currentPeriod: game.currentPeriod, clockSeconds: 0 } });
        setLocalClock(0);
        setSelectedPlayerId(null);
        setSelectedTeamId(null);
        setPendingShot(null);
        setFollowUp(null);
        setFtSeq(null);
        invalidateData();
        setPlaysOpen(false);
        setFinalizeDialogOpen(true);
        return;
      }

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
      setPendingShot(null);
      invalidateData();

      setFollowUp(null);
      setFtSeq(null);
      const label = periodLabel(nextPeriod);
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
      shotZone: (ev as unknown as ShotEvent).shotZone ?? null,
      shotX: (ev as unknown as ShotEvent).shotX ?? null,
      shotY: (ev as unknown as ShotEvent).shotY ?? null,
      period: ev.period,
      clock: formatClock(ev.clockSeconds),
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
    const clockSeconds = parseClock(editForm.clock);
    if (clockSeconds == null) { toast.error("Enter the clock as minutes:seconds, e.g. 7:42"); return; }
    const original = statEvents?.find(e => e.id === editPbp.statEventId);
    try {
      await updateStat.mutateAsync({
        statEventId: editPbp.statEventId,
        data: {
          eventType: editForm.eventType,
          // Only send the time when it was actually changed.
          ...(original && (original.period !== editForm.period || original.clockSeconds !== clockSeconds)
            ? ({ period: editForm.period, clockSeconds } as object) : {}),
          teamId: isStructural ? null : editForm.teamId,
          playerId: isStructural ? null : editForm.playerId,
          // Keep the points in step with the (possibly changed) event type.
          ...(editForm.eventType === '2ptm' ? { value: 2 } : editForm.eventType === '3ptm' ? { value: 3 }
            : editForm.eventType === 'ftm' ? { value: 1 }
            : ['2pta', '3pta', 'fta'].includes(editForm.eventType) ? { value: 0 } : {}),
          ...({
            shotZone: isFgShot ? editForm.shotZone : null,
            shotX: isFgShot ? editForm.shotX : null,
            shotY: isFgShot ? editForm.shotY : null,
          } as object),
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

  const periodLabel = (period: number) => gamePeriodLabel(period, game.periodCount);

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

  // The grid. Free throws and fouls open their own short flows.
  const proButtons = [
    { type: 'ft', label: 'FREE THROWS', color: 'bg-green-700 hover:bg-green-800' },
    { type: 'oreb', label: 'O REB', color: 'bg-blue-600 hover:bg-blue-700' },
    { type: 'dreb', label: 'D REB', color: 'bg-indigo-600 hover:bg-indigo-700' },
    { type: 'ast', label: 'ASSIST', color: 'bg-sky-600 hover:bg-sky-700' },
    { type: 'tov', label: 'TURNOVER', color: 'bg-orange-600 hover:bg-orange-700' },
    { type: 'stl', label: 'STEAL', color: 'bg-cyan-600 hover:bg-cyan-700' },
    { type: 'blk', label: 'BLOCK', color: 'bg-teal-600 hover:bg-teal-700' },
    { type: 'pf', label: 'FOUL', color: 'bg-purple-600 hover:bg-purple-700' },
    { type: 'fd', label: 'FOUL DRAWN', color: 'bg-amber-600 hover:bg-amber-700' },
  ];

  const simpleStats = [
    { type: '2ptm', label: '2PT MAKE', color: 'bg-green-600 hover:bg-green-700', val: 2 },
    { type: '2pta', label: '2PT MISS', color: 'bg-red-600 hover:bg-red-700' },
    { type: '3ptm', label: '3PT MAKE', color: 'bg-green-600 hover:bg-green-700', val: 3 },
    { type: '3pta', label: '3PT MISS', color: 'bg-red-600 hover:bg-red-700' },
    { type: 'ft', label: 'FREE THROWS', color: 'bg-green-700 hover:bg-green-800' },
    { type: 'reb', label: 'REBOUND', color: 'bg-blue-600 hover:bg-blue-700' },
    { type: 'ast', label: 'ASSIST', color: 'bg-sky-600 hover:bg-sky-700' },
    { type: 'tov', label: 'TURNOVER', color: 'bg-orange-600 hover:bg-orange-700' },
    { type: 'stl', label: 'STEAL', color: 'bg-cyan-600 hover:bg-cyan-700' },
    { type: 'blk', label: 'BLOCK', color: 'bg-teal-600 hover:bg-teal-700' },
    { type: 'pf', label: 'FOUL', color: 'bg-purple-600 hover:bg-purple-700' },
    { type: 'fd', label: 'FOUL DRAWN', color: 'bg-amber-600 hover:bg-amber-700' },
  ] as { type: string; label: string; color: string; val?: number }[];

  const isLite = activeMode === 'simple';
  // In Pro, field goals are recorded by tapping the court, so the grid only
  // carries everything else.
  const statButtons: { type: string; label: string; color: string; val?: number }[] = isLite ? simpleStats : proButtons;

  // Shots already recorded, for the court. The newest few are drawn brighter.
  const locatedShots = ((statEvents ?? []) as unknown as ShotEvent[])
    .filter(e => FG_SHOT_TYPES.has(e.eventType as StatEventType) && e.shotX != null && e.shotY != null)
    .map((e, i) => {
      const team = e.teamId === homeTeam.id ? homeTeam : awayTeam;
      return {
        id: e.id,
        stored: { shotX: e.shotX!, shotY: e.shotY! },
        left: teamAttacksLeft(team.id, e.period),
        made: e.eventType.endsWith('m'),
        color: teamTextColor(team.colorPrimary, appSurface()),
        recent: i < 6, // statEvents is newest-first
      };
    });
  const fullShots: FullCourtShot[] = locatedShots.map(s => ({ id: s.id, ...storedToFull(s.stored.shotX, s.stored.shotY), made: s.made, color: s.color, recent: s.recent }));
  const courtShots: CourtShot[] = locatedShots.map(s => ({ id: s.id, ...halfPointFor(s.stored, s.left), made: s.made, color: s.color, recent: s.recent }));
  const endOf = (t: typeof homeTeam) => ({ label: t.abbreviation, color: teamTextColor(t.colorPrimary, appSurface()) });

  const shootingTeam = selectedTeamId === homeTeam.id ? homeTeam : selectedTeamId === awayTeam.id ? awayTeam : null;

  // The prompt strip: a free-throw trip, or the question that follows the
  // last play. Answered by tapping a player or a button, or dismissed.
  const bar = (tone: 'sky' | 'green', testId: string, kind: string, text: React.ReactNode, actions: React.ReactNode) => (
    <div className={`h-full flex items-center justify-between gap-2 rounded-[10px] border px-3 ${tone === 'green' ? 'border-green-500/40 bg-green-500/10' : 'border-sky-500/40 bg-sky-500/10'}`} data-testid={testId} data-kind={kind}>
      <span className={`text-sm font-semibold leading-tight min-w-0 ${tone === 'green' ? 'text-green-400' : 'text-sky-400'}`}>{text}</span>
      <span className="flex items-center gap-1 shrink-0">{actions}</span>
    </div>
  );
  const dim = (s: string) => <span className="font-normal opacity-80">{s}</span>;
  const skip = (label: string) => (
    <Button variant="ghost" size="sm" className="px-2" onClick={() => setFollowUp(null)} data-testid="follow-up-skip">{label}</Button>
  );
  let followUpBar: React.ReactNode = null;
  if (pendingShot) followUpBar = null;
  else if (ftSeq) {
    followUpBar = ftSeq.total === 0
      ? bar('green', 'ft-bar', 'count', <>Free throws for {playerName(ftSeq.playerId)} {dim('— how many?')}</>, <>
          {[1, 2, 3].map(n => (
            <Button key={n} size="sm" variant="outline" className="px-3 font-bold" onClick={() => setFtSeq({ ...ftSeq, total: n })} data-testid={`ft-count-${n}`}>{n}</Button>
          ))}
          <Button variant="ghost" size="sm" className="px-2" onClick={() => setFtSeq(null)} title="Cancel"><X className="w-4 h-4" /></Button>
        </>)
      : bar('green', 'ft-bar', 'shot', <>FT {ftSeq.index} of {ftSeq.total} {dim(`· ${playerName(ftSeq.playerId)}`)}</>, <>
          <Button size="sm" className="px-3 font-bold bg-green-600 hover:bg-green-700 text-white" disabled={recordStat.isPending} onClick={() => handleFreeThrow(true)} data-testid="ft-made">MADE</Button>
          <Button size="sm" className="px-3 font-bold bg-red-600 hover:bg-red-700 text-white" disabled={recordStat.isPending} onClick={() => handleFreeThrow(false)} data-testid="ft-missed">MISSED</Button>
          <Button variant="ghost" size="sm" className="px-2" onClick={() => setFtSeq(null)} title="Stop this trip to the line"><X className="w-4 h-4" /></Button>
        </>);
  } else if (followUp) {
    const f = followUp;
    const who = abbr(f.teamId);
    if (f.kind === 'assist') followUpBar = bar('sky', 'follow-up', f.kind, <>Assist? {dim(`Tap the ${who} passer`)}</>, skip('No assist'));
    else if (f.kind === 'rebound') followUpBar = bar('sky', 'follow-up', f.kind, <>Rebound? {dim('Tap who got it')}</>, <>
        {!f.blocked && (
          <Button variant="outline" size="sm" className="px-2" data-testid="follow-up-blocked" title="The shot was blocked — say who by"
            onClick={() => setFollowUp({ kind: 'block', teamId: otherTeamId(f.teamId), shotTeamId: f.teamId, shooterId: f.shooterId })}>
            Blocked
          </Button>
        )}
        {[awayTeam, homeTeam].map(t => (
          <Button key={t.id} variant="outline" size="sm" className="px-2" onClick={() => handleTeamRebound(t.id)}
            title={`Nobody secured it — credit ${t.name} with a team rebound`} data-testid={`team-rebound-${t.isHome ? 'home' : 'away'}`}>
            {t.abbreviation} team
          </Button>
        ))}
        {skip('None')}
      </>);
    else if (f.kind === 'block') followUpBar = bar('sky', 'follow-up', f.kind, <>Blocked by? {dim(`Tap the ${who} player`)}</>,
      <Button variant="ghost" size="sm" className="px-2" onClick={() => setFollowUp({ kind: 'rebound', teamId: f.shotTeamId, shooterId: f.shooterId, blocked: true })}>Back</Button>);
    else if (f.kind === 'steal') followUpBar = bar('sky', 'follow-up', f.kind, <>Steal? {dim(`Tap the ${who} player who took it`)}</>, skip('No steal'));
    else if (f.kind === 'turnover') followUpBar = bar('sky', 'follow-up', f.kind, <>Turnover by? {dim(`Tap the ${who} player who lost it`)}</>, <>
        <Button variant="outline" size="sm" className="px-2" onClick={() => void handleStat('tov' as StatEventType, 0, { teamId: f.teamId, playerId: null }, { next: null })}>{who} team</Button>
        {skip('Skip')}
      </>);
    else if (f.kind === 'fouled') followUpBar = bar('sky', 'follow-up', f.kind,
      f.fts > 0
        ? <>{f.fts} free throw{f.fts === 1 ? '' : 's'} {dim(`— tap the ${who} shooter`)}</>
        : <>Who was fouled? {dim(`Tap the ${who} player`)}</>,
      skip(f.fts > 0 ? 'No shots' : 'Skip'));
  }

  // Which team's on-court players are being asked for right now.
  const awaiting = (teamId: number) => {
    if (pendingShot) return !isLite && pendingShot.made != null && (pendingShot.teamId == null || pendingShot.teamId === teamId);
    if (ftSeq || !followUp) return false;
    return followUp.kind === 'rebound' || followUp.teamId === teamId;
  };
  const panelProps = (team: typeof homeTeam) => ({
    awaitingShooter: awaiting(team.id),
    onTimeout: () => handleTimeout(team.id),
    onBenchTech: () => openFoul(team.id, null),
    onTeamRebound: () => handleTeamRebound(team.id),
    onTeamTurnover: () => handleTeamTurnover(team.id),
    fouls: foulsByPlayer,
    foulLimit: rules.foulLimit,
    timeouts: timeoutsLeft(evAsc, team.id, game.currentPeriod, rules).left,
  });

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
          <TeamFoulBadge count={teamFoulCount(awayTeam.id)} penalty={inPenalty(awayTeam.id)} side="away" />
          {possessions?.currentPossessionTeamId === awayTeam.id && <ArrowLeft className="w-5 h-5 text-muted-foreground" />}
        </div>
        
        <div className="flex-1 flex justify-center items-center gap-6">
          <div className="text-center font-mono font-bold">
            <div className="text-xs text-muted-foreground">PERIOD</div>
            <div className="text-xl leading-none text-foreground" data-testid="period-label">{periodLabel(game.currentPeriod)}</div>
          </div>
          {arrowId != null && (
            <div className="text-center font-mono font-bold hidden md:block" title="Alternating possession: who gets the ball at the next held ball or period start" data-testid="possession-arrow">
              <div className="text-xs text-muted-foreground">ARROW</div>
              <div className="text-sm leading-none" style={{ color: teamTextColor((arrowId === homeTeam.id ? homeTeam : awayTeam).colorPrimary, appSurface()) }}>
                {arrowId === awayTeam.id ? '◀ ' : ''}{abbr(arrowId)}{arrowId === homeTeam.id ? ' ▶' : ''}
              </div>
            </div>
          )}
          
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
          <TeamFoulBadge count={teamFoulCount(homeTeam.id)} penalty={inPenalty(homeTeam.id)} side="home" />
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
          
          {/* Full-court Pro: the latest plays in a slim strip; the full list slides in */}
          {fullCourt && (
            <div className="h-10 shrink-0 flex items-center gap-2 rounded-xl border border-border bg-card pl-1.5 pr-1.5" data-testid="plays-strip">
              <Button size="sm" variant="ghost" className="h-7 px-2 gap-1.5" onClick={handleUndo} disabled={!statEvents?.length}>
                <Undo2 className="w-4 h-4" /> Undo
              </Button>
              <button type="button" className="flex-1 min-w-0 flex items-center gap-3 text-left text-sm" onClick={() => setPlaysOpen(true)} title="Open the play-by-play">
                {pbp?.[0] ? (
                  <>
                    <span className="truncate text-foreground">{pbp[0].eventText}</span>
                    {pbp[1] && <span className="hidden lg:block truncate text-muted-foreground/70 text-xs">{pbp[1].eventText}</span>}
                  </>
                ) : (
                  <span className="text-muted-foreground">No plays yet</span>
                )}
              </button>
              {/* Game flow lives up here in full-court Pro, so the court gets the height */}
              <div className="flex items-center gap-1 shrink-0">
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] font-bold" onClick={handleJumpBall}>JUMP BALL</Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] font-bold" onClick={handleEndPeriod}>END PERIOD</Button>
                <Button size="sm" variant="outline" className="h-7 px-2 text-[11px] font-bold" onClick={handleStartPeriod}>START PERIOD</Button>
              </div>
              <Button size="sm" variant="outline" className="h-7 px-2.5 gap-1.5" onClick={() => setPlaysOpen(true)} data-testid="open-plays">
                <ListOrdered className="w-4 h-4" /> Plays
                {(pbp?.length ?? 0) > 0 && <span className="sa-num text-muted-foreground">{pbp!.length}</span>}
              </Button>
            </div>
          )}

          {/* Team Panels + Court */}
          <div className={`flex-1 grid grid-rows-1 gap-3 xl:gap-4 min-h-0 ${
            isLite ? 'grid-cols-2'
            : fullCourt ? 'grid-cols-[minmax(150px,168px)_minmax(0,1fr)_minmax(150px,168px)] xl:grid-cols-[200px_minmax(0,1fr)_200px]'
            : 'grid-cols-[minmax(150px,0.75fr)_minmax(0,1.9fr)_minmax(150px,0.75fr)] xl:grid-cols-[minmax(190px,0.7fr)_minmax(0,1.8fr)_minmax(190px,0.7fr)]'
          }`}>
            {[awayTeam].map(team => (
              <TeamPanel
                key={team.id}
                team={team}
                onCourt={awayOnCourt}
                bench={awayBench}
                selectedPlayerId={selectedPlayerId}
                onSelectPlayer={(id) => handlePlayerTap(team.id, id)}
                {...panelProps(team)}
                subModeBenchPlayerId={subMode && subMode.teamId === team.id ? subMode.benchPlayerId : null}
                onSelectBenchPlayer={(id) => handleBenchPlayerClick(team.id, id)}
                benchBeside={isLite}
              />
            ))}

            {/* Shot court (Pro only) — tap where the shot was taken */}
            {!isLite && (
            <div className="flex flex-col bg-card rounded-xl border border-border shadow-sm p-3 min-h-0" data-testid="shot-panel">
              <div className="flex items-center justify-between gap-2 mb-2 shrink-0 min-h-[24px]">
                {pendingShot ? (
                  <div className="flex items-baseline gap-2 min-w-0">
                    <span className="sa-display font-bold text-xl leading-none text-primary">{pendingShot.value}PT</span>
                    <span className="text-xs font-semibold text-foreground truncate">
                      {pendingShot.teamId != null && `${pendingShot.teamId === homeTeam.id ? homeTeam.abbreviation : awayTeam.abbreviation} · `}{pendingShot.label}
                    </span>
                    {pendingShot.metres != null && (
                      <span className="text-[11px] text-muted-foreground tabular-nums">{pendingShot.metres}m</span>
                    )}
                  </div>
                ) : (
                  <span className="sa-eyebrow-muted whitespace-nowrap">Tap the court to record a shot</span>
                )}
                {detail && pendingShot && (
                  <div className="flex items-center gap-1 shrink-0" data-testid="shot-tags">
                    {([['layup', 'Layup'], ['dunk', 'Dunk'], ['fastbreak', 'Fast break']] as const).map(([tag, label]) => {
                      const on = pendingShot.tags?.includes(tag) ?? false;
                      return (
                        <button key={tag} type="button"
                          className={`h-6 px-2 rounded-md border text-[11px] font-semibold ${on ? 'border-primary bg-primary/15 text-primary' : 'border-border text-muted-foreground hover:bg-accent'}`}
                          onClick={() => {
                            // Layup and dunk are alternatives; fast break is on top of either.
                            const rest = (pendingShot.tags ?? []).filter(x => x !== tag && !(tag !== 'fastbreak' && x !== 'fastbreak'));
                            setPendingShot({ ...pendingShot, tags: on ? rest : [...rest, tag] });
                          }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                )}
                {fullCourt && !(detail && pendingShot) && (
                  <Button variant="ghost" size="sm" className="h-6 px-2 gap-1 text-[11px] text-muted-foreground shrink-0" onClick={handleSwapEnds}
                    disabled={updateGame.isPending} title="The teams are shown attacking the wrong baskets" data-testid="swap-ends">
                    <ArrowLeftRight className="w-3.5 h-3.5" /> Swap ends
                  </Button>
                )}
              </div>

              {fullCourt ? (
                <FullCourt
                  shots={fullShots}
                  pending={pendingShot?.tap?.kind === 'full' ? storedToFull(pendingShot.tap.stored.shotX, pendingShot.tap.stored.shotY) : null}
                  left={endOf(leftTeam)}
                  right={endOf(rightTeam)}
                  onTap={handleFullCourtTap}
                  className="flex-1"
                />
              ) : (
                <ShotCourt
                  shots={courtShots}
                  pending={pendingShot?.tap?.kind === 'half' ? pendingShot.tap.point : null}
                  accentColor={shootingTeam ? teamTextColor(shootingTeam.colorPrimary, appSurface()) : '#f97316'}
                  onTap={handleCourtTap}
                  className="flex-1"
                />
              )}

              {/* Made / Missed — appears once a spot (or a no-location shot) is chosen */}
              <div className="mt-2 shrink-0 h-14">
                {pendingShot ? (
                  pendingShot.made == null ? (
                    <div className="grid grid-cols-[1fr_1fr_auto] gap-2 h-full">
                      <button type="button" onClick={() => handleShotResult(true)} data-testid="shot-made"
                        className="rounded-[10px] bg-green-600 hover:bg-green-700 text-white sa-display font-bold text-2xl shadow-md active:scale-95 transition-all">
                        MADE
                      </button>
                      <button type="button" onClick={() => handleShotResult(false)} data-testid="shot-missed"
                        className="rounded-[10px] bg-red-600 hover:bg-red-700 text-white sa-display font-bold text-2xl shadow-md active:scale-95 transition-all">
                        MISSED
                      </button>
                      <Button variant="outline" className="h-full px-3" onClick={() => setPendingShot(null)} title="Cancel this shot">
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="h-full flex items-center justify-between gap-2 rounded-[10px] border border-amber-500/40 bg-amber-500/10 px-3" data-testid="shot-needs-shooter">
                      <span className="text-sm font-semibold text-amber-500">
                        {pendingShot.value}PT {pendingShot.made ? 'made' : 'missed'} — now tap the{' '}
                        {pendingShot.teamId != null ? `${pendingShot.teamId === homeTeam.id ? homeTeam.abbreviation : awayTeam.abbreviation} shooter` : 'shooter'}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => setPendingShot(null)}>Cancel</Button>
                    </div>
                  )
                ) : followUpBar ? followUpBar : (
                  <div className="h-full flex flex-col items-center justify-center gap-1.5 text-xs text-muted-foreground text-center px-2">
                    <span>
                      {selectedPlayerId
                        ? "Tap where the shot was taken — the app works out 2 or 3."
                        : fullCourt
                          ? "Tap the spot: the basket tells the app which team shot."
                          : "Pick the shooter first or after — either order works."}
                    </span>
                    <span className="flex items-center gap-1.5 text-[11px]">
                      Didn't see where?
                      <button type="button" className="px-2 py-0.5 rounded-md border border-border hover:bg-accent font-semibold text-foreground" onClick={() => handleShotWithoutLocation(2)} data-testid="shot-noloc-2">2PT</button>
                      <button type="button" className="px-2 py-0.5 rounded-md border border-border hover:bg-accent font-semibold text-foreground" onClick={() => handleShotWithoutLocation(3)} data-testid="shot-noloc-3">3PT</button>
                    </span>
                  </div>
                )}
              </div>
            </div>
            )}

            {[homeTeam].map(team => (
              <TeamPanel
                key={team.id}
                team={team}
                onCourt={homeOnCourt}
                bench={homeBench}
                selectedPlayerId={selectedPlayerId}
                onSelectPlayer={(id) => handlePlayerTap(team.id, id)}
                {...panelProps(team)}
                subModeBenchPlayerId={subMode && subMode.teamId === team.id ? subMode.benchPlayerId : null}
                onSelectBenchPlayer={(id) => handleBenchPlayerClick(team.id, id)}
                benchBeside={isLite}
              />
            ))}
          </div>

          {/* Lite has no court panel, so its prompt sits above the buttons */}
          {isLite && followUpBar && <div className="h-12 shrink-0">{followUpBar}</div>}

          {/* Stat Buttons Matrix */}
          <div className={`${isLite ? 'h-72 xl:h-80' : fullCourt ? 'h-36 xl:h-40' : 'h-52 xl:h-56'} bg-card rounded-xl border border-border shadow-sm p-4 flex flex-col gap-4 shrink-0`}>
            <div className={`grid gap-2 flex-1 ${isLite ? 'grid-cols-6 xl:gap-3' : 'grid-cols-6'}`}>
              {statButtons.map(btn => {
                const isDisabled = !selectedPlayerId;
                return (
                  <button
                    key={btn.type}
                    disabled={isDisabled}
                    onClick={() => handleStatButtonClick(btn.type as StatEventType | 'reb' | 'ft', btn.val)}
                    className={`rounded-[10px] sa-display font-bold leading-none ${isLite ? 'text-2xl xl:text-3xl' : 'text-xl xl:text-2xl'} text-white transition-all
                      ${btn.color} 
                      ${isDisabled ? 'opacity-20 cursor-not-allowed grayscale' : 'shadow-md active:scale-95'}
                    `}
                  >
                    {btn.label}
                  </button>
                );
              })}
            </div>
            {!fullCourt && <div className="flex gap-2 h-12">
              <Button 
                variant="outline" 
                className="flex-1 bg-card hover:bg-accent border-[hsl(var(--border-strong))] text-foreground font-bold"
                onClick={handleJumpBall}
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
            </div>}
          </div>

        </div>

        {/* Play-by-play: a fixed column, or a slide-in panel when the full court needs the width */}
        {fullCourt && playsOpen && (
          <button type="button" aria-label="Close the play-by-play" className="fixed inset-0 z-30 bg-black/50" onClick={() => setPlaysOpen(false)} />
        )}
        <div
          className={fullCourt
            ? `fixed inset-y-0 right-0 z-40 w-[22rem] max-w-[92vw] bg-card border-l border-border flex flex-col shadow-2xl transition-transform duration-200 ${playsOpen ? 'translate-x-0' : 'translate-x-full'}`
            : "w-64 xl:w-80 bg-card border-l border-border flex flex-col shrink-0"}
          aria-hidden={fullCourt && !playsOpen}
          data-testid="plays-panel"
        >
          <div className="p-4 border-b border-border flex justify-between items-center bg-secondary/60">
            <h2 className="font-bold text-muted-foreground text-sm tracking-wide">PLAY BY PLAY</h2>
            <div className="flex gap-2">
              {fullCourt && (
                <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setPlaysOpen(false)} title="Close">
                  <X className="w-4 h-4" />
                </Button>
              )}
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
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Period</div>
                    <Select value={String(editForm.period)} onValueChange={(v) => setEditForm({ ...editForm, period: Number(v) })}>
                      <SelectTrigger className="bg-card border-[hsl(var(--border-strong))] text-foreground h-10" data-testid="edit-period"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-card border-[hsl(var(--border-strong))] text-foreground">
                        {Array.from({ length: Math.max(game.currentPeriod, game.periodCount, editForm.period) }, (_, i) => i + 1).map(n => (
                          <SelectItem key={n} value={String(n)}>{periodLabel(n)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Game clock</div>
                    <input value={editForm.clock} onChange={(e) => setEditForm({ ...editForm, clock: e.target.value })}
                      inputMode="numeric" placeholder="7:42" aria-label="Game clock" data-testid="edit-clock"
                      className={`w-full h-10 rounded-md border bg-card px-3 font-mono text-sm ${parseClock(editForm.clock) == null ? 'border-destructive' : 'border-[hsl(var(--border-strong))]'}`} />
                  </div>
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
                      // A location on the wrong side of the arc for the new
                      // type can't be right any more — drop it.
                      const keepLocation = nextShotValue != null && editForm.shotX != null && editForm.shotY != null
                        && classifyStored({ shotX: editForm.shotX, shotY: editForm.shotY }, teamAttacksLeft(editForm.teamId, editPbp.period)).value === nextShotValue;
                      setEditForm(keepLocation
                        ? { ...editForm, eventType: nextType }
                        : { ...editForm, eventType: nextType, shotZone: null, shotX: null, shotY: null });
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
                  // The shot belongs to this team, in the period it was taken.
                  const left = teamAttacksLeft(editForm.teamId, editPbp.period);
                  const stored = editForm.shotX != null && editForm.shotY != null ? { shotX: editForm.shotX, shotY: editForm.shotY } : null;
                  const made = editForm.eventType.endsWith('m');
                  // Moving a shot across the arc changes what it's worth.
                  const moveTo = (next: StoredShot) => {
                    const call = classifyStored(next, left);
                    setEditForm({ ...editForm, eventType: `${call.value}pt${made ? 'm' : 'a'}` as StatEventType, shotZone: call.zone, ...next });
                  };
                  const editLeft = left ? (editForm.teamId === homeTeam.id ? homeTeam : awayTeam) : (editForm.teamId === homeTeam.id ? awayTeam : homeTeam);
                  const editRight = editLeft.id === homeTeam.id ? awayTeam : homeTeam;
                  return (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                          Shot location
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {stored ? (
                            <>
                              {classifyStored(stored, left).label}
                              <button type="button" className="ml-2 underline underline-offset-2 hover:text-foreground"
                                onClick={() => setEditForm({ ...editForm, shotZone: null, shotX: null, shotY: null })}>
                                Clear
                              </button>
                            </>
                          ) : 'None — tap the court to add one'}
                        </div>
                      </div>
                      {fullCourt ? (
                        <FullCourt
                          className="h-52"
                          left={endOf(editLeft)}
                          right={endOf(editRight)}
                          pending={stored ? storedToFull(stored.shotX, stored.shotY) : null}
                          onTap={(point) => moveTo(fullToStored(point))}
                        />
                      ) : (
                        <ShotCourt
                          className="h-56"
                          pending={stored ? halfPointFor(stored, left) : null}
                          onTap={(point) => moveTo(halfPointToStored(point, left))}
                        />
                      )}
                    </div>
                  );
                })()}
              </div>
            );
          })()}
          <DialogFooter className="gap-2 sm:gap-2 mt-4">
            <Button
              variant="outline"
              className="bg-destructive/10 border-destructive/40 text-destructive hover:bg-destructive/20"
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
              className="font-bold"
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

      {/* What kind of foul? One tap records it and sets up what follows. */}
      <Dialog open={!!foulDialog} onOpenChange={(open) => !open && setFoulDialog(null)}>
        <DialogContent className="bg-card text-foreground border-border sm:max-w-[520px]" data-testid="foul-dialog">
          {foulDialog && (() => {
            const team = foulDialog.teamId === homeTeam.id ? homeTeam : awayTeam;
            const penalty = inPenalty(team.id);
            const option = (choice: FoulChoice, label: string, hint: string, tone = 'bg-purple-600 hover:bg-purple-700') => (
              <button key={choice} type="button" onClick={() => void recordFoul(choice)} data-testid={`foul-${choice}`}
                className={`rounded-[10px] ${tone} text-white px-3 py-3 text-left shadow-md active:scale-95 transition-all`}>
                <div className="sa-display font-bold text-xl leading-none">{label}</div>
                <div className="text-[11px] opacity-85 mt-1 leading-tight">{hint}</div>
              </button>
            );
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="text-2xl font-black uppercase tracking-tighter">
                    {foulDialog.playerId != null ? `Foul on ${playerName(foulDialog.playerId)}` : `${team.abbreviation} technical`}
                  </DialogTitle>
                  <DialogDescription className="text-muted-foreground">
                    {foulDialog.playerId != null
                      ? <>{team.abbreviation} team fouls this period: {teamFoulCount(team.id)}{penalty && <span className="text-red-400 font-semibold"> — in the penalty, so any foul is two shots</span>}</>
                      : 'Charged to the bench, not to a player. The other team shoots one free throw.'}
                  </DialogDescription>
                </DialogHeader>
                {foulDialog.playerId != null ? (
                  <div className="space-y-2 mt-2">
                    <div className="grid grid-cols-2 gap-2">
                      {option('personal', 'PERSONAL', penalty ? 'Not shooting — 2 shots (penalty)' : 'Not shooting — no free throws')}
                      {option('offensive', 'OFFENSIVE', 'Also a turnover. No free throws')}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {option('shooting2', 'SHOOTING · 2', 'Missed 2-point attempt', 'bg-purple-700 hover:bg-purple-800')}
                      {option('shooting3', 'SHOOTING · 3', 'Missed 3-point attempt', 'bg-purple-700 hover:bg-purple-800')}
                      {option('and1', 'AND ONE', 'Basket counted — 1 shot', 'bg-purple-700 hover:bg-purple-800')}
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      {option('technical', 'TECHNICAL', '1 shot, any shooter', 'bg-slate-600 hover:bg-slate-700')}
                      {option('unsportsmanlike', 'UNSPORTS.', '2 shots + possession', 'bg-red-700 hover:bg-red-800')}
                      {option('disqualifying', 'DISQUALIFY', 'Ejected. 2 shots + possession', 'bg-red-800 hover:bg-red-900')}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {option('coach', 'COACH', 'Technical on the head coach', 'bg-slate-600 hover:bg-slate-700')}
                    {option('bench', 'BENCH', 'Technical on the bench', 'bg-slate-600 hover:bg-slate-700')}
                  </div>
                )}
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Turnover type (only when "Record turnover and shot types" is on) */}
      <Dialog open={!!tovDialog} onOpenChange={(open) => !open && setTovDialog(null)}>
        <DialogContent className="bg-card text-foreground border-border sm:max-w-[480px]" data-testid="tov-dialog">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter">
              {tovDialog?.playerId != null ? `Turnover — ${playerName(tovDialog.playerId)}` : `${abbr(tovDialog?.teamId ?? null)} team turnover`}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground">What happened?</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-3 gap-2 mt-2">
            {TURNOVER_TYPES.filter(([key]) => key !== 'offensive_foul').map(([key, label]) => (
              <Button key={key} variant="outline" className="h-12 bg-card border-[hsl(var(--border-strong))] text-foreground hover:bg-accent font-semibold"
                data-testid={`tov-${key}`}
                onClick={() => { const d = tovDialog!; setTovDialog(null); recordTurnover(d.teamId, d.playerId, key); }}>
                {label}
              </Button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Opening tip: who came away with it? The other team gets the arrow. */}
      <Dialog open={tipDialog} onOpenChange={setTipDialog}>
        <DialogContent className="bg-card text-foreground border-border sm:max-w-[400px]" data-testid="tip-dialog">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Who won the tip?</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              They start with the ball. The other team gets the possession arrow for the next held ball.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-2">
            {[awayTeam, homeTeam].map(tm => (
              <button key={tm.id} type="button" data-testid={`tip-${tm.isHome ? 'home' : 'away'}`}
                className="h-20 rounded-[10px] border-2 border-border bg-secondary/60 hover:bg-accent sa-display font-bold text-3xl"
                style={{ color: teamTextColor(tm.colorPrimary, appSurface()) }}
                onClick={() => { setTipDialog(false); void handleStat('jump_ball' as StatEventType, 0, { teamId: tm.id, playerId: null }, { next: null }); }}>
                {tm.abbreviation}
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Before the first play: are the teams shown shooting the right way? */}
      <Dialog open={endsOpen} onOpenChange={(open) => { if (!open) { window.localStorage.setItem(endsKey, '1'); setEndsOpen(false); } }}>
        <DialogContent className="bg-card text-foreground border-border sm:max-w-[460px]" data-testid="ends-dialog">
          <DialogHeader>
            <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Which way are they shooting?</DialogTitle>
            <DialogDescription className="text-muted-foreground">
              Looking at the court from where you're sitting. Shot locations depend on this — the teams swap automatically at half-time.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 mt-2 text-center">
            {[{ tm: leftTeam, side: '◀ LEFT basket' }, { tm: rightTeam, side: 'RIGHT basket ▶' }].map(({ tm, side }) => (
              <div key={tm.id} className="rounded-[10px] border border-border bg-secondary/60 py-4">
                <div className="sa-display font-bold text-3xl" style={{ color: teamTextColor(tm.colorPrimary, appSurface()) }}>{tm.abbreviation}</div>
                <div className="text-xs text-muted-foreground mt-1">attack the {side}</div>
              </div>
            ))}
          </div>
          <DialogFooter className="gap-2 sm:gap-2 mt-2">
            <Button variant="outline" className="bg-card border-[hsl(var(--border-strong))] text-foreground hover:bg-accent" onClick={handleSwapEnds} disabled={updateGame.isPending}>
              <ArrowLeftRight className="w-4 h-4 mr-2" /> Swap them
            </Button>
            <Button className="font-bold" data-testid="ends-confirm" onClick={() => { window.localStorage.setItem(endsKey, '1'); setEndsOpen(false); }}>
              That's right
            </Button>
          </DialogFooter>
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
  onBenchTech,
  onTeamRebound,
  onTeamTurnover,
  fouls,
  foulLimit,
  timeouts,
  subModeBenchPlayerId,
  onSelectBenchPlayer,
  benchBeside = false,
  awaitingShooter = false,
}: {
  team: { id: number; abbreviation: string; colorPrimary: string };
  onCourt: { id: number; jerseyNumber: string | number; lastName: string }[];
  bench: { id: number; jerseyNumber: string | number; lastName: string }[];
  selectedPlayerId: number | null;
  onSelectPlayer: (id: number) => void;
  onTimeout: () => void;
  onBenchTech: () => void;
  onTeamRebound: () => void;
  onTeamTurnover: () => void;
  fouls: Map<number, PlayerFouls>;
  foulLimit: number;
  // Timeouts this team has left in the current half / overtime.
  timeouts: number;
  // Non-null when a bench player on this team is armed for a substitution —
  // the value is that bench player's id, and on-court rows become tap
  // targets to complete the swap.
  subModeBenchPlayerId: number | null;
  onSelectBenchPlayer: (id: number) => void;
  // Wide panels (Lite has no court) put the bench beside the on-court five
  // instead of underneath, so it stays visible without scrolling.
  benchBeside?: boolean;
  // A shot's result is in and it only needs its shooter: on-court rows glow.
  awaitingShooter?: boolean;
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
                  : awaitingShooter
                  ? 'border-amber-500/50 bg-amber-500/10 hover:bg-amber-500/20'
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
              <FoulPill fouls={fouls.get(p.id)} limit={foulLimit} />
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
                  <div className={`text-left flex-1 min-w-0 truncate text-sm tracking-tight uppercase ${isArmed ? 'text-amber-700' : 'text-muted-foreground'} ${fouls.get(p.id)?.out ? 'line-through' : ''}`}>
                    {p.lastName}
                  </div>
                  <FoulPill fouls={fouls.get(p.id)} limit={foulLimit} small />
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

      {/* Team Actions — things credited to the team rather than a player */}
      <div className="sticky bottom-0 mt-auto h-[4.5rem] xl:h-20 shrink-0 border-t border-border bg-secondary/60 grid grid-cols-2 grid-rows-2 p-1.5 gap-1.5">
        {([
          { label: <>TIME OUT <span className={`font-mono ${timeouts === 0 ? 'text-red-400' : 'text-muted-foreground'}`}>· {timeouts}</span></>, onClick: onTimeout, title: `${timeouts} left this half`, id: 'team-timeout' },
          { label: 'TEAM REB', onClick: onTeamRebound, title: 'Nobody secured the rebound — credit the team', id: 'team-rebound' },
          { label: 'TEAM TOV', onClick: onTeamTurnover, title: 'A turnover on the team: shot clock, 5 or 8 seconds…', id: 'team-turnover' },
          { label: 'BENCH TECH', onClick: onBenchTech, title: 'Technical foul on the coach or bench', id: 'team-bench-tech' },
        ]).map(b => (
          <Button key={b.id} className="min-w-0 h-full px-1 whitespace-nowrap text-[10px] xl:text-[11px] bg-card hover:bg-accent text-foreground border border-[hsl(var(--border-strong))] font-bold"
            onClick={b.onClick} title={b.title} data-testid={b.id}>
            {b.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

// A player's foul count, turning amber one short of the limit and red when out.
function FoulPill({ fouls, limit, small = false }: { fouls?: PlayerFouls; limit: number; small?: boolean }) {
  if (!fouls || fouls.total === 0) return null;
  const tone = fouls.out ? 'bg-red-600 text-white' : fouls.total >= limit - 1 ? 'bg-amber-500 text-black' : 'bg-foreground/10 text-muted-foreground';
  return (
    <span className={`shrink-0 rounded font-mono font-bold ${small ? 'text-[10px] px-1' : 'text-xs px-1.5 py-0.5'} ${tone}`}
      title={fouls.out === 'ejected' ? 'Ejected' : fouls.out === 'fouls' ? 'Fouled out' : `${fouls.total} foul${fouls.total === 1 ? '' : 's'}`} data-testid="foul-pill">
      {fouls.out ? 'OUT' : `${fouls.total}F`}
    </span>
  );
}

// Team fouls this period, shown beside the score. Red once the team is in
// the penalty (the other team shoots on every further foul).
function TeamFoulBadge({ count, penalty, side }: { count: number; penalty: boolean; side: 'home' | 'away' }) {
  return (
    <div className={`font-mono font-bold leading-tight ${side === 'home' ? 'text-right' : 'text-left'}`} data-testid={`team-fouls-${side}`} title="Team fouls this period">
      <div className="text-[10px] text-muted-foreground">FOULS</div>
      <div className={`text-sm ${penalty ? 'text-red-400' : 'text-foreground'}`}>{count}{penalty && <span className="text-[9px] ml-1 align-middle">PENALTY</span>}</div>
    </div>
  );
}
