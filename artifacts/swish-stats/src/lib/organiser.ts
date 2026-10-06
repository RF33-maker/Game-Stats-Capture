// League organiser data: the season's teams and squads, venues, team
// managers, fixtures, game codes and officials.
//
// This is setup work done at a desk, so it talks to the server directly
// (online only). Game-day capture never depends on it: creating a fixture
// copies teams, rosters and rules into the game, which then lives on the
// device like any other.

import { supabase } from "./supabase";
import { SYNC_REMOTE_ENABLED } from "./local-sync";
import { pullFromServer } from "./remote";

export const ORGANISER_AVAILABLE = SYNC_REMOTE_ENABLED;

type Row = Record<string, any>;

export class OrganiserOfflineError extends Error {
  constructor() { super("You're offline — league setup needs a connection."); }
}

function requireOnline() {
  if (!ORGANISER_AVAILABLE) throw new Error("League setup isn't available in local mode — sign in to use it.");
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new OrganiserOfflineError();
}

function check<T>(res: { data: T; error: { message: string; code?: string } | null }): T {
  if (res.error) {
    if (res.error.code === "23505") throw new Error("That name is already used in this league.");
    throw new Error(res.error.message);
  }
  return res.data;
}

/** A write that row-level security refused comes back as zero rows, not an error. */
function mustChange(rows: unknown[] | null, what: string) {
  if (!rows?.length) throw new Error(`You don't have permission to ${what}.`);
}

// ---------- Teams ----------

export type LeagueTeam = {
  uid: string;
  leagueUid: string;
  name: string;
  abbreviation: string;
  colorPrimary: string | null;
  colorSecondary: string | null;
  logoUrl: string | null;
  siteTeamId: string | null;
  headCoach: string | null;
  assistantCoach: string | null;
  squadCount: number;
};

function toTeam(r: Row): LeagueTeam {
  return {
    uid: r.uid, leagueUid: r.league_uid, name: r.name, abbreviation: r.abbreviation ?? "",
    colorPrimary: r.color_primary, colorSecondary: r.color_secondary, logoUrl: r.logo_url,
    siteTeamId: r.site_team_id, headCoach: r.head_coach, assistantCoach: r.assistant_coach,
    squadCount: Number(r.squad_players?.[0]?.count ?? 0),
  };
}

export async function listLeagueTeams(leagueUid: string): Promise<LeagueTeam[]> {
  requireOnline();
  const rows = check(await supabase.from("league_teams")
    .select("*, squad_players(count)").eq("league_uid", leagueUid).order("name"));
  return (rows as Row[] ?? []).map(toTeam);
}

export type LeagueTeamInput = Partial<Omit<LeagueTeam, "uid" | "leagueUid" | "squadCount">> & { name: string };

function teamRow(input: Partial<LeagueTeamInput>) {
  const row: Row = {};
  if (input.name !== undefined) row.name = input.name.trim();
  if (input.abbreviation !== undefined) row.abbreviation = input.abbreviation.trim().toUpperCase().slice(0, 6);
  if (input.colorPrimary !== undefined) row.color_primary = input.colorPrimary;
  if (input.colorSecondary !== undefined) row.color_secondary = input.colorSecondary;
  if (input.logoUrl !== undefined) row.logo_url = input.logoUrl;
  if (input.siteTeamId !== undefined) row.site_team_id = input.siteTeamId;
  if (input.headCoach !== undefined) row.head_coach = input.headCoach?.trim() || null;
  if (input.assistantCoach !== undefined) row.assistant_coach = input.assistantCoach?.trim() || null;
  return row;
}

export async function createLeagueTeam(leagueUid: string, input: LeagueTeamInput): Promise<LeagueTeam> {
  requireOnline();
  const rows = check(await supabase.from("league_teams")
    .insert({ league_uid: leagueUid, ...teamRow(input) }).select("*"));
  return toTeam((rows as Row[])[0]);
}

