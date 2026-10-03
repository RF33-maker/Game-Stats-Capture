import { useRef } from "react";
import { cn } from "@/lib/utils";
import {
  BASKET_CY, BB_HALF, BB_Y, CENTER_X, CORNER_END_Y, CORNER_LINE_X_L, CORNER_LINE_X_R,
  COURT_H, COURT_W, FT_RADIUS, PAINT_BOT, PAINT_L, PAINT_W, RA_R, RIM_R, TP_R,
  type CourtPoint,
} from "@/lib/shot-geometry";

export type CourtShot = CourtPoint & {
  id: number | string;
  made: boolean;
  color: string;
  /** Drawn brighter — the latest few shots. */
  recent?: boolean;
};

interface ShotCourtProps {
  shots?: CourtShot[];
  /** The location just tapped, waiting for made/missed (and a shooter). */
  pending?: CourtPoint | null;
  /** Accent for the pending marker (the shooting team's colour, or Swish orange). */
  accentColor?: string;
  onTap?: (point: CourtPoint) => void;
  className?: string;
}

/**
 * Half court for recording shot locations. Tap anywhere: the exact spot is
 * kept, and whether it's a 2 or a 3 is worked out from the lines.
 */
export function ShotCourt({ shots = [], pending, accentColor = "#f97316", onTap, className }: ShotCourtProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  const handlePointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onTap || !svgRef.current) return;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    onTap({
      sx: Math.max(0, Math.min(COURT_W, p.x)),
      sy: Math.max(0, Math.min(COURT_H, p.y)),
    });
  };

  const line = "hsl(var(--muted-foreground))";

  return (
    <div className={cn("relative w-full min-h-0", className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${COURT_W} ${COURT_H}`}
        preserveAspectRatio="xMidYMid meet"
        className={cn("w-full h-full select-none touch-none", onTap && "cursor-crosshair")}
        onPointerDown={handlePointer}
        role="img"
        aria-label="Half court — tap where the shot was taken"
        data-testid="shot-court"
      >
        {/* Floor */}
        <rect x={0} y={0} width={COURT_W} height={COURT_H} rx={6} className="fill-[hsl(var(--secondary))]" fillOpacity={0.55} />
        {/* Inside the arc reads slightly lighter, so the 2/3 boundary is obvious */}
        <path
          d={`M ${CORNER_LINE_X_L} 0 L ${CORNER_LINE_X_L} ${CORNER_END_Y} A ${TP_R} ${TP_R} 0 0 0 ${CORNER_LINE_X_R} ${CORNER_END_Y} L ${CORNER_LINE_X_R} 0 Z`}
          className="fill-[hsl(var(--card))]"
        />
        <rect x={PAINT_L} y={0} width={PAINT_W} height={PAINT_BOT} fill={accentColor} fillOpacity={0.07} />

        <g fill="none" stroke={line} strokeOpacity={0.75} strokeWidth={2} className="pointer-events-none">
          <rect x={1} y={1} width={COURT_W - 2} height={COURT_H - 2} rx={6} />
          {/* Three-point line */}
          <path d={`M ${CORNER_LINE_X_L} 0 L ${CORNER_LINE_X_L} ${CORNER_END_Y} A ${TP_R} ${TP_R} 0 0 0 ${CORNER_LINE_X_R} ${CORNER_END_Y} L ${CORNER_LINE_X_R} 0`} />
          {/* Paint + free-throw circle */}
          <rect x={PAINT_L} y={0} width={PAINT_W} height={PAINT_BOT} />
          <path d={`M ${CENTER_X - FT_RADIUS} ${PAINT_BOT} A ${FT_RADIUS} ${FT_RADIUS} 0 0 0 ${CENTER_X + FT_RADIUS} ${PAINT_BOT}`} />
          <path d={`M ${CENTER_X - FT_RADIUS} ${PAINT_BOT} A ${FT_RADIUS} ${FT_RADIUS} 0 0 1 ${CENTER_X + FT_RADIUS} ${PAINT_BOT}`} strokeDasharray="6 6" strokeOpacity={0.45} />
          {/* Restricted area */}
          <path d={`M ${CENTER_X - RA_R} ${BASKET_CY} A ${RA_R} ${RA_R} 0 0 0 ${CENTER_X + RA_R} ${BASKET_CY}`} />
          {/* Backboard + rim */}
          <line x1={CENTER_X - BB_HALF} y1={BB_Y} x2={CENTER_X + BB_HALF} y2={BB_Y} strokeWidth={3.5} />
          <circle cx={CENTER_X} cy={BASKET_CY} r={RIM_R} stroke={accentColor} strokeOpacity={1} strokeWidth={2.5} />
          {/* Centre circle */}
          <path d={`M ${CENTER_X - FT_RADIUS} ${COURT_H} A ${FT_RADIUS} ${FT_RADIUS} 0 0 1 ${CENTER_X + FT_RADIUS} ${COURT_H}`} />
        </g>

        {/* Shots already recorded this game */}
        <g className="pointer-events-none">
          {shots.map((s) =>
            s.made ? (
              <circle key={s.id} cx={s.sx} cy={s.sy} r={s.recent ? 8 : 6.5} fill={s.color}
                stroke="hsl(var(--foreground))" strokeOpacity={0.55} strokeWidth={1.5} opacity={s.recent ? 1 : 0.55} />
            ) : (
              <g key={s.id} stroke={s.color} strokeWidth={s.recent ? 3 : 2.5} strokeLinecap="round" opacity={s.recent ? 0.95 : 0.5}>
                <line x1={s.sx - 6} y1={s.sy - 6} x2={s.sx + 6} y2={s.sy + 6} />
                <line x1={s.sx - 6} y1={s.sy + 6} x2={s.sx + 6} y2={s.sy - 6} />
              </g>
            ),
          )}
        </g>

        {/* The spot just tapped */}
        {pending && (
          <g className="pointer-events-none" data-testid="shot-pending">
            <circle cx={pending.sx} cy={pending.sy} r={18} fill={accentColor} fillOpacity={0.18}>
              <animate attributeName="r" values="14;22;14" dur="1.4s" repeatCount="indefinite" />
            </circle>
            <circle cx={pending.sx} cy={pending.sy} r={9} fill={accentColor} stroke="hsl(var(--foreground))" strokeWidth={2.5} />
          </g>
        )}
      </svg>
    </div>
  );
}
