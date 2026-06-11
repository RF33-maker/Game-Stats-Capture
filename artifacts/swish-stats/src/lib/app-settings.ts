export type CaptureModePref = "complex" | "simple";

export interface AppSettings {
  periodCount: number;
  periodDurationMins: number;
  overtimeDurationMins: number;
  captureMode: CaptureModePref;
  confirmBeforeFinalize: boolean;
}

// FIBA defaults: 4 periods x 10 minutes, 5-minute overtimes.
export const DEFAULT_SETTINGS: AppSettings = {
  periodCount: 4,
  periodDurationMins: 10,
  overtimeDurationMins: 5,
  captureMode: "complex",
  confirmBeforeFinalize: true,
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
