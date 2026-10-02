// The Swish Organiser directory: the site's competitions, teams and players,
// so rosters can link to ids that already exist on swishassistant.com.
// Online only (it reads the shared database); offline, scorers type names and
// link afterwards.

import { supabase } from "./supabase";
import { SYNC_REMOTE_ENABLED } from "./local-sync";

export type SiteCompetition = {
  competitionId: string;
  name: string;
  season: string | null;
  ageGroup: string | null;
  gender: string | null;
  division: string | null;
  organisation: string | null;
  logoUrl: string | null;
  teamCount: number;
  playerCount: number;
};

export type SiteTeam = {
  teamId: string;
  name: string;
  logoUrl: string | null;
  competitionId: string;
  competitionName: string;
  season: string | null;
  ageGroup: string | null;
  playerCount: number;
};

export type SitePlayer = {
  playerId: string;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  shirtNumber: string | null;
  position: string | null;
  photoUrl: string | null;
  teamId: string | null;
  teamName: string | null;
  competitionId: string;
  competitionName: string;
  season: string | null;
  ageGroup: string | null;
  otherRows: number;
};

export const DIRECTORY_AVAILABLE = SYNC_REMOTE_ENABLED;

export class DirectoryOfflineError extends Error {
  constructor() { super("The player directory needs a connection — type the name for now and link it later."); }
}

function requireOnline() {
  if (!DIRECTORY_AVAILABLE) throw new Error("The player directory isn't available in local mode.");
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new DirectoryOfflineError();
}

const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/$/, "");

function photoUrl(path: string | null): string | null {
  if (!path) return null;
  if (/^https?:\/\//.test(path)) return path;
  return SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/object/public/player-photos/${path}` : null;
}

type Row = Record<string, any>;

export async function searchCompetitions(query: string, limit = 20): Promise<SiteCompetition[]> {
  requireOnline();
  const { data, error } = await supabase.rpc("search_site_competitions", { p_query: query || null, p_limit: limit });
  if (error) throw new Error(error.message);
  return (data as Row[] ?? []).map(r => ({
    competitionId: r.competition_id, name: r.name, season: r.season, ageGroup: r.age_group,
    gender: r.gender, division: r.division, organisation: r.organisation, logoUrl: r.logo_url,
    teamCount: Number(r.team_count), playerCount: Number(r.player_count),
  }));
}

export async function searchTeams(query: string, competitionId?: string | null, limit = 20): Promise<SiteTeam[]> {
  requireOnline();
  const { data, error } = await supabase.rpc("search_site_teams", {
    p_query: query || null, p_competition: competitionId ?? null, p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return (data as Row[] ?? []).map(r => ({
    teamId: r.team_id, name: r.name, logoUrl: r.logo_url, competitionId: r.competition_id,
    competitionName: r.competition_name, season: r.season, ageGroup: r.age_group,
    playerCount: Number(r.player_count),
  }));
}

export async function searchPlayers(
  query: string,
  opts: { competitionId?: string | null; teamId?: string | null; limit?: number } = {},
): Promise<SitePlayer[]> {
  requireOnline();
  const { data, error } = await supabase.rpc("search_site_players", {
    p_query: query || null,
    p_competition: opts.competitionId ?? null,
    p_team: opts.teamId ?? null,
    p_limit: opts.limit ?? 25,
  });
  if (error) throw new Error(error.message);
  return (data as Row[] ?? []).map(r => ({
    playerId: r.player_id, fullName: r.full_name, firstName: r.first_name, lastName: r.last_name,
    shirtNumber: r.shirt_number, position: r.player_position, photoUrl: photoUrl(r.photo_path),
    teamId: r.team_id, teamName: r.team_name, competitionId: r.competition_id,
    competitionName: r.competition_name, season: r.season, ageGroup: r.age_group,
    otherRows: Number(r.other_rows),
  }));
}

/** Split a site player's name into first / last for a roster row. */
export function splitName(p: SitePlayer): { firstName: string; lastName: string } {
  if (p.firstName || p.lastName) return { firstName: p.firstName ?? "", lastName: p.lastName ?? "" };
  const parts = p.fullName.trim().split(/\s+/);
  return { firstName: parts.slice(0, -1).join(" ") || parts[0] || "", lastName: parts.length > 1 ? parts[parts.length - 1] : "" };
}

/**
 * Site rosters often hold the same person twice — once as "D. Akar", once as
 * "Danyal Akar" (different scraped sources). Collapse rows that share a shirt
 * number and surname where one first name is just the other's initial,
 * keeping the fuller name.
 */
export function dedupeRoster(players: SitePlayer[]): SitePlayer[] {
  const isInitial = (f: string) => /^[A-Za-z]\.?$/.test(f.trim());
  const kept: SitePlayer[] = [];
  for (const p of players) {
    const { firstName, lastName } = splitName(p);
    const dupIndex = kept.findIndex(k => {
      const kn = splitName(k);
      if ((k.shirtNumber ?? "") !== (p.shirtNumber ?? "")) return false;
      if (kn.lastName.trim().toLowerCase() !== lastName.trim().toLowerCase()) return false;
      const a = kn.firstName.trim(), b = firstName.trim();
      if (!a || !b) return true;
      if (a.toLowerCase() === b.toLowerCase()) return true;
      return (isInitial(a) || isInitial(b)) && a[0].toLowerCase() === b[0].toLowerCase();
    });
    if (dupIndex === -1) kept.push(p);
    else if (splitName(p).firstName.length > splitName(kept[dupIndex]).firstName.length) kept[dupIndex] = p;
  }
  return kept;
}

/** Plain JSON call into the app's local API (for fields the generated client doesn't know about). */
export async function localApi<T = unknown>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(path, { method, body: body === undefined ? undefined : JSON.stringify(body) });
  const json = res.status === 204 ? null : await res.json();
  if (!res.ok) throw new Error((json as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
  return json as T;
}
