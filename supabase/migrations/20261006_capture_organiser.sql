-- Organiser: league teams and squads, team managers, venues, competition
-- rules, fixtures (time / round / number / venue), game codes, assigned
-- scorers and officials.
--
-- capture schema only; nothing in public is touched.
--
-- Access model after this migration
--   league admin     everything in the league
--   league scorer    score any game in the league, edit rosters
--   league viewer    read
--   assigned scorer  (game_scorers — added by an admin or by entering the
--                    game's code) sees and scores that one game
--   team manager     (team_managers) maintains their team's squad and, while
--                    a game is still in setup, their team's roster for it

-- ---------------------------------------------------------------------------
-- Competition rules: set once on the league, copied onto each game
-- ---------------------------------------------------------------------------

alter table capture.leagues
  add column default_capture_mode   text not null default 'complex' check (default_capture_mode in ('complex', 'simple')),
  add column period_count           int  not null default 4  check (period_count between 1 and 8),
  add column period_duration_mins   int  not null default 10 check (period_duration_mins between 1 and 60),
  add column overtime_duration_mins int  not null default 5  check (overtime_duration_mins between 1 and 30),
  add column foul_limit             int  not null default 5  check (foul_limit between 3 and 8),
  -- Team fouls in a period before every further foul is two free throws
  -- (FIBA: the 5th team foul onwards, i.e. "bonus after 4").
  add column bonus_after_team_fouls int  not null default 4  check (bonus_after_team_fouls between 2 and 10),
  add column timeouts_first_half    int  not null default 2  check (timeouts_first_half between 0 and 6),
  add column timeouts_second_half   int  not null default 3  check (timeouts_second_half between 0 and 6),
  add column timeouts_overtime      int  not null default 1  check (timeouts_overtime between 0 and 3);

create table capture.venues (
  uid        uuid primary key default gen_random_uuid(),
  league_uid uuid not null references capture.leagues(uid) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 120),
  address    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (league_uid, name)
);

create table capture.league_teams (
  uid             uuid primary key default gen_random_uuid(),
  league_uid      uuid not null references capture.leagues(uid) on delete cascade,
  name            text not null check (length(btrim(name)) between 1 and 120),
  abbreviation    text not null default '' check (length(abbreviation) <= 6),
  color_primary   text,
  color_secondary text,
  logo_url        text,
  site_team_id    uuid,                -- public.teams.team_id (no FK on purpose)
  head_coach      text,
  assistant_coach text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (league_uid, name)
);

