import { useRef } from "react";
import { cn } from "@/lib/utils";
import {
  BASKET_CY, BB_HALF, BB_Y, CENTER_X, CORNER_END_Y, CORNER_LINE_X_L, CORNER_LINE_X_R,
  COURT_H, COURT_W, FT_RADIUS, FULL_H, FULL_W, PAINT_BOT, PAINT_L, PAINT_W, RA_R, RIM_R, TP_R,
  type CourtPoint, type FullPoint,
} from "@/lib/shot-geometry";

const LINE = "hsl(var(--muted-foreground))";
const ARC = `M ${CORNER_LINE_X_L} 0 L ${CORNER_LINE_X_L} ${CORNER_END_Y} A ${TP_R} ${TP_R} 0 0 0 ${CORNER_LINE_X_R} ${CORNER_END_Y} L ${CORNER_LINE_X_R} 0`;

/** One half court's surface and lines, in half-court units (basket at the top). */
function HalfMarkings({ accent }: { accent: string }) {
  return (
    <>
      {/* Inside the arc reads slightly lighter, so the 2/3 boundary is obvious */}
      <path d={`${ARC} Z`} className="fill-[hsl(var(--card))]" />
      <rect x={PAINT_L} y={0} width={PAINT_W} height={PAINT_BOT} fill={accent} fillOpacity={0.1} />
      <g fill="none" stroke={LINE} strokeOpacity={0.75} strokeWidth={2}>
        <path d={ARC} />
        <rect x={PAINT_L} y={0} width={PAINT_W} height={PAINT_BOT} />
        <path d={`M ${CENTER_X - FT_RADIUS} ${PAINT_BOT} A ${FT_RADIUS} ${FT_RADIUS} 0 0 0 ${CENTER_X + FT_RADIUS} ${PAINT_BOT}`} />
        <path d={`M ${CENTER_X - FT_RADIUS} ${PAINT_BOT} A ${FT_RADIUS} ${FT_RADIUS} 0 0 1 ${CENTER_X + FT_RADIUS} ${PAINT_BOT}`} strokeDasharray="6 6" strokeOpacity={0.45} />
        <path d={`M ${CENTER_X - RA_R} ${BASKET_CY} A ${RA_R} ${RA_R} 0 0 0 ${CENTER_X + RA_R} ${BASKET_CY}`} />
        <line x1={CENTER_X - BB_HALF} y1={BB_Y} x2={CENTER_X + BB_HALF} y2={BB_Y} strokeWidth={3.5} />
        <circle cx={CENTER_X} cy={BASKET_CY} r={RIM_R} stroke={accent} strokeOpacity={1} strokeWidth={2.5} />
        {/* Half of the centre circle */}
        <path d={`M ${CENTER_X - FT_RADIUS} ${COURT_H} A ${FT_RADIUS} ${FT_RADIUS} 0 0 1 ${CENTER_X + FT_RADIUS} ${COURT_H}`} />
      </g>
    </>
  );
}

type Mark = { id: number | string; x: number; y: number; made: boolean; color: string; recent?: boolean };

function Marks({ marks }: { marks: Mark[] }) {
  return (
    <g className="pointer-events-none">
      {marks.map((s) =>
        s.made ? (
          <circle key={s.id} cx={s.x} cy={s.y} r={s.recent ? 8 : 6.5} fill={s.color}
            stroke="hsl(var(--foreground))" strokeOpacity={0.55} strokeWidth={1.5} opacity={s.recent ? 1 : 0.55} />
        ) : (
          <g key={s.id} stroke={s.color} strokeWidth={s.recent ? 3 : 2.5} strokeLinecap="round" opacity={s.recent ? 0.95 : 0.5}>
            <line x1={s.x - 6} y1={s.y - 6} x2={s.x + 6} y2={s.y + 6} />
            <line x1={s.x - 6} y1={s.y + 6} x2={s.x + 6} y2={s.y - 6} />
          </g>
        ),
      )}
    </g>
  );
}

function PendingMark({ x, y, color }: { x: number; y: number; color: string }) {
  return (
    <g className="pointer-events-none" data-testid="shot-pending">
      <circle cx={x} cy={y} r={18} fill={color} fillOpacity={0.18}>
        <animate attributeName="r" values="14;22;14" dur="1.4s" repeatCount="indefinite" />
      </circle>
      <circle cx={x} cy={y} r={9} fill={color} stroke="hsl(var(--foreground))" strokeWidth={2.5} />
    </g>
  );
}

