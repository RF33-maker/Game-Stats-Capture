// Server reads: pulling the user's leagues/games onto this device, and
// managing league members (online-only — it's about other people's access).
//
// Pulled rows are applied with withoutOutbox(): they came from the server,
// so they must not be queued to be sent back.

import { supabase } from "./supabase";
import { SYNC_REMOTE_ENABLED, syncNow } from "./local-sync";
import {
  store, withoutOutbox, type LeagueRole, type LSGame, type LSStatEvent,
} from "./local-store";
import { rebuildPlayByPlay } from "./local-handler";

type Row = Record<string, any>;

async function all(table: string, build: (q: any) => any): Promise<Row[]> {
  // PostgREST caps responses at 1000 rows; page through.
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(supabase.from(table).select("*")).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

let pulling: Promise<void> | null = null;

/**
 * Bring the signed-in user's leagues and games onto this device. Rows the
 * device already has are matched by uid; local rows with unsent changes are
 * left alone (the device's version wins until it has synced).
 */
export function pullFromServer(): Promise<void> {
  if (!SYNC_REMOTE_ENABLED) return Promise.resolve();
  if (!pulling) {
    pulling = doPull().finally(() => { pulling = null; });
  }
  return pulling;
}

async function doPull() {
  // Never write into the store before the device's own data has loaded.
  await store.hydrate();
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user.id;
  if (!userId || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  // Send this device's queued changes first, so the server copy we read back
  // already includes them.
  await syncNow().catch(() => {});

  const memberships = await all("league_members", q => q.eq("user_id", userId));
  const leagueUids = memberships.map(m => m.league_uid as string);
  const leagues = leagueUids.length ? await all("leagues", q => q.in("uid", leagueUids)) : [];
  const roleOf = new Map(memberships.map(m => [m.league_uid as string, m.role as LeagueRole]));

  withoutOutbox(() => {
    for (const l of leagues) {
      const local = store.leagues.getByUid(l.uid);
      if (local) {
        store.leagues.update(local.id, {
          ...(store.outbox.hasPendingFor("leagues", l.uid) ? {} : { name: l.name, season: l.season, logoUrl: l.logo_url, siteLeagueId: l.site_league_id }),
          role: roleOf.get(l.uid) ?? local.role,
        });
      } else {
        store.leagues.create({
          uid: l.uid, name: l.name, season: l.season, logoUrl: l.logo_url, siteLeagueId: l.site_league_id,
          role: roleOf.get(l.uid) ?? "viewer", createdAt: l.created_at,
        });
      }
    }
  });

  if (!leagueUids.length) return;
  const games = await all("games", q => q.in("league_uid", leagueUids));
  for (const g of games) {
    await pullGame(g);
  }
  await store.persist();
}

async function pullGame(g: Row) {
  const local = store.games.getByUid(g.uid);
  const gameDirty = local && store.outbox.list().some(i => {
    if (i.table === "games") return i.uid === g.uid;
    return false;
  });
  const leagueId = store.leagues.getByUid(g.league_uid)?.id ?? null;

  const teams = await all("game_teams", q => q.eq("game_uid", g.uid));
  const teamUids = teams.map(t => t.uid as string);
  const players = teamUids.length ? await all("game_players", q => q.in("team_uid", teamUids)) : [];
  const events = await all("stat_events", q => q.eq("game_uid", g.uid));

  withoutOutbox(() => {
    const gameFields: Partial<LSGame> = {
      leagueId,
      competition: g.competition,
      venue: g.venue,
      date: g.game_date,
      status: g.status,
      captureMode: g.capture_mode,
      periodCount: g.period_count,
      periodDurationMins: g.period_duration_mins,
      currentPeriod: g.current_period,
      clockSeconds: g.clock_seconds,
    };
    let gameId: number;
    if (!local) {
      gameId = store.games.create({ uid: g.uid, ...gameFields }).id;
    } else {
      gameId = local.id;
      if (!gameDirty) store.games.update(gameId, gameFields);
    }

    const teamIdByUid = new Map<string, number>();
    for (const t of teams) {
      const lt = store.teams.getByUid(t.uid);
      const fields = {
        gameId, isHome: t.is_home, name: t.name, abbreviation: t.abbreviation,
        colorPrimary: t.color_primary ?? "#ea580c", colorSecondary: t.color_secondary ?? "#ffffff",
        logoUrl: t.logo_url, siteTeamId: t.site_team_id,
      };
      if (!lt) {
        if (store.outbox.hasPendingFor("game_teams", t.uid)) continue;
        teamIdByUid.set(t.uid, store.teams.create({ uid: t.uid, ...fields }).id);
      }
      else {
        teamIdByUid.set(t.uid, lt.id);
        if (!store.outbox.hasPendingFor("game_teams", t.uid)) store.teams.update(lt.id, fields);
      }
    }

    const playerIdByUid = new Map<string, number>();
    for (const p of players) {
      const lp = store.players.getByUid(p.uid);
      const teamId = teamIdByUid.get(p.team_uid);
      if (teamId == null) continue;
      const fields = {
        teamId, jerseyNumber: p.jersey_number, firstName: p.first_name, lastName: p.last_name,
        position: p.position, headshotUrl: p.headshot_url, isActive: p.is_active, isStarter: p.is_starter,
        sitePlayerId: p.site_player_id,
      };
      if (!lp) {
        // Deleted on this device but the delete hasn't reached the server yet.
        if (store.outbox.hasPendingFor("game_players", p.uid)) continue;
        playerIdByUid.set(p.uid, store.players.create({ uid: p.uid, ...fields }).id);
      }
      else {
        playerIdByUid.set(p.uid, lp.id);
        if (!store.outbox.hasPendingFor("game_players", p.uid)) store.players.update(lp.id, fields);
      }
    }

    // Events in game order; a correction shares its original's position, so
    // put originals first within a tie.
    const ordered = [...events].sort((a, b) =>
      String(a.device_created_at).localeCompare(String(b.device_created_at))
      || Number(a.device_seq) - Number(b.device_seq)
      || (a.replaces_event_uid ? 1 : 0) - (b.replaces_event_uid ? 1 : 0));

    let changed = !local;
    const created: { row: Row; ev: LSStatEvent }[] = [];
    for (const e of ordered) {
      const le = store.statEvents.getByUid(e.uid);
      if (le) {
        // Apply a void made elsewhere (e.g. an admin correction).
        if (e.voided_at && !le.voidedAt) {
          const list = store.statEvents.list();
          const i = list.findIndex(x => x.id === le.id);
          list[i] = { ...le, voidedAt: e.voided_at, voidReason: e.void_reason };
          store.statEvents.save(list);
          changed = true;
        }
        continue;
      }
      const replaced = e.replaces_event_uid ? store.statEvents.getByUid(e.replaces_event_uid) : null;
      const ev = store.statEvents.create({
        uid: e.uid,
        gameId,
        teamId: e.team_uid ? teamIdByUid.get(e.team_uid) ?? null : null,
        playerId: e.player_uid ? playerIdByUid.get(e.player_uid) ?? null : null,
        period: e.period,
        clockSeconds: e.clock_seconds,
        eventType: e.event_type,
        value: e.value,
        shotZone: e.shot_zone,
        ftSequenceIndex: e.ft_sequence_index,
        ftSequenceTotal: e.ft_sequence_total,
        possessionTeamId: null,
        pairEventId: null,
        needsReview: e.needs_review,
        replacesId: replaced?.id ?? null,
        voidedAt: e.voided_at,
        voidReason: e.void_reason,
        createdAt: e.device_created_at,
        ...(replaced ? { orderKey: replaced.orderKey } : {}),
      });
      created.push({ row: e, ev });
      changed = true;
    }
    // Second pass: substitution pairs reference each other.
    for (const { row, ev } of created) {
      if (!row.pair_event_uid) continue;
      const pair = store.statEvents.getByUid(row.pair_event_uid);
      if (pair) store.statEvents.update(ev.id, { pairEventId: pair.id });
    }

    if (changed) rebuildPlayByPlay(gameId);
  });
}

// ---------- League members (online only) ----------

export class OfflineError extends Error {
  constructor() { super("You're offline — managing members needs a connection."); }
}

function requireOnline() {
  if (typeof navigator !== "undefined" && !navigator.onLine) throw new OfflineError();
}

export async function listMembers(leagueUid: string, leagueId: number) {
  requireOnline();
  const { data, error } = await supabase.rpc("list_league_members", { p_league: leagueUid });
  if (error) throw new Error(error.message);
  return (data ?? []).map((m: Row) => ({
    leagueId,
    userId: m.user_id,
    role: m.role,
    email: m.email,
    firstName: m.first_name,
    lastName: m.last_name,
    profileImageUrl: m.avatar_url,
    createdAt: m.created_at,
  }));
}

export async function addMember(leagueUid: string, email: string, role: LeagueRole) {
  requireOnline();
  const { error } = await supabase.rpc("add_league_member", { p_league: leagueUid, p_email: email, p_role: role });
  if (error) throw new Error(error.message);
}

export async function updateMemberRole(leagueUid: string, userId: string, role: LeagueRole) {
  requireOnline();
  const { data, error } = await supabase.from("league_members")
    .update({ role }).eq("league_uid", leagueUid).eq("user_id", userId).select("user_id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Only a league admin can change roles");
}

export async function removeMember(leagueUid: string, userId: string) {
  requireOnline();
  const { data, error } = await supabase.from("league_members")
    .delete().eq("league_uid", leagueUid).eq("user_id", userId).select("user_id");
  if (error) throw new Error(error.message);
  if (!data?.length) throw new Error("Only a league admin can remove members");
}
