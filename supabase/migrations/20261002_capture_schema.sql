-- Swish Stats capture backend — schema `capture`
--
-- Purely additive. Nothing in `public` is created, altered, dropped or
-- re-granted, and there are no foreign keys into `public` (those would add
-- checks to live site tables). Links to the site's leagues / teams / players
-- are plain uuid columns, filled in by the linking work later.
-- public.is_app_admin() is only *called*, never changed.
--
-- Model
--   • Every row's primary key is a uuid generated on the scoring device, so a
--     replayed offline queue upserts the same rows instead of duplicating.
--   • stat_events are append-only: corrections are new rows
--     (replaces_event_uid) and mistakes are voided (voided_at), never edited
--     or deleted. A trigger enforces this.
--   • While a game is live, scorers can void/replace events. Once it is
--     final, only a league admin (or app admin) can change game data.
--   • Names / numbers / site links on rosters stay editable at any time.
--   • Every change is written to capture.audit_log by trigger.
--
-- Access: signed-in users only (anon gets nothing), row-level security on
-- every table, roles per league: viewer < scorer < admin.

create schema if not exists capture;

revoke all on schema capture from public, anon;
grant usage on schema capture to authenticated, service_role;

create type capture.league_role as enum ('viewer', 'scorer', 'admin');

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table capture.leagues (
  uid            uuid primary key,
  name           text not null check (length(btrim(name)) between 1 and 120),
  season         text,
  logo_url       text,
  site_league_id uuid,                 -- public.leagues.id once linked (no FK on purpose)
  created_by     uuid default auth.uid() references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table capture.league_members (
  league_uid uuid not null references capture.leagues(uid) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       capture.league_role not null,
  added_by   uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (league_uid, user_id)
);
create index league_members_user_idx on capture.league_members (user_id);

create table capture.games (
  uid                    uuid primary key,
  league_uid             uuid not null references capture.leagues(uid) on delete restrict,
  status                 text not null default 'setup' check (status in ('setup', 'active', 'final')),
  capture_mode           text not null default 'complex' check (capture_mode in ('complex', 'simple')),
  competition            text,
  venue                  text,
  game_date              date not null default current_date,
  period_count           int  not null default 4  check (period_count between 1 and 8),
  period_duration_mins   int  not null default 10 check (period_duration_mins between 1 and 60),
  overtime_duration_mins int  not null default 5  check (overtime_duration_mins between 1 and 30),
  current_period         int  not null default 1  check (current_period between 1 and 20),
  clock_seconds          int  not null default 600 check (clock_seconds between 0 and 3600),
  finalized_at           timestamptz,
  finalized_by           uuid references auth.users(id) on delete set null,
  site_game_key          text,          -- game_key on the site once published
  created_by             uuid default auth.uid() references auth.users(id) on delete set null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);
create index games_league_idx on capture.games (league_uid, game_date desc);

create table capture.game_teams (
  uid             uuid primary key,
  game_uid        uuid not null references capture.games(uid) on delete cascade,
  is_home         boolean not null,
  name            text not null default '',
  abbreviation    text not null default '' check (length(abbreviation) <= 6),
  color_primary   text,
  color_secondary text,
  logo_url        text,
  site_team_id    uuid,                 -- public.teams.team_id once linked
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (game_uid, is_home)
);

create table capture.game_players (
  uid            uuid primary key,
  team_uid       uuid not null references capture.game_teams(uid) on delete cascade,
  jersey_number  text not null default '' check (length(jersey_number) <= 4),
  first_name     text not null default '',
  last_name      text not null default '',
  position       text,
  headshot_url   text,
  is_starter     boolean not null default false,
  is_active      boolean not null default true,
  site_player_id uuid,                  -- public.players.id once linked
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index game_players_team_idx on capture.game_players (team_uid);

create table capture.stat_events (
  uid                uuid primary key,
  game_uid           uuid not null references capture.games(uid) on delete cascade,
  team_uid           uuid references capture.game_teams(uid),
  player_uid         uuid references capture.game_players(uid),
  period             int  not null check (period between 1 and 20),
  clock_seconds      int  not null check (clock_seconds between 0 and 3600),
  event_type         text not null check (event_type in (
                       '2ptm','2pta','2ptb','3ptm','3pta','3ptb','ftm','fta',
                       'oreb','dreb','ast','stl','tov','blk','pf','tf','flagrant','fd',
                       'plus','minus','sub_in','sub_out','timeout',
                       'period_start','period_end','jump_ball')),
  value              int  not null default 0,
  shot_zone          text check (length(shot_zone) <= 40),
  ft_sequence_index  int,
  ft_sequence_total  int,
  pair_event_uid     uuid,              -- sub_in <-> sub_out pair (no FK: pair rows can arrive in either order)
  replaces_event_uid uuid references capture.stat_events(uid),
  needs_review       boolean not null default false,
  device_created_at  timestamptz not null,   -- when the scorer tapped
  device_seq         bigint not null,        -- per-device order, breaks timestamp ties
  created_by         uuid default auth.uid() references auth.users(id) on delete set null,
  created_at         timestamptz not null default now(),  -- when it reached the server
  voided_at          timestamptz,
  voided_by          uuid references auth.users(id) on delete set null,
  void_reason        text
);
create index stat_events_game_idx on capture.stat_events (game_uid, device_created_at, device_seq);
create index stat_events_player_idx on capture.stat_events (player_uid);
create index stat_events_replaces_idx on capture.stat_events (replaces_event_uid);

create table capture.correction_requests (
  uid            uuid primary key default gen_random_uuid(),
  game_uid       uuid not null references capture.games(uid) on delete cascade,
  stat_event_uid uuid references capture.stat_events(uid),
  description    text not null check (length(btrim(description)) between 1 and 2000),
  proposed       jsonb,               -- e.g. {"void": true} or {"event_type": "3ptm", "player_uid": "..."}
  status         text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'applied')),
  requested_by   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  requested_at   timestamptz not null default now(),
  reviewed_by    uuid references auth.users(id) on delete set null,
  reviewed_at    timestamptz,
  review_note    text
);
create index correction_requests_game_idx on capture.correction_requests (game_uid, status);