function useSvgTap(width: number, height: number, onTap?: (x: number, y: number) => void) {
  const svgRef = useRef<SVGSVGElement>(null);
  const handlePointer = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!onTap || !svgRef.current) return;
    const ctm = svgRef.current.getScreenCTM();
    if (!ctm) return;
    const pt = svgRef.current.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    onTap(Math.max(0, Math.min(width, p.x)), Math.max(0, Math.min(height, p.y)));
  };
  return { svgRef, handlePointer };
}

// ---------------------------------------------------------------------------
// Half court (basket at the top) — the compact view for small screens
// ---------------------------------------------------------------------------

export type CourtShot = CourtPoint & { id: number | string; made: boolean; color: string; recent?: boolean };

export function ShotCourt({ shots = [], pending, accentColor = "#f97316", onTap, className }: {
  shots?: CourtShot[];
  pending?: CourtPoint | null;
  accentColor?: string;
  onTap?: (point: CourtPoint) => void;
  className?: string;
}) {
  const { svgRef, handlePointer } = useSvgTap(COURT_W, COURT_H, onTap ? (sx, sy) => onTap({ sx, sy }) : undefined);
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
        <rect x={0} y={0} width={COURT_W} height={COURT_H} rx={6} className="fill-[hsl(var(--secondary))]" fillOpacity={0.55} />
        <g className="pointer-events-none">
          <HalfMarkings accent={accentColor} />
          <rect x={1} y={1} width={COURT_W - 2} height={COURT_H - 2} rx={6} fill="none" stroke={LINE} strokeOpacity={0.75} strokeWidth={2} />
        </g>
        <Marks marks={shots.map(s => ({ id: s.id, x: s.sx, y: s.sy, made: s.made, color: s.color, recent: s.recent }))} />
        {pending && <PendingMark x={pending.sx} y={pending.sy} color={accentColor} />}
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Full court — drawn the way the scorer sees the floor from the table
// ---------------------------------------------------------------------------

export type FullCourtShot = FullPoint & { id: number | string; made: boolean; color: string; recent?: boolean };
export type CourtEnd = { label: string; color: string };

export function FullCourt({ shots = [], pending, pendingColor = "#f97316", left, right, onTap, className }: {
  shots?: FullCourtShot[];
  pending?: FullPoint | null;
  pendingColor?: string;
  /** The team attacking each basket right now. */
  left: CourtEnd;
  right: CourtEnd;
  onTap?: (point: FullPoint) => void;
  className?: string;
}) {
  const { svgRef, handlePointer } = useSvgTap(FULL_W, FULL_H, onTap ? (fx, fy) => onTap({ fx, fy }) : undefined);
  return (
    <div className={cn("relative w-full min-h-0", className)}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${FULL_W} ${FULL_H}`}
        preserveAspectRatio="xMidYMid meet"
        className={cn("w-full h-full select-none touch-none", onTap && "cursor-crosshair")}
        onPointerDown={handlePointer}
        role="img"
        aria-label={`Full court — ${left.label} attack the left basket, ${right.label} the right. Tap where the shot was taken`}
        data-testid="shot-court"
      >
        <rect x={0} y={0} width={FULL_W} height={FULL_H} rx={6} className="fill-[hsl(var(--secondary))]" fillOpacity={0.55} />
        <g className="pointer-events-none">
          {/* Left half: half-court units turned on their side (depth runs left to right) */}
          <g transform="matrix(0 1 1 0 0 0)"><HalfMarkings accent={left.color} /></g>
          {/* Right half: the mirror image */}
          <g transform={`matrix(0 1 -1 0 ${FULL_W} 0)`}><HalfMarkings accent={right.color} /></g>
          <g fill="none" stroke={LINE} strokeOpacity={0.75} strokeWidth={2}>
            <rect x={1} y={1} width={FULL_W - 2} height={FULL_H - 2} rx={6} />
            <line x1={FULL_W / 2} y1={0} x2={FULL_W / 2} y2={FULL_H} />
          </g>
          {/* Who attacks which way */}
          <g fontFamily="var(--app-font-display)" fontWeight={700} fontSize={30} style={{ textTransform: "uppercase" }}>
            <text x={FULL_W / 2 - 16} y={38} textAnchor="end" fill={left.color} data-testid="court-end-left">◀ {left.label}</text>
            <text x={FULL_W / 2 + 16} y={38} textAnchor="start" fill={right.color} data-testid="court-end-right">{right.label} ▶</text>
          </g>
        </g>
        <Marks marks={shots.map(s => ({ id: s.id, x: s.fx, y: s.fy, made: s.made, color: s.color, recent: s.recent }))} />
        {pending && <PendingMark x={pending.fx} y={pending.fy} color={pendingColor} />}
      </svg>
    </div>
  );
}
