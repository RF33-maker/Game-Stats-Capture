// The running game clock is worked out from the wall clock, not by counting
// ticks. Counting ticks drifts (every restart of the timer loses a little) and
// stalls when the browser slows a background tab, which is exactly where the
// scorer's tab is when they are watching a video in another window.

/** Seconds left on a clock that was at `from` when it started running at `startedAt` (ms). */
export function clockAfter(from: number, startedAt: number, now: number): number {
  return Math.max(0, from - Math.floor((now - startedAt) / 1000));
}

/** "7:42" or "742" → seconds; null if it isn't a clock. */
export function parseClock(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2}):?([0-5]\d)$/);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
