export type CaptureModePref = "complex" | "simple";

// Stored values stay "complex" / "simple"; these are the product names.
export const CAPTURE_MODES: Record<CaptureModePref, { name: string; description: string }> = {
  complex: { name: "Pro", description: "Full FIBA-style stats with shot chart" },
  simple: { name: "Lite", description: "Points and the basics, no shot chart" },
};

export function captureModeName(mode: string | null | undefined): string {
  return CAPTURE_MODES[mode as CaptureModePref]?.name ?? "Pro";
}

export interface AppSettings {
  periodCount: number;
  periodDurationMins: number;
  overtimeDurationMins: number;
  captureMode: CaptureModePref;
  confirmBeforeFinalize: boolean;
  // After a made shot ask who assisted; after a miss ask who rebounded.
  followUpPrompts: boolean;
  // Pro shot court: "full" is drawn as the scorer sees the floor; "half" is
  // a single bigger half court for small screens.
  courtView: "full" | "half";
  // Ask what kind of turnover it was and offer shot types (layup, dunk,
  // fast break). More detail for the stats, one more tap per play.
  detailPrompts: boolean;
}

// FIBA defaults: 4 periods x 10 minutes, 5-minute overtimes.
export const DEFAULT_SETTINGS: AppSettings = {
  periodCount: 4,
  periodDurationMins: 10,
  overtimeDurationMins: 5,
  captureMode: "complex",
  confirmBeforeFinalize: true,
  followUpPrompts: true,
  courtView: "full",
  detailPrompts: false,
};

const STORAGE_KEY = "swish-stats:settings";

export function loadSettings(): AppSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return { ...DEFAULT_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

// Build the data payload for a new game from the user's saved settings,
// falling back to FIBA defaults when nothing is saved.
export function newGameDefaults(): {
  captureMode: CaptureModePref;
  periodCount: number;
  periodDurationMins: number;
  date: string;
} {
  const s = loadSettings();
  return {
    captureMode: s.captureMode,
    periodCount: s.periodCount,
    periodDurationMins: s.periodDurationMins,
    date: new Date().toISOString(),
  };
}
