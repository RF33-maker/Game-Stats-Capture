// What the table crew tracks alongside the stats, worked out from the event
// list: team fouls and the bonus, player fouls, timeouts left, the
// alternating-possession arrow, minutes and plus/minus. Pure functions, used
// by both the capture screen and the box score.

export type GameEvent = {
  id: number;
  teamId: number | null;
  playerId: number | null;
  period: number;
  clockSeconds: number;
  eventType: string;
  value?: number | null;
  qualifiers?: string[] | null;
  orderKey?: number;
};

export type Rules = {
  periodCount: number;
  periodDurationMins: number;
  overtimeDurationMins: number;
  foulLimit: number;
  bonusAfterTeamFouls: number;
  timeoutsFirstHalf: number;
  timeoutsSecondHalf: number;
  timeoutsOvertime: number;
};

/** A game's rules, with FIBA defaults for anything an older game doesn't carry. */
export function gameRules(game: Partial<Rules> | null | undefined): Rules {
  return {
    periodCount: game?.periodCount ?? 4,
    periodDurationMins: game?.periodDurationMins ?? 10,
    overtimeDurationMins: game?.overtimeDurationMins ?? 5,
    foulLimit: game?.foulLimit ?? 5,
    bonusAfterTeamFouls: game?.bonusAfterTeamFouls ?? 4,
    timeoutsFirstHalf: game?.timeoutsFirstHalf ?? 2,
    timeoutsSecondHalf: game?.timeoutsSecondHalf ?? 3,
    timeoutsOvertime: game?.timeoutsOvertime ?? 1,
  };
}

export function inGameOrder<T extends GameEvent>(events: T[]): T[] {
  return [...events].sort((a, b) => (a.orderKey ?? a.id) - (b.orderKey ?? b.id) || a.id - b.id);
}

export function periodLabel(period: number, periodCount: number): string {
  if (period > periodCount) return `OT${period - periodCount}`;
  return periodCount === 2 ? `H${period}` : `Q${period}`;
}

export function periodSeconds(period: number, rules: Rules): number {
  return (period > rules.periodCount ? rules.overtimeDurationMins : rules.periodDurationMins) * 60;
}

/** Seconds of game time gone when the clock shows `clock` in `period`. */
export function elapsedAt(period: number, clock: number, rules: Rules): number {
  let t = 0;
  for (let p = 1; p < period; p++) t += periodSeconds(p, rules);
  return t + Math.max(0, periodSeconds(period, rules) - clock);
}

const has = (e: GameEvent, q: string) => e.qualifiers?.includes(q) ?? false;

// ---------- Fouls ----------

const FOUL_TYPES = new Set(["pf", "tf", "flagrant"]);

/** Bench and coach technicals are charged to the coach, not the team count. */
export function countsAsTeamFoul(e: GameEvent): boolean {
  return FOUL_TYPES.has(e.eventType) && e.playerId != null;
}

/** Team fouls reset each period; overtime carries on from the last period. */
function foulPeriod(period: number, rules: Rules) {
  return Math.min(period, rules.periodCount);
}

export function teamFouls(events: GameEvent[], teamId: number, period: number, rules: Rules): number {
  const bucket = foulPeriod(period, rules);
  return events.filter(e => e.teamId === teamId && countsAsTeamFoul(e) && foulPeriod(e.period, rules) === bucket).length;
}

export type PlayerFouls = { total: number; technical: number; unsportsmanlike: number; out: "fouls" | "ejected" | null };

export function playerFouls(events: GameEvent[], playerId: number, rules: Rules): PlayerFouls {
  let total = 0, technical = 0, unsportsmanlike = 0, disqualified = false;
  for (const e of events) {
    if (e.playerId !== playerId || !FOUL_TYPES.has(e.eventType)) continue;
    total++;
    if (e.eventType === "tf") technical++;
    if (e.eventType === "flagrant") {
      if (has(e, "disqualifying")) disqualified = true; else unsportsmanlike++;
    }
  }
  // Two technicals, two unsportsmanlikes, or one of each: ejected.
  const ejected = disqualified || technical >= 2 || unsportsmanlike >= 2 || (technical >= 1 && unsportsmanlike >= 1);
  return { total, technical, unsportsmanlike, out: ejected ? "ejected" : total >= rules.foulLimit ? "fouls" : null };
}