create table capture.audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  actor      uuid,
  league_uid uuid,
  game_uid   uuid,
  table_name text not null,
  row_uid    text not null,
  action     text not null check (action in ('insert', 'update', 'delete')),
  old_row    jsonb,
  new_row    jsonb
);
create index audit_log_league_idx on capture.audit_log (league_uid, at desc);
create index audit_log_game_idx on capture.audit_log (game_uid, at desc);

-- ---------------------------------------------------------------------------
-- Permission helpers (security definer so policies don't recurse through RLS)
-- ---------------------------------------------------------------------------

create function capture.has_league_role(p_league uuid, p_min capture.league_role)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from capture.league_members m
    where m.league_uid = p_league and m.user_id = auth.uid() and m.role >= p_min
  ) or coalesce(public.is_app_admin(), false);
$$;

create function capture.game_league(p_game uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select league_uid from capture.games where uid = p_game; $$;

create function capture.team_game(p_team uuid)
returns uuid
language sql stable security definer set search_path = ''
as $$ select game_uid from capture.game_teams where uid = p_team; $$;

-- Live game: scorers may change events. Final game: league admins only.
create function capture.can_change_game_data(p_game uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from capture.games g
    where g.uid = p_game
      and (
        (g.status <> 'final' and capture.has_league_role(g.league_uid, 'scorer'))
        or capture.has_league_role(g.league_uid, 'admin')
      )
  );
$$;

revoke all on function capture.has_league_role(uuid, capture.league_role) from public, anon;
revoke all on function capture.game_league(uuid) from public, anon;
revoke all on function capture.team_game(uuid) from public, anon;
revoke all on function capture.can_change_game_data(uuid) from public, anon;
grant execute on function capture.has_league_role(uuid, capture.league_role) to authenticated;
grant execute on function capture.game_league(uuid) to authenticated;
grant execute on function capture.team_game(uuid) to authenticated;
grant execute on function capture.can_change_game_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Integrity triggers
-- ---------------------------------------------------------------------------

create function capture.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$ begin new.updated_at := now(); return new; end; $$;

create trigger leagues_touch before update on capture.leagues
  for each row execute function capture.touch_updated_at();
create trigger games_touch before update on capture.games
  for each row execute function capture.touch_updated_at();
create trigger game_teams_touch before update on capture.game_teams
  for each row execute function capture.touch_updated_at();
create trigger game_players_touch before update on capture.game_players
  for each row execute function capture.touch_updated_at();

-- Whoever creates a league becomes its admin.
create function capture.add_creator_as_admin()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if auth.uid() is not null then
    insert into capture.league_members (league_uid, user_id, role, added_by)
    values (new.uid, auth.uid(), 'admin', auth.uid())
    on conflict (league_uid, user_id) do update set role = 'admin';
  end if;
  return new;
end;
$$;
create trigger leagues_creator_admin after insert on capture.leagues
  for each row execute function capture.add_creator_as_admin();

-- A final game is locked to admins; finalising stamps who and when.
create function capture.guard_game_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  -- Server-side jobs (e.g. publishing to the site) run as postgres/service_role.
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if old.status = 'final' and not capture.has_league_role(old.league_uid, 'admin') then
    raise exception 'Game is final — only a league admin can change it'
      using errcode = '42501';
  end if;
  if new.league_uid <> old.league_uid then
    raise exception 'A game cannot move between leagues' using errcode = '42501';
  end if;
  if new.status = 'final' and old.status <> 'final' then
    new.finalized_at := now();
    new.finalized_by := auth.uid();
  end if;
  return new;
end;
$$;
create trigger games_guard before update on capture.games
  for each row execute function capture.guard_game_update();

-- stat_events are append-only. The only changes allowed after insert are
-- voiding (once, never undone) and the advisory needs_review flag.
create function capture.guard_stat_event_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (new.uid, new.game_uid, new.team_uid, new.player_uid, new.period, new.clock_seconds,
      new.event_type, new.value, new.shot_zone, new.ft_sequence_index, new.ft_sequence_total,
      new.pair_event_uid, new.replaces_event_uid, new.device_created_at, new.device_seq,
      new.created_by, new.created_at)
     is distinct from
     (old.uid, old.game_uid, old.team_uid, old.player_uid, old.period, old.clock_seconds,
      old.event_type, old.value, old.shot_zone, old.ft_sequence_index, old.ft_sequence_total,
      old.pair_event_uid, old.replaces_event_uid, old.device_created_at, old.device_seq,
      old.created_by, old.created_at)
  then
    raise exception 'Stat events cannot be edited — void it and record a replacement'
      using errcode = '42501';
  end if;
  if old.voided_at is not null and (new.voided_at is distinct from old.voided_at
       or new.voided_by is distinct from old.voided_by
       or new.void_reason is distinct from old.void_reason) then
    raise exception 'A voided stat event cannot be un-voided or re-voided'
      using errcode = '42501';
  end if;
  if new.voided_at is not null and old.voided_at is null then
    new.voided_by := auth.uid();
  end if;
  return new;
end;
$$;
create trigger stat_events_guard before update on capture.stat_events
  for each row execute function capture.guard_stat_event_update();

-- Team/player references on an event must belong to the same game.
create function capture.check_stat_event_refs()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.team_uid is not null
     and (select game_uid from capture.game_teams where uid = new.team_uid) is distinct from new.game_uid then
    raise exception 'team_uid belongs to a different game';
  end if;
  if new.player_uid is not null and not exists (
       select 1 from capture.game_players p join capture.game_teams t on t.uid = p.team_uid
       where p.uid = new.player_uid and t.game_uid = new.game_uid) then
    raise exception 'player_uid belongs to a different game';
  end if;
  if new.replaces_event_uid is not null and not exists (
       select 1 from capture.stat_events e
       where e.uid = new.replaces_event_uid and e.game_uid = new.game_uid) then
    raise exception 'replaces_event_uid belongs to a different game';
  end if;
  return new;
end;
$$;
create trigger stat_events_refs before insert on capture.stat_events
  for each row execute function capture.check_stat_event_refs();

-- Only league admins review correction requests; requesters can't edit them.
create function capture.guard_correction_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if current_user in ('postgres', 'service_role', 'supabase_admin') then
    return new;
  end if;
  if not capture.has_league_role(capture.game_league(old.game_uid), 'admin') then
    raise exception 'Only a league admin can review correction requests'
      using errcode = '42501';
  end if;
  if (new.uid, new.game_uid, new.stat_event_uid, new.description, new.proposed, new.requested_by, new.requested_at)
     is distinct from
     (old.uid, old.game_uid, old.stat_event_uid, old.description, old.proposed, old.requested_by, old.requested_at) then
    raise exception 'A correction request cannot be rewritten — create a new one'
      using errcode = '42501';
  end if;
  if new.status is distinct from old.status then
    new.reviewed_by := auth.uid();
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;
create trigger correction_requests_guard before update on capture.correction_requests
  for each row execute function capture.guard_correction_update();

-- ---------------------------------------------------------------------------
-- Audit trail
-- ---------------------------------------------------------------------------

create function capture.write_audit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  r          jsonb := to_jsonb(coalesce(new, old));
  v_game     uuid;
  v_league   uuid;
  v_row_uid  text;
begin
  -- Plain event inserts are the data itself (created_by/created_at on the
  -- row); clock ticks are not game data. Everything else is audited.
  -- (Read fields via jsonb: plpgsql would fail resolving new.<col> on
  -- tables that don't have that column.)
  if tg_table_name = 'stat_events' and tg_op = 'INSERT' then
    if (r->>'replaces_event_uid') is null then
      return null;
    end if;
  end if;
  if tg_table_name = 'games' and tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'clock_seconds' - 'current_period' - 'updated_at')
     = (to_jsonb(old) - 'clock_seconds' - 'current_period' - 'updated_at') then
      return null;
    end if;
  end if;

  case tg_table_name
    when 'leagues'        then v_league := (r->>'uid')::uuid;
    when 'league_members' then v_league := (r->>'league_uid')::uuid;
    when 'games'          then v_game := (r->>'uid')::uuid; v_league := (r->>'league_uid')::uuid;
    when 'game_teams'     then v_game := (r->>'game_uid')::uuid;
    when 'game_players'   then v_game := capture.team_game((r->>'team_uid')::uuid);
    else                       v_game := (r->>'game_uid')::uuid;
  end case;
  if v_league is null and v_game is not null then
    v_league := capture.game_league(v_game);
  end if;

  v_row_uid := coalesce(r->>'uid', (r->>'league_uid') || ':' || (r->>'user_id'));

  insert into capture.audit_log (actor, league_uid, game_uid, table_name, row_uid, action, old_row, new_row)
  values (auth.uid(), v_league, v_game, tg_table_name, v_row_uid, lower(tg_op),
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return null;
end;
$$;

create trigger leagues_audit        after insert or update or delete on capture.leagues             for each row execute function capture.write_audit();
create trigger league_members_audit after insert or update or delete on capture.league_members      for each row execute function capture.write_audit();
create trigger games_audit          after insert or update or delete on capture.games               for each row execute function capture.write_audit();
create trigger game_teams_audit     after insert or update or delete on capture.game_teams          for each row execute function capture.write_audit();
create trigger game_players_audit   after insert or update or delete on capture.game_players        for each row execute function capture.write_audit();
create trigger stat_events_audit    after insert or update or delete on capture.stat_events         for each row execute function capture.write_audit();
create trigger corrections_audit    after insert or update or delete on capture.correction_requests for each row execute function capture.write_audit();

-- ---------------------------------------------------------------------------
-- Adding members by email (admins only)
-- ---------------------------------------------------------------------------

create function capture.add_league_member(p_league uuid, p_email text, p_role capture.league_role)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid;
begin
  if not capture.has_league_role(p_league, 'admin') then
    raise exception 'Only a league admin can add members' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'No Swish account uses that email yet — ask them to sign up first'
      using errcode = 'P0002';
  end if;
  insert into capture.league_members (league_uid, user_id, role, added_by)
  values (p_league, v_user, p_role, auth.uid())
  on conflict (league_uid, user_id) do update set role = excluded.role;
  return v_user;
end;
$$;
revoke all on function capture.add_league_member(uuid, text, capture.league_role) from public, anon;
grant execute on function capture.add_league_member(uuid, text, capture.league_role) to authenticated;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table capture.leagues             enable row level security;
alter table capture.league_members      enable row level security;
alter table capture.games               enable row level security;
alter table capture.game_teams          enable row level security;
alter table capture.game_players        enable row level security;
alter table capture.stat_events         enable row level security;
alter table capture.correction_requests enable row level security;
alter table capture.audit_log           enable row level security;

-- leagues
create policy leagues_select on capture.leagues for select to authenticated
  using (created_by = auth.uid() or capture.has_league_role(uid, 'viewer'));
create policy leagues_insert on capture.leagues for insert to authenticated
  with check (created_by = auth.uid());
create policy leagues_update on capture.leagues for update to authenticated
  using (capture.has_league_role(uid, 'admin')) with check (capture.has_league_role(uid, 'admin'));
create policy leagues_delete on capture.leagues for delete to authenticated
  using (capture.has_league_role(uid, 'admin'));

-- league_members
create policy members_select on capture.league_members for select to authenticated
  using (user_id = auth.uid() or capture.has_league_role(league_uid, 'viewer'));
create policy members_insert on capture.league_members for insert to authenticated
  with check (capture.has_league_role(league_uid, 'admin'));
create policy members_update on capture.league_members for update to authenticated
  using (capture.has_league_role(league_uid, 'admin')) with check (capture.has_league_role(league_uid, 'admin'));
create policy members_delete on capture.league_members for delete to authenticated
  using (capture.has_league_role(league_uid, 'admin') or user_id = auth.uid());

-- games
create policy games_select on capture.games for select to authenticated
  using (capture.has_league_role(league_uid, 'viewer'));
create policy games_insert on capture.games for insert to authenticated
  with check (capture.has_league_role(league_uid, 'admin'));
create policy games_update on capture.games for update to authenticated
  using (capture.has_league_role(league_uid, 'scorer')) with check (capture.has_league_role(league_uid, 'scorer'));
create policy games_delete on capture.games for delete to authenticated
  using (capture.has_league_role(league_uid, 'admin'));

-- game_teams / game_players: names, numbers, colours and site links stay
-- editable by scorers at any time (they're metadata, not game data).
create policy teams_select on capture.game_teams for select to authenticated
  using (capture.has_league_role(capture.game_league(game_uid), 'viewer'));
create policy teams_write on capture.game_teams for all to authenticated
  using (capture.has_league_role(capture.game_league(game_uid), 'scorer'))
  with check (capture.has_league_role(capture.game_league(game_uid), 'scorer'));

create policy players_select on capture.game_players for select to authenticated
  using (capture.has_league_role(capture.game_league(capture.team_game(team_uid)), 'viewer'));
create policy players_write on capture.game_players for all to authenticated
  using (capture.has_league_role(capture.game_league(capture.team_game(team_uid)), 'scorer'))
  with check (capture.has_league_role(capture.game_league(capture.team_game(team_uid)), 'scorer'));

-- stat_events: no delete policy at all — events are voided, never deleted.
create policy events_select on capture.stat_events for select to authenticated
  using (capture.has_league_role(capture.game_league(game_uid), 'viewer'));
create policy events_insert on capture.stat_events for insert to authenticated
  with check (capture.can_change_game_data(game_uid) and created_by = auth.uid());
create policy events_update on capture.stat_events for update to authenticated
  using (capture.can_change_game_data(game_uid)) with check (capture.can_change_game_data(game_uid));

-- correction_requests: any member can ask; admins review (trigger-enforced).
create policy corrections_select on capture.correction_requests for select to authenticated
  using (requested_by = auth.uid() or capture.has_league_role(capture.game_league(game_uid), 'admin'));
create policy corrections_insert on capture.correction_requests for insert to authenticated
  with check (requested_by = auth.uid() and status = 'pending'
              and capture.has_league_role(capture.game_league(game_uid), 'viewer'));
create policy corrections_update on capture.correction_requests for update to authenticated
  using (capture.has_league_role(capture.game_league(game_uid), 'admin'))
  with check (capture.has_league_role(capture.game_league(game_uid), 'admin'));

-- audit_log: read-only, league admins; rows only ever come from the trigger.
create policy audit_select on capture.audit_log for select to authenticated
  using (league_uid is not null and capture.has_league_role(league_uid, 'admin'));

-- ---------------------------------------------------------------------------
-- Grants (RLS decides which rows)
-- ---------------------------------------------------------------------------

revoke all on all tables in schema capture from public, anon;
revoke all on all sequences in schema capture from public, anon;
grant select, insert, update, delete on
  capture.leagues, capture.league_members, capture.games,
  capture.game_teams, capture.game_players
  to authenticated;
grant select, insert, update on capture.stat_events, capture.correction_requests to authenticated;
grant select on capture.audit_log to authenticated;
grant all on all tables in schema capture to service_role;
grant all on all sequences in schema capture to service_role;

-- Future capture migrations must grant explicitly; nothing reaches anon.
