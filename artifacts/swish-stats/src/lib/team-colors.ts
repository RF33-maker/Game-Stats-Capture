// Team colours are picked by users, so they can be anything — including the
// same colour as the surface they're drawn on (white on the light capture
// screen, black on the dark app shell). These helpers keep team-coloured text
// readable without throwing away the team's identity when it's already fine.

export type Surface = "light" | "dark";

// Approximate surface colours: the capture screen is white / slate-50, the
// rest of the app uses --background (hsl 220 10% 8%).
const SURFACE_HEX: Record<Surface, string> = {
  light: "#ffffff",
  dark: "#111317",
};

const SURFACE_FALLBACK_TEXT: Record<Surface, string> = {
  light: "#0f172a", // slate-900
  dark: "#f8fafc", // slate-50
};

// Large, bold text (abbreviations, jersey numbers) only needs 3:1 under WCAG.
const MIN_CONTRAST = 3;

function parseHex(hex: string): [number, number, number] | null {
  const m = hex.trim().replace(/^#/, "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function luminance([r, g, b]: [number, number, number]): number {
  const [R, G, B] = [r, g, b].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

export function contrastRatio(a: string, b: string): number {
  const ra = parseHex(a);
  const rb = parseHex(b);
  if (!ra || !rb) return 21;
  const la = luminance(ra);
  const lb = luminance(rb);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Which surface the app is currently drawn on (dark by default; `.light` on <html> for bright gyms). */
export function appSurface(): Surface {
  return typeof document !== "undefined" && document.documentElement.classList.contains("light") ? "light" : "dark";
}

/** The team colour if it reads on `surface`, otherwise the surface's normal text colour. */
export function teamTextColor(color: string | null | undefined, surface: Surface): string {
  if (!color || !parseHex(color)) return SURFACE_FALLBACK_TEXT[surface];
  return contrastRatio(color, SURFACE_HEX[surface]) >= MIN_CONTRAST
    ? color
    : SURFACE_FALLBACK_TEXT[surface];
}

/** Black or white, whichever reads better on a team-coloured background. */
export function textOnColor(background: string | null | undefined): string {
  const rgb = background ? parseHex(background) : null;
  if (!rgb) return "#ffffff";
  return contrastRatio(background!, "#ffffff") >= contrastRatio(background!, "#0f172a")
    ? "#ffffff"
    : "#0f172a";
}
