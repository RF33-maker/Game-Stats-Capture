import { SHOT_TYPES, TURNOVER_TYPES, periodLabel as gamePeriodLabel, qualifierLabel } from "./game-state";

export type PossessionEffect = {
  scoreDelta: number;
  possessionEnded: boolean;
  nextPossessionTeamId: number | null | undefined;
};

export function computePossessionEffect(args: {
  eventType: string;
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
      return { scoreDelta: 2, possessionEnded: true, nextPossessionTeamId: otherTeam(eventTeamId) };
    case "3ptm":
      return { scoreDelta: 3, possessionEnded: true, nextPossessionTeamId: otherTeam(eventTeamId) };
    case "ftm": {
      const isFinal =
        ftSequenceIndex != null &&
        ftSequenceTotal != null &&
        ftSequenceIndex >= ftSequenceTotal;
      const treatAsFinal = ftSequenceIndex == null || ftSequenceTotal == null || isFinal;
      return {
        scoreDelta: 1,
        possessionEnded: treatAsFinal,
        nextPossessionTeamId: treatAsFinal ? otherTeam(eventTeamId) : undefined,
      };
    }
    case "tov":
      return { scoreDelta: 0, possessionEnded: true, nextPossessionTeamId: otherTeam(eventTeamId) };
    case "stl":
      return { scoreDelta: 0, possessionEnded: true, nextPossessionTeamId: eventTeamId ?? null };
    case "dreb":
      return { scoreDelta: 0, possessionEnded: true, nextPossessionTeamId: eventTeamId ?? null };
    case "oreb":
      return {
        scoreDelta: 0,
        possessionEnded: false,
        nextPossessionTeamId: eventTeamId ?? currentPossessionTeamId ?? null,
      };
    case "jump_ball":
      // A jump ball recorded with a team says who came away with the ball.
      if (eventTeamId == null) return { scoreDelta: 0, possessionEnded: false, nextPossessionTeamId: undefined };
      return {
        scoreDelta: 0,
        possessionEnded: currentPossessionTeamId != null && currentPossessionTeamId !== eventTeamId,
        nextPossessionTeamId: eventTeamId,
      };
    case "period_end":
      return {
        scoreDelta: 0,
        possessionEnded: currentPossessionTeamId != null,
        nextPossessionTeamId: null,
      };
    default:
      return { scoreDelta: 0, possessionEnded: false, nextPossessionTeamId: undefined };
  }
}

export function applyScoreDelta(
  scoreDelta: number,
  scoringTeamId: number | null | undefined,
  homeTeamId: number,
  homeScore: number,
  awayScore: number,
): { homeScore: number; awayScore: number } {
  if (scoreDelta === 0 || scoringTeamId == null) return { homeScore, awayScore };
  if (scoringTeamId === homeTeamId) return { homeScore: homeScore + scoreDelta, awayScore };
  return { homeScore, awayScore: awayScore + scoreDelta };
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
  fd: "drew foul",
  sub_in: "substituted in",
  sub_out: "substituted out",
  timeout: "timeout",
  period_start: "period start",
  period_end: "period end",
  jump_ball: "jump ball",
};

export function describeEvent(args: {
  eventType: string;
  team: { abbreviation: string } | null;
  player: { jerseyNumber: string; firstName: string; lastName: string } | null;
  period: number;
  clockSeconds: number;
  ftSequenceIndex?: number | null;
  ftSequenceTotal?: number | null;
  // The other half of a substitution pair — e.g. for a sub_in event, the
  // player who came out; for a sub_out event, the player who came in.
  otherPlayer?: { lastName: string } | null;
  qualifiers?: string[] | null;
  periodCount?: number;
}): string {
  const { eventType, team, player, period, clockSeconds, ftSequenceIndex, ftSequenceTotal, otherPlayer } = args;
  const q = args.qualifiers ?? [];

  const mins = Math.floor(clockSeconds / 60);
  const secs = clockSeconds % 60;
  const clock = `${mins}:${secs.toString().padStart(2, "0")}`;
  const periodLabel = gamePeriodLabel(period, args.periodCount ?? 4);

  const subject = player
    ? `#${player.jerseyNumber} ${player.firstName} ${player.lastName}`
    : team
      ? team.abbreviation
      : "Unknown";

  let action = EVENT_LABELS[eventType] ?? eventType;
  // No player on a rebound or turnover means it was credited to the team.
  if (!player && team && (eventType === "oreb" || eventType === "dreb" || eventType === "tov")) {
    action = `team ${action}`;
  }
  if (eventType === "pf") {
    action = q.includes("offensive") ? "offensive foul" : q.includes("shooting") ? "shooting foul" : "personal foul";
  } else if (eventType === "flagrant") {
    action = q.includes("disqualifying") ? "disqualifying foul" : "unsportsmanlike foul";
  } else if (eventType === "tf" && !player) {
    action = q.includes("coach") ? "coach technical foul" : "bench technical foul";
  } else if (eventType === "tov") {
    const kind = q.find(x => TURNOVER_TYPES.some(t => t[0] === x));
    if (kind && kind !== "other") action += ` (${qualifierLabel(kind)})`;
  } else if (["2ptm", "2pta", "3ptm", "3pta"].includes(eventType)) {
    const kind = q.find(x => SHOT_TYPES.some(t => t[0] === x));
    if (kind && kind !== "jump") action = action.replace("FG", qualifierLabel(kind));
    if (q.includes("fastbreak")) action += " (fast break)";
  }
  if (eventType === "ftm" && ftSequenceIndex != null && ftSequenceTotal != null) {
    action = `made FT ${ftSequenceIndex}/${ftSequenceTotal}`;
  } else if (eventType === "fta" && ftSequenceIndex != null && ftSequenceTotal != null) {
    action = `missed FT ${ftSequenceIndex}/${ftSequenceTotal}`;
  }

  if (eventType === "period_end") return `${periodLabel} ${clock} — End of ${periodLabel}`;
  if (eventType === "period_start") return `${periodLabel} ${clock} — Start of ${periodLabel}`;
  if (eventType === "timeout") return `${periodLabel} ${clock} — ${team?.abbreviation ?? "Team"} timeout`;
  if (eventType === "jump_ball") {
    return team ? `${periodLabel} ${clock} — Jump ball, ${team.abbreviation} possession` : `${periodLabel} ${clock} — Jump ball`;
  }
  if (eventType === "sub_in") {
    return otherPlayer
      ? `${periodLabel} ${clock} — ${subject} subs in for ${otherPlayer.lastName}`
      : `${periodLabel} ${clock} — ${subject} substituted in`;
  }
  if (eventType === "sub_out") {
    return otherPlayer
      ? `${periodLabel} ${clock} — ${subject} subs out for ${otherPlayer.lastName}`
      : `${periodLabel} ${clock} — ${subject} substituted out`;
  }

  return `${periodLabel} ${clock} — ${subject} ${action}`;
}
