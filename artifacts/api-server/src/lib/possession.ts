import {
  type Game,
  type Team,
  type Player,
  type StatEventType,
} from "@workspace/db";

export type PossessionEffect = {
  scoreDelta: number;
  possessionEnded: boolean;
  // The team that should hold possession AFTER this event resolves.
  // If null, no change to game.possessionTeamId.
  nextPossessionTeamId: number | null | undefined;
};

/**
 * Compute the possession effect of a stat event.
 *
 * Rules (mirrors the brief in the project plan):
 *  - 2ptm / 3ptm  → possession ends, ball goes to the OTHER team
 *  - tov          → possession ends, ball goes to the OTHER team
 *  - stl          → the stealing team gains the ball; possession ends for the OTHER team
 *  - dreb         → the rebounding team gains the ball; possession ends for the shooting team
 *  - oreb         → same possession continues (no change)
 *  - 2pta / 3pta / 2ptb / 3ptb  → no change (wait for the rebound)
 *  - ftm with ftSequenceIndex == ftSequenceTotal  → possession ends, switch
 *  - ftm intermediate FT  → no change
 *  - fta final FT  → no change (wait for the rebound)
 *  - period_end   → close any open possession (no switch)
 *  - all else (ast, blk, pf, tf, flagrant, sub, timeout, etc.) → no change
 */
export function computePossessionEffect(args: {
  eventType: StatEventType;
  eventTeamId: number | null | undefined;
  ftSequenceIndex?: number | null;
  ftSequenceTotal?: number | null;
  homeTeamId: number;
  awayTeamId: number;
  currentPossessionTeamId: number | null | undefined;
}): PossessionEffect {
  const {
    eventType,
    eventTeamId,
    ftSequenceIndex,
    ftSequenceTotal,
    homeTeamId,
    awayTeamId,
    currentPossessionTeamId,
  } = args;

  const otherTeam = (id: number | null | undefined): number | null => {
    if (id == null) return null;
    if (id === homeTeamId) return awayTeamId;
    if (id === awayTeamId) return homeTeamId;
    return null;
  };

  switch (eventType) {
    case "2ptm":
      return {
        scoreDelta: 2,
        possessionEnded: true,
        nextPossessionTeamId: otherTeam(eventTeamId),
      };
    case "3ptm":
      return {
        scoreDelta: 3,
        possessionEnded: true,
        nextPossessionTeamId: otherTeam(eventTeamId),
      };
    case "ftm": {
      const isFinal =
        ftSequenceIndex != null &&
        ftSequenceTotal != null &&
        ftSequenceIndex >= ftSequenceTotal;
      // If we don't know the sequence, assume it's a stand-alone (final) FT.
      const treatAsFinal =
        ftSequenceIndex == null || ftSequenceTotal == null || isFinal;
      return {
        scoreDelta: 1,
        possessionEnded: treatAsFinal,
        nextPossessionTeamId: treatAsFinal ? otherTeam(eventTeamId) : undefined,
      };
    }
    case "tov":
      return {
        scoreDelta: 0,
        possessionEnded: true,
        nextPossessionTeamId: otherTeam(eventTeamId),
      };
    case "stl":
      // The team recorded on a steal is the team that GAINED the ball.
      return {
        scoreDelta: 0,
        possessionEnded: true,
        nextPossessionTeamId: eventTeamId ?? null,
      };
    case "dreb":
      // The team recorded on a defensive rebound is the team that GAINED the ball.
      return {
        scoreDelta: 0,
        possessionEnded: true,
        nextPossessionTeamId: eventTeamId ?? null,
      };
    case "oreb":
      // Same possession continues.
      return {
        scoreDelta: 0,
        possessionEnded: false,
        nextPossessionTeamId: eventTeamId ?? currentPossessionTeamId ?? null,
      };
    case "period_end":
      return {
        scoreDelta: 0,
        possessionEnded: currentPossessionTeamId != null,
        nextPossessionTeamId: null,
      };
    default:
      return {
        scoreDelta: 0,
        possessionEnded: false,
        nextPossessionTeamId: undefined,
      };
  }
}

const EVENT_LABELS: Record<string, string> = {
  "2ptm": "made 2-pt FG",
  "2pta": "missed 2-pt FG",
  "2ptb": "had 2-pt FG blocked",
  "3ptm": "made 3-pt FG",
  "3pta": "missed 3-pt FG",
  "3ptb": "had 3-pt FG blocked",
  ftm: "made free throw",
  fta: "missed free throw",
  oreb: "offensive rebound",
  dreb: "defensive rebound",
  ast: "assist",
  stl: "steal",
  tov: "turnover",
  blk: "block",
  pf: "personal foul",
  tf: "technical foul",
  flagrant: "flagrant foul",
  sub_in: "substituted in",
  sub_out: "substituted out",
  timeout: "timeout",
  period_start: "period start",
  period_end: "period end",
  jump_ball: "jump ball",
};

export function describeEvent(args: {
  eventType: StatEventType;
  team: Team | null;
  player: Player | null;
  period: number;
  clockSeconds: number;
  ftSequenceIndex?: number | null;
  ftSequenceTotal?: number | null;
}): string {
  const {
    eventType,
    team,
    player,
    period,
    clockSeconds,
    ftSequenceIndex,
    ftSequenceTotal,
  } = args;

  const mins = Math.floor(clockSeconds / 60);
  const secs = clockSeconds % 60;
  const clock = `${mins}:${secs.toString().padStart(2, "0")}`;
  const periodLabel = period <= 4 ? `Q${period}` : `OT${period - 4}`;

  const subject = player
    ? `#${player.jerseyNumber} ${player.firstName} ${player.lastName}`
    : team
      ? team.abbreviation
      : "Unknown";

  let action = EVENT_LABELS[eventType] ?? eventType;
  if (
    eventType === "ftm" &&
    ftSequenceIndex != null &&
    ftSequenceTotal != null
  ) {
    action = `made FT ${ftSequenceIndex}/${ftSequenceTotal}`;
  } else if (
    eventType === "fta" &&
    ftSequenceIndex != null &&
    ftSequenceTotal != null
  ) {
    action = `missed FT ${ftSequenceIndex}/${ftSequenceTotal}`;
  }

  if (eventType === "period_end") {
    return `${periodLabel} ${clock} — End of ${periodLabel}`;
  }
  if (eventType === "period_start") {
    return `${periodLabel} ${clock} — Start of ${periodLabel}`;
  }
  if (eventType === "timeout") {
    return `${periodLabel} ${clock} — ${team?.abbreviation ?? "Team"} timeout`;
  }
  if (eventType === "jump_ball") {
    return `${periodLabel} ${clock} — Jump ball`;
  }

  return `${periodLabel} ${clock} — ${subject} ${action}`;
}

export function applyScoreDelta(
  scoreDelta: number,
  scoringTeamId: number | null | undefined,
  homeTeamId: number,
  homeScore: number,
  awayScore: number,
): { homeScore: number; awayScore: number } {
  if (scoreDelta === 0 || scoringTeamId == null) {
    return { homeScore, awayScore };
  }
  if (scoringTeamId === homeTeamId) {
    return { homeScore: homeScore + scoreDelta, awayScore };
  }
  return { homeScore, awayScore: awayScore + scoreDelta };
}

export type GameClockState = Pick<
  Game,
  "currentPeriod" | "clockSeconds" | "possessionTeamId"
>;
