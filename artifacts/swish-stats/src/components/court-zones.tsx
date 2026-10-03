import { cn } from "@/lib/utils";

// Mirrors lib/db/src/schema/statEvents.ts SHOT_ZONES — keep these ids in sync.
// Frontend keeps its own copy (with labels + geometry) so this component
// stays free of server-only imports.
export const SHOT_ZONES = [
  { id: "paint", label: "Paint" },
  { id: "left_short_corner", label: "Left Short Corner" },
  { id: "right_short_corner", label: "Right Short Corner" },
  { id: "left_corner_three", label: "Left Corner 3" },
  { id: "right_corner_three", label: "Right Corner 3" },
  { id: "left_baseline_midrange", label: "Left Baseline Mid-Range" },
  { id: "right_baseline_midrange", label: "Right Baseline Mid-Range" },
  { id: "top_key_midrange", label: "Top of Key Mid-Range" },
  { id: "left_wing_three", label: "Left Wing 3" },
  { id: "right_wing_three", label: "Right Wing 3" },
  { id: "top_arc_three", label: "Top of the Arc 3" },
] as const;

export type ShotZoneId = (typeof SHOT_ZONES)[number]["id"];

export function shotZoneLabel(id: string | null | undefined): string | null {
  return SHOT_ZONES.find((z) => z.id === id)?.label ?? null;
}

// Point value each zone is worth — lets the capture screen keep the zone
// picker and the 2PT/3PT stat buttons in sync so an operator can't record a
// mismatched pairing (e.g. a 3PT make tagged with a 2-point zone).
export const ZONE_SHOT_VALUE: Record<ShotZoneId, 2 | 3> = {
  paint: 2,
  left_short_corner: 2,
  right_short_corner: 2,
  left_baseline_midrange: 2,
  right_baseline_midrange: 2,
  top_key_midrange: 2,
  left_corner_three: 3,
  right_corner_three: 3,
  left_wing_three: 3,
  right_wing_three: 3,
  top_arc_three: 3,
};

// Halfcourt viewBox 0 0 500 470, basket at (250, 52), hoop facing downcourt.
//
// The 11 zones tile the entire 500x470 court with no gaps or overlaps:
// five vertical columns (corner / short-corner+baseline / key / short-corner
// +baseline / corner), each column beyond the paint split by the actual
// three-point arc into a mid-range zone (inside the arc) and a three-point
// zone (outside it). This gives the classic NBA "hotspot" fan-out look
// (short corner -> baseline -> wing/top, clipped by the arc) while keeping
// every boundary derived from the same hoop + radius so the drawn court
// lines and the clickable zones always agree.
const HOOP = { x: 250, y: 52 };
const COL = { sideline: 0, corner: 30, key: 170, keyEnd: 330, cornerEnd: 470, farSideline: 500 };
const PAINT_BOTTOM = 190;
const COURT_BOTTOM = 470;

// Radius of the three-point arc, derived so the circle centered on the hoop
// passes exactly through the corner-three break points (30, PAINT_BOTTOM)
// and (470, PAINT_BOTTOM) — the same points the decorative arc line below uses.
const THREE_R = Math.sqrt(
  (HOOP.x - COL.corner) ** 2 + (PAINT_BOTTOM - HOOP.y) ** 2,
);

// y-coordinate of the three-point arc at a given x (only valid for
// COL.corner <= x <= COL.cornerEnd).
function arcY(x: number): number {
  return HOOP.y + Math.sqrt(THREE_R ** 2 - (HOOP.x - x) ** 2);
}

// SVG arc command tracing the three-point circle from x=xFrom to x=xTo.
function arcTo(xFrom: number, xTo: number): string {
  const sweep = xTo > xFrom ? 0 : 1;
  return `A ${THREE_R} ${THREE_R} 0 0 ${sweep} ${xTo} ${arcY(xTo)}`;
}

const ZONE_PATHS: Record<ShotZoneId, string> = {
  // Full-height strips beyond the sidelines — always past the arc.
  left_corner_three: `M ${COL.sideline} 0 H ${COL.corner} V ${COURT_BOTTOM} H ${COL.sideline} Z`,
  right_corner_three: `M ${COL.cornerEnd} 0 H ${COL.farSideline} V ${COURT_BOTTOM} H ${COL.cornerEnd} Z`,

  // Shallow zones beside the paint, above the arc's break point — always 2pt.
  left_short_corner: `M ${COL.corner} 0 H ${COL.key} V ${PAINT_BOTTOM} H ${COL.corner} Z`,
  right_short_corner: `M ${COL.keyEnd} 0 H ${COL.cornerEnd} V ${PAINT_BOTTOM} H ${COL.keyEnd} Z`,

  paint: `M ${COL.key} 0 H ${COL.keyEnd} V ${PAINT_BOTTOM} H ${COL.key} Z`,

  // Between the paint/short-corner line and the arc.
  left_baseline_midrange: `M ${COL.corner} ${PAINT_BOTTOM} L ${COL.key} ${PAINT_BOTTOM} L ${COL.key} ${arcY(COL.key)} ${arcTo(COL.key, COL.corner)} Z`,
  right_baseline_midrange: `M ${COL.cornerEnd} ${PAINT_BOTTOM} L ${COL.keyEnd} ${PAINT_BOTTOM} L ${COL.keyEnd} ${arcY(COL.keyEnd)} ${arcTo(COL.keyEnd, COL.cornerEnd)} Z`,
  top_key_midrange: `M ${COL.key} ${PAINT_BOTTOM} L ${COL.keyEnd} ${PAINT_BOTTOM} L ${COL.keyEnd} ${arcY(COL.keyEnd)} ${arcTo(COL.keyEnd, COL.key)} Z`,

  // Beyond the arc, down to the far end of the half-court.
  left_wing_three: `M ${COL.corner} ${PAINT_BOTTOM} L ${COL.corner} ${COURT_BOTTOM} L ${COL.key} ${COURT_BOTTOM} L ${COL.key} ${arcY(COL.key)} ${arcTo(COL.key, COL.corner)} Z`,
  right_wing_three: `M ${COL.cornerEnd} ${PAINT_BOTTOM} L ${COL.cornerEnd} ${COURT_BOTTOM} L ${COL.keyEnd} ${COURT_BOTTOM} L ${COL.keyEnd} ${arcY(COL.keyEnd)} ${arcTo(COL.keyEnd, COL.cornerEnd)} Z`,
  top_arc_three: `M ${COL.key} ${arcY(COL.key)} L ${COL.key} ${COURT_BOTTOM} L ${COL.keyEnd} ${COURT_BOTTOM} L ${COL.keyEnd} ${arcY(COL.keyEnd)} ${arcTo(COL.keyEnd, COL.key)} Z`,
};

