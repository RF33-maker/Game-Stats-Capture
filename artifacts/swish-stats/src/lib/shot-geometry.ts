// Half-court geometry for shot capture.
//
// These numbers are the same as the site's ShotChart (client/src/components/
// ShotChart.tsx on swishassistant.com): a 500 x 470 half court with the
// basket at the top centre. Keeping them identical means a shot tapped here
// lands on the same spot — and in the same zone, with the same 2/3 call —
// when the site draws it.
//
// Stored coordinates use the site's shot_chart space (FIBA LiveStats):
//   x: 0-100 along the court's length (we always record the attacking half,
//      so 0-50; the site folds the far half onto the near one anyway)
//   y: 0-100 across the court's width

export const COURT_W = 500;
export const COURT_H = 470;
export const CENTER_X = COURT_W / 2;
export const BASKET_CY = 60;
export const RIM_R = 7.5;
export const BB_HALF = 30;
export const BB_Y = BASKET_CY - RIM_R - 4;
export const RA_R = 42;
export const PAINT_W = 163;
export const PAINT_BOT = 195;
export const PAINT_L = CENTER_X - PAINT_W / 2;
export const FT_RADIUS = 60;
export const TP_R = 222;
export const CORNER_LINE_X_L = 30;
export const CORNER_LINE_X_R = COURT_W - CORNER_LINE_X_L;
export const CORNER_END_Y =
  BASKET_CY + Math.sqrt(Math.max(0, TP_R * TP_R - (CENTER_X - CORNER_LINE_X_L) ** 2));

export type ShotZoneKey = "ra" | "paint" | "mid" | "lc3" | "rc3" | "lw3" | "rw3";

export const ZONE_LABEL: Record<ShotZoneKey, string> = {
  ra: "At the rim",
  paint: "Paint",
  mid: "Mid-range",
  lc3: "Left corner 3",
  rc3: "Right corner 3",
  lw3: "Left wing 3",
  rw3: "Right wing 3",
};

export type CourtPoint = { sx: number; sy: number };
export type ShotCall = { value: 2 | 3; zone: ShotZoneKey; label: string };

/** 2 or 3, and which zone — the same rules the site's chart applies. */
export function classifyShot({ sx, sy }: CourtPoint): ShotCall {
  const dx = sx - CENTER_X;
  const dy = sy - BASKET_CY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const isThree = sx < CORNER_LINE_X_L || sx > CORNER_LINE_X_R || dist > TP_R;

  let zone: ShotZoneKey;
  if (isThree) {
    if (sy <= CORNER_END_Y && sx < CORNER_LINE_X_L + 5) zone = "lc3";
    else if (sy <= CORNER_END_Y && sx > CORNER_LINE_X_R - 5) zone = "rc3";
    else zone = sx < CENTER_X ? "lw3" : "rw3";
  } else if (dist <= RA_R) {
    zone = "ra";
  } else if (Math.abs(dx) <= PAINT_W / 2 && sy <= PAINT_BOT) {
    zone = "paint";
  } else {
    zone = "mid";
  }
  // The site only has left/right wing zones; on screen, a three from straight
  // on reads better as "top of the arc". The stored zone stays site-compatible.
  const label = (zone === "lw3" || zone === "rw3") && Math.abs(dx) < 75 ? "Top of the arc 3" : ZONE_LABEL[zone];
  return { value: isThree ? 3 : 2, zone, label };
}

/** Court point -> stored shot_x / shot_y (site space), rounded to 0.1. */
export function toStored({ sx, sy }: CourtPoint): { shotX: number; shotY: number } {
  const r = (n: number) => Math.round(n * 10) / 10;
  return {
    shotX: r(Math.max(0, Math.min(50, (sy / COURT_H) * 50))),
    shotY: r(Math.max(0, Math.min(100, (sx / COURT_W) * 100))),
  };
}

/** Stored shot_x / shot_y -> court point (folding the far half, as the site does). */
export function fromStored(shotX: number, shotY: number): CourtPoint {
  const fx = shotX > 50 ? 100 - shotX : shotX;
  return { sx: (shotY / 100) * COURT_W, sy: (fx / 50) * COURT_H };
}

export function zoneLabel(zone: string | null | undefined): string | null {
  return zone && zone in ZONE_LABEL ? ZONE_LABEL[zone as ShotZoneKey] : null;
}