export async function updateLeagueTeam(uid: string, input: Partial<LeagueTeamInput>): Promise<void> {
  requireOnline();
  mustChange(check(await supabase.from("league_teams").update(teamRow(input)).eq("uid", uid).select("uid")), "edit this team");
}

export async function deleteLeagueTeam(uid: string): Promise<void> {
  requireOnline();
  mustChange(check(await supabase.from("league_teams").delete().eq("uid", uid).select("uid")), "delete this team");
}

// ---------- Squads ----------

export type SquadPlayer = {
  uid: string;
  leagueTeamUid: string;
  jerseyNumber: string;
  firstName: string;
  lastName: string;
  position: string | null;
  headshotUrl: string | null;
  sitePlayerId: string | null;
  isActive: boolean;
};

export type SquadPlayerInput = Partial<Omit<SquadPlayer, "uid" | "leagueTeamUid">>;

function toSquad(r: Row): SquadPlayer {
  return {
    uid: r.uid, leagueTeamUid: r.league_team_uid, jerseyNumber: r.jersey_number ?? "",
    firstName: r.first_name ?? "", lastName: r.last_name ?? "", position: r.position,
    headshotUrl: r.headshot_url, sitePlayerId: r.site_player_id, isActive: r.is_active,
  };
}

function squadRow(input: SquadPlayerInput) {
  const row: Row = {};
  if (input.jerseyNumber !== undefined) row.jersey_number = input.jerseyNumber.trim().slice(0, 4);
  if (input.firstName !== undefined) row.first_name = input.firstName.trim();
  if (input.lastName !== undefined) row.last_name = input.lastName.trim();
  if (input.position !== undefined) row.position = input.position?.trim() || null;
  if (input.headshotUrl !== undefined) row.headshot_url = input.headshotUrl;
  if (input.sitePlayerId !== undefined) row.site_player_id = input.sitePlayerId;
  if (input.isActive !== undefined) row.is_active = input.isActive;
  return row;
}

/** Jersey numbers sort as numbers ("4" before "10"), blanks last. */
export function byJersey(a: { jerseyNumber: string; lastName: string }, b: { jerseyNumber: string; lastName: string }) {
  const na = a.jerseyNumber === "" ? 1000 : Number(a.jerseyNumber);
  const nb = b.jerseyNumber === "" ? 1000 : Number(b.jerseyNumber);
  return (Number.isNaN(na) ? 999 : na) - (Number.isNaN(nb) ? 999 : nb) || a.lastName.localeCompare(b.lastName);
}

export async function listSquad(leagueTeamUid: string): Promise<SquadPlayer[]> {
  requireOnline();
  const rows = check(await supabase.from("squad_players").select("*").eq("league_team_uid", leagueTeamUid));
  return (rows as Row[] ?? []).map(toSquad).sort(byJersey);
}

export async function addSquadPlayers(leagueTeamUid: string, players: SquadPlayerInput[]): Promise<void> {
  requireOnline();
  if (!players.length) return;
  check(await supabase.from("squad_players")
    .insert(players.map(p => ({ league_team_uid: leagueTeamUid, ...squadRow(p) }))).select("uid"));
}

export async function updateSquadPlayer(uid: string, input: SquadPlayerInput): Promise<void> {
  requireOnline();
  mustChange(check(await supabase.from("squad_players").update(squadRow(input)).eq("uid", uid).select("uid")), "edit this squad");
}

export async function deleteSquadPlayer(uid: string): Promise<void> {
  requireOnline();
  mustChange(check(await supabase.from("squad_players").delete().eq("uid", uid).select("uid")), "edit this squad");
}

// ---------- Team managers ----------

export type AccessEntry = { userId: string; email: string | null; viaCode?: boolean; createdAt: string };