create table capture.squad_players (
  uid             uuid primary key default gen_random_uuid(),
  league_team_uid uuid not null references capture.league_teams(uid) on delete cascade,
  jersey_number   text not null default '' check (length(jersey_number) <= 4),
  first_name      text not null default '',
  last_name       text not null default '',
  position        text,
  headshot_url    text,
  site_player_id  uuid,                -- public.players.id (no FK on purpose)
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index squad_players_team_idx on capture.squad_players (league_team_uid);

create table capture.team_managers (
  league_team_uid uuid not null references capture.league_teams(uid) on delete cascade,
  user_id         uuid not null references auth.users(id) on delete cascade,
  added_by        uuid default auth.uid() references auth.users(id) on delete set null,
  created_at      timestamptz not null default now(),
  primary key (league_team_uid, user_id)
);
create index team_managers_user_idx on capture.team_managers (user_id);

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

alter table capture.games
  add column tipoff_time            time,
  add column round_label            text check (length(round_label) <= 40),
  add column game_number            int check (game_number > 0),
  add column venue_uid              uuid references capture.venues(uid) on delete set null,
  add column home_league_team_uid   uuid references capture.league_teams(uid) on delete set null,
  add column away_league_team_uid   uuid references capture.league_teams(uid) on delete set null,
  -- Short code a league hands to a volunteer scorer to open this game.
  add column game_code              text unique,
  add column attendance             int check (attendance >= 0),
  add column foul_limit             int not null default 5 check (foul_limit between 3 and 8),
  add column bonus_after_team_fouls int not null default 4 check (bonus_after_team_fouls between 2 and 10),
  add column timeouts_first_half    int not null default 2 check (timeouts_first_half between 0 and 6),
  add column timeouts_second_half   int not null default 3 check (timeouts_second_half between 0 and 6),
  add column timeouts_overtime      int not null default 1 check (timeouts_overtime between 0 and 3);

alter table capture.game_teams
  add column league_team_uid uuid references capture.league_teams(uid) on delete set null,
  add column head_coach      text,
  add column assistant_coach text;

alter table capture.game_players
  add column squad_player_uid uuid references capture.squad_players(uid) on delete set null,
  add column is_captain       boolean not null default false;

create table capture.game_scorers (
  game_uid   uuid not null references capture.games(uid) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  added_by   uuid default auth.uid() references auth.users(id) on delete set null,
  via_code   boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (game_uid, user_id)
);
create index game_scorers_user_idx on capture.game_scorers (user_id);

create table capture.game_officials (
  uid        uuid primary key default gen_random_uuid(),
  game_uid   uuid not null references capture.games(uid) on delete cascade,
  role       text not null check (role in ('crew_chief', 'umpire', 'commissioner', 'scorer',
                                           'assistant_scorer', 'timer', 'shot_clock', 'statistician')),
  name       text not null check (length(btrim(name)) between 1 and 120),
  created_at timestamptz not null default now()
);
create index game_officials_game_idx on capture.game_officials (game_uid);

-- Game codes: 6 characters, no look-alikes (0/O, 1/I/L).
create function capture.new_game_code()
returns text language plpgsql security definer set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea;
  c text;
begin
  loop
    -- The first six bytes of a v4 uuid are random.
    b := uuid_send(gen_random_uuid());
    c := '';
    for i in 0..5 loop
      c := c || substr(alphabet, 1 + (get_byte(b, i) % length(alphabet)), 1);
    end loop;
    exit when not exists (select 1 from capture.games where game_code = c);
  end loop;
  return c;
end;
$$;
revoke all on function capture.new_game_code() from public, anon, authenticated;

create function capture.set_game_code()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  -- Always server-issued, whatever the client sent.
  new.game_code := capture.new_game_code();
  return new;
end;
$$;
create trigger games_code before insert on capture.games
  for each row execute function capture.set_game_code();

update capture.games set game_code = capture.new_game_code() where game_code is null;
alter table capture.games alter column game_code set not null;

-- ---------------------------------------------------------------------------
-- Permission helpers
-- ---------------------------------------------------------------------------

create function capture.is_team_manager(p_league_team uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from capture.team_managers m
                 where m.league_team_uid = p_league_team and m.user_id = auth.uid());
$$;

create function capture.team_league(p_league_team uuid)
returns uuid language sql stable security definer set search_path = ''
as $$ select league_uid from capture.league_teams where uid = p_league_team; $$;

-- Score this game: a league scorer, or someone assigned to this game.
create function capture.can_score_game(p_game uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select capture.has_league_role(capture.game_league(p_game), 'scorer')
      or exists (select 1 from capture.game_scorers s where s.game_uid = p_game and s.user_id = auth.uid());
$$;

create function capture.can_view_game(p_game uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select capture.has_league_role(capture.game_league(p_game), 'viewer')
      or exists (select 1 from capture.game_scorers s where s.game_uid = p_game and s.user_id = auth.uid())
      or exists (select 1 from capture.games g
                 where g.uid = p_game
                   and (capture.is_team_manager(g.home_league_team_uid) or capture.is_team_manager(g.away_league_team_uid)));
$$;

create function capture.can_view_league(p_league uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select capture.has_league_role(p_league, 'viewer')
      or exists (select 1 from capture.game_scorers s join capture.games g on g.uid = s.game_uid
                 where g.league_uid = p_league and s.user_id = auth.uid())
      or exists (select 1 from capture.team_managers m join capture.league_teams t on t.uid = m.league_team_uid
                 where t.league_uid = p_league and m.user_id = auth.uid());
$$;

-- Edit a game team's roster: whoever can score the game, or that team's
-- manager while the game is still being set up.
create function capture.can_edit_roster(p_game_team uuid)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from capture.game_teams t join capture.games g on g.uid = t.game_uid
    where t.uid = p_game_team
      and (capture.can_score_game(g.uid)
           or (g.status = 'setup' and capture.is_team_manager(t.league_team_uid)))
  );
$$;

-- Live game: scorers may change events. Final game: league admins only.
create or replace function capture.can_change_game_data(p_game uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from capture.games g
    where g.uid = p_game
      and (
        (g.status <> 'final' and capture.can_score_game(g.uid))
        or capture.has_league_role(g.league_uid, 'admin')
      )
  );
$$;

revoke all on function capture.is_team_manager(uuid) from public, anon;
revoke all on function capture.team_league(uuid) from public, anon;
revoke all on function capture.can_score_game(uuid) from public, anon;
revoke all on function capture.can_view_game(uuid) from public, anon;
revoke all on function capture.can_view_league(uuid) from public, anon;
revoke all on function capture.can_edit_roster(uuid) from public, anon;
grant execute on function capture.is_team_manager(uuid) to authenticated;
grant execute on function capture.team_league(uuid) to authenticated;
grant execute on function capture.can_score_game(uuid) to authenticated;
grant execute on function capture.can_view_game(uuid) to authenticated;
grant execute on function capture.can_view_league(uuid) to authenticated;
grant execute on function capture.can_edit_roster(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Guards
-- ---------------------------------------------------------------------------

create or replace function capture.guard_game_update()
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
  -- The code is issued by the server and never changes.
  new.game_code := old.game_code;
  -- The fixture itself (who, when, where, the rules) is the league's to set;
  -- a scorer runs the game but doesn't reschedule it.
  if not capture.has_league_role(old.league_uid, 'admin')
     and (new.game_date, new.tipoff_time, new.round_label, new.game_number, new.venue_uid,
          new.home_league_team_uid, new.away_league_team_uid, new.period_count, new.period_duration_mins,
          new.overtime_duration_mins, new.foul_limit, new.bonus_after_team_fouls,
          new.timeouts_first_half, new.timeouts_second_half, new.timeouts_overtime)
        is distinct from
         (old.game_date, old.tipoff_time, old.round_label, old.game_number, old.venue_uid,
          old.home_league_team_uid, old.away_league_team_uid, old.period_count, old.period_duration_mins,
          old.overtime_duration_mins, old.foul_limit, old.bonus_after_team_fouls,
          old.timeouts_first_half, old.timeouts_second_half, old.timeouts_overtime) then
    raise exception 'Only a league admin can change a game''s fixture details or rules'
      using errcode = '42501';
  end if;
  if new.status = 'final' and old.status <> 'final' then
    new.finalized_at := now();
    new.finalized_by := auth.uid();
  end if;
  return new;
end;
$$;

create trigger venues_touch        before update on capture.venues        for each row execute function capture.touch_updated_at();
create trigger league_teams_touch  before update on capture.league_teams  for each row execute function capture.touch_updated_at();
create trigger squad_players_touch before update on capture.squad_players for each row execute function capture.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Audit: teach the trail about the new tables
-- ---------------------------------------------------------------------------

create or replace function capture.write_audit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  r          jsonb := to_jsonb(coalesce(new, old));
  v_game     uuid;
  v_league   uuid;
  v_row_uid  text;
begin
  if tg_table_name = 'stat_events' and tg_op = 'INSERT' then
    if (r->>'replaces_event_uid') is null then
      return null;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
      return null;
    end if;
    if tg_table_name = 'games'
       and (to_jsonb(new) - 'clock_seconds' - 'current_period' - 'updated_at')
         = (to_jsonb(old) - 'clock_seconds' - 'current_period' - 'updated_at') then
      return null;
    end if;
  end if;

  case tg_table_name
    when 'leagues'        then v_league := (r->>'uid')::uuid;
    when 'league_members' then v_league := (r->>'league_uid')::uuid;
    when 'venues'         then v_league := (r->>'league_uid')::uuid;
    when 'league_teams'   then v_league := (r->>'league_uid')::uuid;
    when 'squad_players'  then v_league := capture.team_league((r->>'league_team_uid')::uuid);
    when 'team_managers'  then v_league := capture.team_league((r->>'league_team_uid')::uuid);
    when 'games'          then v_game := (r->>'uid')::uuid; v_league := (r->>'league_uid')::uuid;
    when 'game_teams'     then v_game := (r->>'game_uid')::uuid;
    when 'game_players'   then v_game := capture.team_game((r->>'team_uid')::uuid);
    else                       v_game := (r->>'game_uid')::uuid;
  end case;
  if v_league is null and v_game is not null then
    v_league := capture.game_league(v_game);
  end if;

  v_row_uid := coalesce(
    r->>'uid',
    coalesce(r->>'league_uid', r->>'league_team_uid', r->>'game_uid') || ':' || (r->>'user_id'));

  insert into capture.audit_log (actor, league_uid, game_uid, table_name, row_uid, action, old_row, new_row)
  values (auth.uid(), v_league, v_game, tg_table_name, v_row_uid, lower(tg_op),
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return null;
end;
$$;

create trigger venues_audit         after insert or update or delete on capture.venues         for each row execute function capture.write_audit();
create trigger league_teams_audit   after insert or update or delete on capture.league_teams   for each row execute function capture.write_audit();
create trigger squad_players_audit  after insert or update or delete on capture.squad_players  for each row execute function capture.write_audit();
create trigger team_managers_audit  after insert or update or delete on capture.team_managers  for each row execute function capture.write_audit();
create trigger game_scorers_audit   after insert or update or delete on capture.game_scorers   for each row execute function capture.write_audit();
create trigger game_officials_audit after insert or update or delete on capture.game_officials for each row execute function capture.write_audit();

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table capture.venues         enable row level security;
alter table capture.league_teams   enable row level security;
alter table capture.squad_players  enable row level security;
alter table capture.team_managers  enable row level security;
alter table capture.game_scorers   enable row level security;
alter table capture.game_officials enable row level security;

-- Existing tables: widen "who can see / score" to assigned scorers and team managers.
drop policy leagues_select on capture.leagues;
create policy leagues_select on capture.leagues for select to authenticated
  using (created_by = auth.uid() or capture.can_view_league(uid));

drop policy games_select on capture.games;
create policy games_select on capture.games for select to authenticated
  using (capture.can_view_game(uid));
drop policy games_update on capture.games;
create policy games_update on capture.games for update to authenticated
  using (capture.can_score_game(uid)) with check (capture.can_score_game(uid));

drop policy teams_select on capture.game_teams;
create policy teams_select on capture.game_teams for select to authenticated
  using (capture.can_view_game(game_uid));
drop policy teams_write on capture.game_teams;
create policy teams_write on capture.game_teams for all to authenticated
  using (capture.can_score_game(game_uid)) with check (capture.can_score_game(game_uid));

drop policy players_select on capture.game_players;
create policy players_select on capture.game_players for select to authenticated
  using (capture.can_view_game(capture.team_game(team_uid)));
drop policy players_write on capture.game_players;
create policy players_write on capture.game_players for all to authenticated
  using (capture.can_edit_roster(team_uid)) with check (capture.can_edit_roster(team_uid));

drop policy events_select on capture.stat_events;
create policy events_select on capture.stat_events for select to authenticated
  using (capture.can_view_game(game_uid));

drop policy corrections_insert on capture.correction_requests;
create policy corrections_insert on capture.correction_requests for insert to authenticated
  with check (requested_by = auth.uid() and status = 'pending' and capture.can_view_game(game_uid));

-- New tables
create policy venues_select on capture.venues for select to authenticated
  using (capture.can_view_league(league_uid));
create policy venues_write on capture.venues for all to authenticated
  using (capture.has_league_role(league_uid, 'admin')) with check (capture.has_league_role(league_uid, 'admin'));

create policy league_teams_select on capture.league_teams for select to authenticated
  using (capture.can_view_league(league_uid));
create policy league_teams_insert on capture.league_teams for insert to authenticated
  with check (capture.has_league_role(league_uid, 'admin'));
create policy league_teams_update on capture.league_teams for update to authenticated
  using (capture.has_league_role(league_uid, 'admin') or capture.is_team_manager(uid))
  with check (capture.has_league_role(league_uid, 'admin') or capture.is_team_manager(uid));
create policy league_teams_delete on capture.league_teams for delete to authenticated
  using (capture.has_league_role(league_uid, 'admin'));

create policy squad_select on capture.squad_players for select to authenticated
  using (capture.can_view_league(capture.team_league(league_team_uid)));
create policy squad_write on capture.squad_players for all to authenticated
  using (capture.has_league_role(capture.team_league(league_team_uid), 'scorer') or capture.is_team_manager(league_team_uid))
  with check (capture.has_league_role(capture.team_league(league_team_uid), 'scorer') or capture.is_team_manager(league_team_uid));

create policy team_managers_select on capture.team_managers for select to authenticated
  using (user_id = auth.uid() or capture.has_league_role(capture.team_league(league_team_uid), 'admin'));
create policy team_managers_write on capture.team_managers for all to authenticated
  using (capture.has_league_role(capture.team_league(league_team_uid), 'admin'))
  with check (capture.has_league_role(capture.team_league(league_team_uid), 'admin'));

create policy game_scorers_select on capture.game_scorers for select to authenticated
  using (user_id = auth.uid() or capture.has_league_role(capture.game_league(game_uid), 'admin'));
create policy game_scorers_write on capture.game_scorers for all to authenticated
  using (capture.has_league_role(capture.game_league(game_uid), 'admin'))
  with check (capture.has_league_role(capture.game_league(game_uid), 'admin'));

create policy officials_select on capture.game_officials for select to authenticated
  using (capture.can_view_game(game_uid));
create policy officials_write on capture.game_officials for all to authenticated
  using (capture.can_score_game(game_uid)) with check (capture.can_score_game(game_uid));

-- A league team's fixture lock: a manager can rename/re-colour their team
-- but not move it to another league.
create function capture.guard_league_team_update()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if new.league_uid <> old.league_uid then
    raise exception 'A team cannot move between leagues' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger league_teams_guard before update on capture.league_teams
  for each row execute function capture.guard_league_team_update();

-- ---------------------------------------------------------------------------
-- Functions the app calls
-- ---------------------------------------------------------------------------

-- Create a fixture from two league teams: the game (with the league's rules),
-- both game teams, and — optionally — each active squad as the starting roster.
create function capture.create_fixture(
  p_league uuid, p_home uuid, p_away uuid, p_date date,
  p_time time default null, p_venue uuid default null,
  p_round text default null, p_number int default null,
  p_with_rosters boolean default true
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  l capture.leagues%rowtype;
  v_game uuid := gen_random_uuid();
  v_team uuid;
  t capture.league_teams%rowtype;
  is_home boolean;
begin
  if not capture.has_league_role(p_league, 'admin') then
    raise exception 'Only a league admin can create fixtures' using errcode = '42501';
  end if;
  if p_home = p_away then
    raise exception 'A team cannot play itself';
  end if;
  select * into l from capture.leagues where uid = p_league;
  if (select count(*) from capture.league_teams where uid in (p_home, p_away) and league_uid = p_league) <> 2 then
    raise exception 'Both teams must belong to this league';
  end if;
  if p_venue is not null and not exists (select 1 from capture.venues where uid = p_venue and league_uid = p_league) then
    raise exception 'That venue belongs to a different league';
  end if;

  insert into capture.games (
    uid, league_uid, status, capture_mode, competition, venue, game_date, tipoff_time, round_label, game_number,
    venue_uid, home_league_team_uid, away_league_team_uid,
    period_count, period_duration_mins, overtime_duration_mins, clock_seconds,
    foul_limit, bonus_after_team_fouls, timeouts_first_half, timeouts_second_half, timeouts_overtime)
  values (
    v_game, p_league, 'setup', l.default_capture_mode, l.name,
    (select name from capture.venues where uid = p_venue), p_date, p_time, nullif(btrim(p_round), ''), p_number,
    p_venue, p_home, p_away,
    l.period_count, l.period_duration_mins, l.overtime_duration_mins, l.period_duration_mins * 60,
    l.foul_limit, l.bonus_after_team_fouls, l.timeouts_first_half, l.timeouts_second_half, l.timeouts_overtime);

  foreach is_home in array array[true, false] loop
    select * into t from capture.league_teams where uid = case when is_home then p_home else p_away end;
    v_team := gen_random_uuid();
    insert into capture.game_teams (uid, game_uid, is_home, name, abbreviation, color_primary, color_secondary,
                                    logo_url, site_team_id, league_team_uid, head_coach, assistant_coach)
    values (v_team, v_game, is_home, t.name, t.abbreviation, t.color_primary, t.color_secondary,
            t.logo_url, t.site_team_id, t.uid, t.head_coach, t.assistant_coach);
    if p_with_rosters then
      insert into capture.game_players (uid, team_uid, jersey_number, first_name, last_name, position,
                                        headshot_url, site_player_id, squad_player_uid)
      select gen_random_uuid(), v_team, s.jersey_number, s.first_name, s.last_name, s.position,
             s.headshot_url, s.site_player_id, s.uid
      from capture.squad_players s
      where s.league_team_uid = t.uid and s.is_active;
    end if;
  end loop;
  return v_game;
end;
$$;

-- A volunteer scorer enters the game's code and is assigned to that game.
create function capture.join_game_by_code(p_code text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_game uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select uid into v_game from capture.games
   where game_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) and status <> 'final';
  if v_game is null then
    raise exception 'No open game has that code — check it with your league organiser' using errcode = 'P0002';
  end if;
  insert into capture.game_scorers (game_uid, user_id, added_by, via_code)
  values (v_game, auth.uid(), auth.uid(), true)
  on conflict (game_uid, user_id) do nothing;
  return v_game;
end;
$$;

create function capture.add_team_manager(p_league_team uuid, p_email text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_user uuid;
begin
  if not capture.has_league_role(capture.team_league(p_league_team), 'admin') then
    raise exception 'Only a league admin can add team managers' using errcode = '42501';
  end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'No Swish account uses that email yet — ask them to sign up first' using errcode = 'P0002';
  end if;
  insert into capture.team_managers (league_team_uid, user_id, added_by)
  values (p_league_team, v_user, auth.uid())
  on conflict (league_team_uid, user_id) do nothing;
  return v_user;
end;
$$;

-- People attached to a team / game, with emails (which live in auth.users).
create function capture.list_team_managers(p_league_team uuid)
returns table (user_id uuid, email text, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select m.user_id, u.email::text, m.created_at
  from capture.team_managers m join auth.users u on u.id = m.user_id
  where m.league_team_uid = p_league_team
    and capture.has_league_role(capture.team_league(p_league_team), 'admin')
  order by m.created_at;
$$;

create function capture.list_game_scorers(p_game uuid)
returns table (user_id uuid, email text, via_code boolean, created_at timestamptz)
language sql stable security definer set search_path = ''
as $$
  select s.user_id, u.email::text, s.via_code, s.created_at
  from capture.game_scorers s join auth.users u on u.id = s.user_id
  where s.game_uid = p_game
    and capture.has_league_role(capture.game_league(p_game), 'admin')
  order by s.created_at;
$$;

revoke all on function capture.create_fixture(uuid, uuid, uuid, date, time, uuid, text, int, boolean) from public, anon;
revoke all on function capture.join_game_by_code(text) from public, anon;
revoke all on function capture.add_team_manager(uuid, text) from public, anon;
revoke all on function capture.list_team_managers(uuid) from public, anon;
revoke all on function capture.list_game_scorers(uuid) from public, anon;
grant execute on function capture.create_fixture(uuid, uuid, uuid, date, time, uuid, text, int, boolean) to authenticated;
grant execute on function capture.join_game_by_code(text) to authenticated;
grant execute on function capture.add_team_manager(uuid, text) to authenticated;
grant execute on function capture.list_team_managers(uuid) to authenticated;
grant execute on function capture.list_game_scorers(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Grants (RLS decides which rows)
-- ---------------------------------------------------------------------------

revoke all on capture.venues, capture.league_teams, capture.squad_players, capture.team_managers,
              capture.game_scorers, capture.game_officials from public, anon;
grant select, insert, update, delete on
  capture.venues, capture.league_teams, capture.squad_players, capture.team_managers,
  capture.game_scorers, capture.game_officials
  to authenticated;
grant all on capture.venues, capture.league_teams, capture.squad_players, capture.team_managers,
             capture.game_scorers, capture.game_officials to service_role;