/** Distance from the basket in metres (the half court is 15m wide). */
export function distanceMetres({ sx, sy }: CourtPoint): number {
  const units = Math.sqrt((sx - CENTER_X) ** 2 + (sy - BASKET_CY) ** 2);
  return Math.round((units / COURT_W) * 15 * 10) / 10;
}

// ---------------------------------------------------------------------------
// Full court
//
// Stored shot coordinates are the real position on the whole floor, as the
// scorer sees it: x 0-100 left to right along the length, y 0-100 top to
// bottom across the width. That is the site's (FIBA LiveStats) space; the
// site folds the far half onto the near one when it draws a chart.
//
// Which basket a team attacks comes from the game's "ends" setting; teams
// swap at half-time and overtime keeps the second-half direction.
// ---------------------------------------------------------------------------

export const FULL_W = COURT_H * 2; // 940: two half courts end to end
export const FULL_H = COURT_W;     // 500

export type StoredShot = { shotX: number; shotY: number };
export type FullPoint = { fx: number; fy: number };

const round1 = (n: number) => Math.round(n * 10) / 10;

export function fullToStored({ fx, fy }: FullPoint): StoredShot {
  return {
    shotX: round1(Math.max(0, Math.min(100, (fx / FULL_W) * 100))),
    shotY: round1(Math.max(0, Math.min(100, (fy / FULL_H) * 100))),
  };
}

export function storedToFull(shotX: number, shotY: number): FullPoint {
  return { fx: (shotX / 100) * FULL_W, fy: (shotY / 100) * FULL_H };
}

/** Does this team attack the left basket in this period? */
export function attacksLeft(args: {
  isHome: boolean;
  period: number;
  periodCount: number;
  homeAttacksLeftFirstHalf: boolean;
}): boolean {
  const firstHalf = args.period <= Math.ceil(args.periodCount / 2);
  const homeLeft = firstHalf ? args.homeAttacksLeftFirstHalf : !args.homeAttacksLeftFirstHalf;
  return args.isHome ? homeLeft : !homeLeft;
}

/** Distance along the court from the basket being attacked, 0-100. */
function depthFromBasket(shotX: number, teamAttacksLeft: boolean): number {
  return teamAttacksLeft ? shotX : 100 - shotX;
}

/**
 * What a shot is worth for a team attacking the given end. Anything from
 * beyond half-way is a backcourt heave: always a three.
 */
export function classifyStored(shot: StoredShot, teamAttacksLeft: boolean): ShotCall & { backcourt: boolean } {
  const depth = depthFromBasket(shot.shotX, teamAttacksLeft);
  if (depth > 50) {
    return { value: 3, zone: shot.shotY < 50 ? "lw3" : "rw3", label: "Backcourt", backcourt: true };
  }
  return { ...classifyShot(halfPointFor(shot, teamAttacksLeft)), backcourt: false };
}

/** The same shot on the half-court diagram (basket at the top). */
export function halfPointFor(shot: StoredShot, teamAttacksLeft: boolean): CourtPoint {
  const depth = Math.min(50, depthFromBasket(shot.shotX, teamAttacksLeft));
  return { sx: (shot.shotY / 100) * COURT_W, sy: (depth / 50) * COURT_H };
}

/** A tap on the half-court diagram, as a real floor position for that team. */
export function halfPointToStored(p: CourtPoint, teamAttacksLeft: boolean): StoredShot {
  const depth = Math.max(0, Math.min(50, (p.sy / COURT_H) * 50));
  return {
    shotX: round1(teamAttacksLeft ? depth : 100 - depth),
    shotY: round1(Math.max(0, Math.min(100, (p.sx / COURT_W) * 100))),
  };
}

/** Metres from the attacked basket (the floor is 28m x 15m). */
export function distanceMetresStored(shot: StoredShot, teamAttacksLeft: boolean): number {
  const basketX = teamAttacksLeft ? (BASKET_CY / COURT_H) * 50 : 100 - (BASKET_CY / COURT_H) * 50;
  const dxM = ((shot.shotX - basketX) / 100) * 28;
  const dyM = ((shot.shotY - 50) / 100) * 15;
  return Math.round(Math.sqrt(dxM * dxM + dyM * dyM) * 10) / 10;
}
