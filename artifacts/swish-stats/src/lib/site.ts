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
const hostOf = (url: string) => {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
};
const partnerUrl = clean(env.VITE_PARTNER_URL, "https://www.swishassistant.com").replace(/\/+$/, "");

export const SITE = {
  name: "Scorers Table",
  url: clean(env.VITE_SITE_URL, "https://scorerstable.swishassistant.com").replace(/\/+$/, ""),
  operator: clean(env.VITE_OPERATOR_NAME, "Swish Assistant"),
  operatorLegal: clean(env.VITE_OPERATOR_LEGAL, "Automated Athlete Ltd"),
  contactEmail: clean(env.VITE_CONTACT_EMAIL, "admin@swishassistant.com"),
  partnerName: clean(env.VITE_PARTNER_NAME, "Swish Assistant"),
  partnerUrl,
  /** The partner's address as people say it, e.g. swishassistant.com. */
  partnerHost: hostOf(partnerUrl),
} as const;

/**
 * Bump when the terms, the privacy policy or the sign-up tick box and key
 * points (components/signup-terms.tsx) change. It is stored with each sign-up
 * as `terms_version` and swishassistant.com copies it into its consent record,
 * so it is the record of which wording a person accepted. Keep it a plain
 * token of letters, digits, `.`, `_` and `-`, at most 64 characters.
 */
export const LEGAL_VERSION = "2026-10-draft-2";

/** Absolute address of a path in this app, for links that leave the page (emails). */
export function appUrl(path: string): string {
  const base = (import.meta.env.BASE_URL as string).replace(/\/+$/, "");
  return `${window.location.origin}${base}${path.startsWith("/") ? path : `/${path}`}`;
}