interface CourtZonesProps {
  selectedZone: ShotZoneId | null;
  onSelectZone: (zone: ShotZoneId | null) => void;
  accentColor?: string;
  disabled?: boolean;
  className?: string;
  // When set, only zones worth this many points are selectable — the rest
  // render disabled/dimmed. Used to keep the zone picker in sync with a
  // 2PT/3PT stat button chosen elsewhere on the capture screen.
  allowedShotValue?: 2 | 3 | null;
}

export function CourtZones({
  selectedZone,
  onSelectZone,
  accentColor = "#f97316",
  disabled = false,
  className,
  allowedShotValue = null,
}: CourtZonesProps) {
  return (
    <div className={cn("relative w-full", className)}>
      <svg
        viewBox="0 0 500 470"
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full max-w-full max-h-full select-none"
        role="group"
        aria-label="Shot location zones"
      >
        {/* Court floor */}
        <rect x={0} y={0} width={500} height={470} rx={8} className="fill-[hsl(var(--card))]" />

        {/* Zone hit-areas */}
        {SHOT_ZONES.map(({ id, label }) => {
          const d = ZONE_PATHS[id];
          const isSelected = selectedZone === id;
          const isZoneDisabled =
            disabled || (allowedShotValue != null && ZONE_SHOT_VALUE[id] !== allowedShotValue);
          return (
            <path
              key={id}
              d={d}
              tabIndex={isZoneDisabled ? -1 : 0}
              role="button"
              aria-label={label}
              aria-disabled={isZoneDisabled}
              aria-pressed={isSelected}
              className={cn(
                "stroke-[hsl(var(--border-strong))] transition-colors",
                isZoneDisabled
                  ? "cursor-not-allowed fill-[hsl(var(--muted))] opacity-40"
                  : "cursor-pointer fill-[hsl(var(--card))] hover:fill-[hsl(var(--accent))] focus:outline-none",
              )}
              style={isSelected ? { fill: `${accentColor}33`, stroke: accentColor, strokeWidth: 2 } : undefined}
              onClick={() => !isZoneDisabled && onSelectZone(isSelected ? null : id)}
              onKeyDown={(e) => {
                if (isZoneDisabled) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectZone(isSelected ? null : id);
                }
              }}
            />
          );
        })}

        {/* Decorative court markings (non-interactive, drawn on top) */}
        <g className="pointer-events-none" fill="none" stroke="hsl(var(--muted-foreground))" strokeOpacity={0.7} strokeWidth={2}>
          {/* Baseline */}
          <line x1={0} y1={2} x2={500} y2={2} />
          {/* Paint outline */}
          <rect x={COL.key} y={0} width={COL.keyEnd - COL.key} height={PAINT_BOTTOM} />
          {/* Free-throw circle */}
          <circle cx={250} cy={PAINT_BOTTOM} r={60} />
          {/* Backboard + rim */}
          <line x1={220} y1={40} x2={280} y2={40} strokeWidth={3} />
          <circle cx={HOOP.x} cy={HOOP.y} r={8} />
          {/* Restricted area */}
          <path d="M 210 52 A 40 40 0 0 0 290 52" />
          {/* Corner three lines */}
          <line x1={COL.corner} y1={0} x2={COL.corner} y2={PAINT_BOTTOM} />
          <line x1={COL.cornerEnd} y1={0} x2={COL.cornerEnd} y2={PAINT_BOTTOM} />
          {/* Three point arc */}
          <path d={`M ${COL.corner} ${PAINT_BOTTOM} ${arcTo(COL.corner, COL.cornerEnd)}`} />
        </g>
      </svg>

      {selectedZone && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 text-xs font-bold uppercase tracking-wide px-2 py-1 rounded-md shadow-sm bg-card border"
          style={{ borderColor: accentColor, color: accentColor }}
        >
          {shotZoneLabel(selectedZone)}
        </div>
      )}
    </div>
  );
}
