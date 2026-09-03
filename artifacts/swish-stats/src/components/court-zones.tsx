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

// Rectangular hit-areas for each zone on a standardized halfcourt,
// viewBox 0 0 500 470 with the basket at the top (250, 52).
const ZONE_RECTS: Record<ShotZoneId, { x: number; y: number; w: number; h: number }> = {
  left_corner_three: { x: 0, y: 0, w: 30, h: 190 },
  left_short_corner: { x: 30, y: 0, w: 140, h: 190 },
  paint: { x: 170, y: 0, w: 160, h: 190 },
  right_short_corner: { x: 330, y: 0, w: 140, h: 190 },
  right_corner_three: { x: 470, y: 0, w: 30, h: 190 },
  left_baseline_midrange: { x: 0, y: 190, w: 170, h: 130 },
  top_key_midrange: { x: 170, y: 190, w: 160, h: 130 },
  right_baseline_midrange: { x: 330, y: 190, w: 170, h: 130 },
  left_wing_three: { x: 0, y: 320, w: 190, h: 150 },
  top_arc_three: { x: 190, y: 320, w: 120, h: 150 },
  right_wing_three: { x: 310, y: 320, w: 190, h: 150 },
};

interface CourtZonesProps {
  selectedZone: ShotZoneId | null;
  onSelectZone: (zone: ShotZoneId | null) => void;
  accentColor?: string;
  disabled?: boolean;
  className?: string;
}

export function CourtZones({
  selectedZone,
  onSelectZone,
  accentColor = "#f97316",
  disabled = false,
  className,
}: CourtZonesProps) {
  return (
    <div className={cn("relative w-full", className)}>
      <svg
        viewBox="0 0 500 470"
        className="w-full h-auto select-none"
        role="group"
        aria-label="Shot location zones"
      >
        {/* Court floor */}
        <rect x={0} y={0} width={500} height={470} rx={8} className="fill-white" />

        {/* Zone hit-areas */}
        {SHOT_ZONES.map(({ id, label }) => {
          const r = ZONE_RECTS[id];
          const isSelected = selectedZone === id;
          return (
            <rect
              key={id}
              x={r.x}
              y={r.y}
              width={r.w}
              height={r.h}
              tabIndex={disabled ? -1 : 0}
              role="button"
              aria-label={label}
              aria-pressed={isSelected}
              className={cn(
                "stroke-slate-200 transition-colors",
                disabled ? "cursor-not-allowed fill-white" : "cursor-pointer fill-white hover:fill-slate-100 focus:outline-none",
              )}
              style={isSelected ? { fill: `${accentColor}33`, stroke: accentColor, strokeWidth: 2 } : undefined}
              onClick={() => !disabled && onSelectZone(isSelected ? null : id)}
              onKeyDown={(e) => {
                if (disabled) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectZone(isSelected ? null : id);
                }
              }}
            />
          );
        })}

        {/* Decorative court markings (non-interactive, drawn on top) */}
        <g className="pointer-events-none" fill="none" stroke="#94a3b8" strokeWidth={2}>
          {/* Baseline */}
          <line x1={0} y1={2} x2={500} y2={2} />
          {/* Paint outline */}
          <rect x={170} y={0} width={160} height={190} />
          {/* Free-throw circle */}
          <circle cx={250} cy={190} r={60} />
          {/* Backboard + rim */}
          <line x1={220} y1={40} x2={280} y2={40} strokeWidth={3} />
          <circle cx={250} cy={52} r={8} />
          {/* Restricted area */}
          <path d="M 210 52 A 40 40 0 0 0 290 52" />
          {/* Corner three lines */}
          <line x1={30} y1={0} x2={30} y2={190} />
          <line x1={470} y1={0} x2={470} y2={190} />
          {/* Three point arc */}
          <path d="M 30 190 A 237.5 237.5 0 0 0 470 190" />
        </g>

        {/* Zone boundary grid lines (subtle) */}
        <g className="pointer-events-none" stroke="#e2e8f0" strokeWidth={1}>
          <line x1={0} y1={190} x2={500} y2={190} />
          <line x1={0} y1={320} x2={500} y2={320} />
        </g>
      </svg>

      {selectedZone && (
        <div
          className="absolute top-2 left-1/2 -translate-x-1/2 text-xs font-bold uppercase tracking-wide px-2 py-1 rounded shadow-sm bg-white border"
          style={{ borderColor: accentColor, color: accentColor }}
        >
          {shotZoneLabel(selectedZone)}
        </div>
      )}
    </div>
  );
}