export async function listTeamManagers(leagueTeamUid: string): Promise<AccessEntry[]> {
  requireOnline();
  const rows = check(await supabase.rpc("list_team_managers", { p_league_team: leagueTeamUid }));
  return (rows as Row[] ?? []).map(r => ({ userId: r.user_id, email: r.email, createdAt: r.created_at }));
}

export async function addTeamManager(leagueTeamUid: string, email: string): Promise<void> {
  requireOnline();
  check(await supabase.rpc("add_team_manager", { p_league_team: leagueTeamUid, p_email: email }));
}

export async function removeTeamManager(leagueTeamUid: string, userId: string): Promise<void> {
  requireOnline();
  mustChange(check(await supabase.from("team_managers").delete()
    .eq("league_team_uid", leagueTeamUid).eq("user_id", userId).select("user_id")), "remove team managers");
}

/** The league teams the signed-in user manages (empty for most people). */
export async function myManagedTeamUids(): Promise<Set<string>> {
  if (!ORGANISER_AVAILABLE || (typeof navigator !== "undefined" && !navigator.onLine)) return new Set();
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId) return new Set();
  const { data } = await supabase.from("team_managers").select("league_team_uid").eq("user_id", userId);
  return new Set((data ?? []).map((r: Row) => r.league_team_uid as string));
}

// ---------- Venues ----------

export type Venue = { uid: string; name: string; address: string | null };

export async function listVenues(leagueUid: string): Promise<Venue[]> {
  requireOnline();
  const rows = check(await supabase.from("venues").select("*").eq("league_uid", leagueUid).order("name"));
  return (rows as Row[] ?? []).map(r => ({ uid: r.uid, name: r.name, address: r.address }));
}

export async function saveVenue(leagueUid: string, venue: { uid?: string; name: string; address?: string | null }): Promise<void> {
  requireOnline();
  const row = { name: venue.name.trim(), address: venue.address?.trim() || null };
  if (venue.uid) {
    mustChange(check(await supabase.from("venues").update(row).eq("uid", venue.uid).select("uid")), "edit venues");
  } else {
    check(await supabase.from("venues").insert({ league_uid: leagueUid, ...row }).select("uid"));
  }
}

export async function deleteVenue(uid: string): Promise<void> {
  requireOnline();
  mustChange(check(await supabase.from("venues").delete().eq("uid", uid).select("uid")), "delete venues");
}

// ---------- Fixtures ----------

export type FixtureInput = {
  homeUid: string;
  awayUid: string;
  date: string;            // yyyy-mm-dd
  time?: string | null;    // HH:mm
  venueUid?: string | null;
  round?: string | null;
  number?: number | null;
};

/** Create fixtures on the server, then bring them (with rosters and codes) onto this device. */
export async function createFixtures(leagueUid: string, fixtures: FixtureInput[]): Promise<number> {
  requireOnline();
  let made = 0;
  try {
    for (const f of fixtures) {
      check(await supabase.rpc("create_fixture", {
        p_league: leagueUid, p_home: f.homeUid, p_away: f.awayUid, p_date: f.date,
        p_time: f.time || null, p_venue: f.venueUid || null, p_round: f.round || null, p_number: f.number ?? null,
      }));
      made++;
    }
  } finally {
    if (made) await pullFromServer();
  }
  return made;
}

/**
 * Round-robin pairings (circle method). Every team meets every other once
 * per leg; in the second leg home and away swap. With an odd number of
 * teams one sits out each round.
 */
export function roundRobin<T>(teams: T[], legs: 1 | 2 = 1): { round: number; home: T; away: T }[] {
  const list: (T | null)[] = [...teams];
  if (list.length % 2) list.push(null);
  const n = list.length;
  const out: { round: number; home: T; away: T }[] = [];
  if (n < 2) return out;
  const rounds = n - 1;
  for (let leg = 0; leg < legs; leg++) {
    const arr = [...list];
    for (let r = 0; r < rounds; r++) {
      for (let i = 0; i < n / 2; i++) {
        const a = arr[i], b = arr[n - 1 - i];
        if (a == null || b == null) continue;
        // Alternate who hosts so nobody gets a long run at home.
        const flip = (i === 0 ? r % 2 === 1 : i % 2 === 1) !== (leg === 1);
        out.push({ round: leg * rounds + r + 1, home: flip ? b : a, away: flip ? a : b });
      }
      arr.splice(1, 0, arr.pop()!);
    }
  }
  return out;
}

