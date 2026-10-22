// Who the product is and where it lives. Everything a new owner or a new
// domain would change is read from here (or from the build environment) so it
// is never hunted down in the screens.
//
// Build-time overrides (all optional; see .env.example):
//   VITE_SITE_URL         public address, e.g. https://scorers.example.com
//   VITE_OPERATOR_NAME    name shown in footers and legal pages
//   VITE_OPERATOR_LEGAL   registered company name used in the legal pages
//   VITE_CONTACT_EMAIL    support / privacy contact
//   VITE_PARTNER_URL      the site games are published to
//   VITE_PARTNER_NAME     its name

const env = import.meta.env;
const clean = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() ? v.trim() : fallback);

export const SITE = {
  name: "Scorers Table",
  url: clean(env.VITE_SITE_URL, "https://scorerstable.swishassistant.com").replace(/\/+$/, ""),
  operator: clean(env.VITE_OPERATOR_NAME, "Swish Assistant"),
  operatorLegal: clean(env.VITE_OPERATOR_LEGAL, "Automated Athlete Ltd"),
  contactEmail: clean(env.VITE_CONTACT_EMAIL, "admin@swishassistant.com"),
  partnerName: clean(env.VITE_PARTNER_NAME, "Swish Assistant"),
  partnerUrl: clean(env.VITE_PARTNER_URL, "https://www.swishassistant.com").replace(/\/+$/, ""),
} as const;

/** Bump when the terms or privacy text change; stored with each sign-up. */
export const LEGAL_VERSION = "2026-10-draft-1";

/** Absolute address of a path in this app, for links that leave the page (emails). */
export function appUrl(path: string): string {
  const base = (import.meta.env.BASE_URL as string).replace(/\/+$/, "");
  return `${window.location.origin}${base}${path.startsWith("/") ? path : `/${path}`}`;
}