// ---------- Timeouts ----------

function timeoutBucket(period: number, rules: Rules): string {
  if (period > rules.periodCount) return `ot${period - rules.periodCount}`;
  return period <= Math.ceil(rules.periodCount / 2) ? "h1" : "h2";
}

export function timeoutsLeft(events: GameEvent[], teamId: number, period: number, rules: Rules): { left: number; allowed: number } {
  const bucket = timeoutBucket(period, rules);
  const allowed = bucket === "h1" ? rules.timeoutsFirstHalf : bucket === "h2" ? rules.timeoutsSecondHalf : rules.timeoutsOvertime;
  const used = events.filter(e => e.eventType === "timeout" && e.teamId === teamId && timeoutBucket(e.period, rules) === bucket).length;
  return { left: Math.max(0, allowed - used), allowed };
}

// ---------- Alternating possession ----------

/**
 * Who gets the ball at the next held ball or period start. Null until the
 * opening tip is recorded. The tip's loser gets the arrow; it flips every
 * time it is used (a later jump ball, or the start of each later period).
 */
export function arrowTeam(eventsInOrder: GameEvent[], homeId: number, awayId: number): number | null {
  const other = (id: number) => (id === homeId ? awayId : homeId);
  let arrow: number | null = null;
  for (const e of eventsInOrder) {
    if (e.eventType === "jump_ball" && e.teamId != null) arrow = other(e.teamId);
    else if (e.eventType === "period_start" && e.period > 1 && arrow != null) arrow = other(arrow);
  }
  return arrow;
}

// ---------- Minutes and plus/minus ----------

const POINTS: Record<string, number> = { "2ptm": 2, "3ptm": 3, ftm: 1 };

/**
 * Seconds played and plus/minus per player. Starters are on from the tip;
 * substitutions move players on and off at the game clock they were recorded.
 */
export function playingTime(
  eventsInOrder: GameEvent[],
  players: { id: number; teamId: number; isStarter: boolean }[],
  rules: Rules,
  now: { period: number; clockSeconds: number },
): Map<number, { seconds: number; plusMinus: number }> {
  const out = new Map(players.map(p => [p.id, { seconds: 0, plusMinus: 0 }]));
  const teamOf = new Map(players.map(p => [p.id, p.teamId]));
  const on = new Set(players.filter(p => p.isStarter).map(p => p.id));
  let last = 0;
  const advance = (t: number) => {
    if (t > last) {
      for (const id of on) out.get(id)!.seconds += t - last;
      last = t;
    }
  };
  for (const e of eventsInOrder) {
    advance(elapsedAt(e.period, e.clockSeconds, rules));
    if (e.playerId != null && out.has(e.playerId)) {
      if (e.eventType === "sub_in") on.add(e.playerId);
      if (e.eventType === "sub_out") on.delete(e.playerId);
    }
    const pts = POINTS[e.eventType];
    if (pts && e.teamId != null) {
      for (const id of on) out.get(id)!.plusMinus += teamOf.get(id) === e.teamId ? pts : -pts;
    }
  }
  advance(elapsedAt(now.period, now.clockSeconds, rules));
  return out;
}

export function formatMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ---------- Wording ----------

export const TURNOVER_TYPES = [
  ["bad_pass", "Bad pass"],
  ["ball_handling", "Ball handling"],
  ["travel", "Travel"],
  ["out_of_bounds", "Out of bounds"],
  ["double_dribble", "Double dribble"],
  ["three_seconds", "3 seconds"],
  ["five_seconds", "5 seconds"],
  ["eight_seconds", "8 seconds"],
  ["shot_clock", "Shot clock"],
  ["backcourt", "Backcourt"],
  ["offensive_foul", "Offensive foul"],
  ["other", "Other"],
] as const;

export const SHOT_TYPES = [
  ["jump", "Jump shot"],
  ["layup", "Layup"],
  ["dunk", "Dunk"],
  ["hook", "Hook"],
  ["tip", "Tip-in"],
] as const;

export function qualifierLabel(q: string): string {
  return TURNOVER_TYPES.find(t => t[0] === q)?.[1].toLowerCase()
    ?? SHOT_TYPES.find(t => t[0] === q)?.[1].toLowerCase()
    ?? q.replace(/_/g, " ");
}