// ---------- Game access: codes and scorers ----------

export async function joinGameByCode(code: string): Promise<string> {
  requireOnline();
  const res = await supabase.rpc("join_game_by_code", { p_code: code });
  if (res.error) throw new Error(res.error.message);
  await pullFromServer();
  return res.data as string;
}

export async function listGameScorers(gameUid: string): Promise<AccessEntry[]> {
  requireOnline();
  const rows = check(await supabase.rpc("list_game_scorers", { p_game: gameUid }));
  return (rows as Row[] ?? []).map(r => ({ userId: r.user_id, email: r.email, viaCode: r.via_code, createdAt: r.created_at }));
}

export async function removeGameScorer(gameUid: string, userId: string): Promise<void> {
  requireOnline();
  mustChange(check(await supabase.from("game_scorers").delete()
    .eq("game_uid", gameUid).eq("user_id", userId).select("user_id")), "remove scorers");
}

/** The game's code, straight from the server (for a game this device made itself). */
export async function fetchGameCode(gameUid: string): Promise<string | null> {
  requireOnline();
  const { data } = await supabase.from("games").select("game_code").eq("uid", gameUid).maybeSingle();
  return (data as Row | null)?.game_code ?? null;
}

// ---------- Officials ----------

export const OFFICIAL_ROLES = [
  ["crew_chief", "Crew chief"],
  ["umpire", "Umpire"],
  ["commissioner", "Commissioner"],
  ["scorer", "Scorer"],
  ["assistant_scorer", "Assistant scorer"],
  ["timer", "Timer"],
  ["shot_clock", "Shot clock operator"],
  ["statistician", "Statistician"],
] as const;
export type OfficialRole = typeof OFFICIAL_ROLES[number][0];
export type Official = { uid: string; role: OfficialRole; name: string };

export function officialRoleName(role: string) {
  return OFFICIAL_ROLES.find(r => r[0] === role)?.[1] ?? role;
}

export async function listOfficials(gameUid: string): Promise<Official[]> {
  requireOnline();
  const rows = check(await supabase.from("game_officials").select("*").eq("game_uid", gameUid).order("created_at"));
  const order = OFFICIAL_ROLES.map(r => r[0] as string);
  return (rows as Row[] ?? []).map(r => ({ uid: r.uid, role: r.role, name: r.name }))
    .sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role));
}

/**
 * Add an official. Resolves with the other games on the same date that
 * already list someone of that name — a likely double booking.
 */
export async function addOfficial(gameUid: string, role: OfficialRole, name: string, gameDate?: string): Promise<string[]> {
  requireOnline();
  const clean = name.trim();
  check(await supabase.from("game_officials").insert({ game_uid: gameUid, role, name: clean }).select("uid"));
  if (!gameDate) return [];
  const { data } = await supabase.from("game_officials")
    .select("name, games!inner(uid, game_date, tipoff_time, competition, round_label)")
    .ilike("name", clean).eq("games.game_date", gameDate.slice(0, 10)).neq("game_uid", gameUid);
  return (data as Row[] ?? []).map(r => {
    const g = r.games as Row;
    return [g.round_label, g.tipoff_time?.slice(0, 5)].filter(Boolean).join(" · ") || "another game";
  });
}

export async function removeOfficial(uid: string): Promise<void> {
  requireOnline();
  mustChange(check(await supabase.from("game_officials").delete().eq("uid", uid).select("uid")), "edit officials");
}
