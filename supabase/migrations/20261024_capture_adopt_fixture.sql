-- Publish a captured game into an existing site fixture.
--
-- Until now a captured game always became a new site game (key 'SWISH_<code>').
-- For a fixture that is already on the site but never got its stats (LiveStats
-- stopped or errored), that would show the game twice. Linking a capture game
-- to the fixture makes publish_game fill that fixture's row instead.
--
-- Safety, because this writes into a real competition:
--  * A game can only be linked through the functions below (never by editing the
--    column), and only by a Swish admin or an admin of the league. A league only
--    reaches a competition once Swish has approved the link, so a league admin
--    can only fill fixtures of a competition they were approved for.
--  * The fixture must be in the competition the league is linked to, and must
--    have no stats that did not come from Scorers Table.
--  * The teams in the capture game must be the fixture's home and away teams.
--  * Linking detaches the fixture's LiveStats URL (kept in
--    capture.games.adopted_livestats_url and restored by unpublish_game). Without
--    that, the LiveStats poller's 72-hour re-check after a final could re-parse
--    its feed over the captured game.
--
-- publish_game is wrapped, not rewritten: the existing function becomes
-- _publish_game_core and still builds everything under 'SWISH_<code>'; the new
-- publish_game moves those rows onto the fixture and drops the extra schedule row.

-- capture.games.site_game_key already exists (since the first schema, "game_key on
-- the site once published", never used until now). From here it is the key of the
-- existing site fixture this game fills in; null means a new 'SWISH_<code>' game.
alter table capture.games
  add column adopted_livestats_url text, -- the fixture's LiveStats URL before it was detached
  add column adopted_status      text;   -- the fixture's status before it was adopted

create function capture.guard_game_site_key()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.site_game_key is not distinct from old.site_game_key
     and new.adopted_livestats_url is not distinct from old.adopted_livestats_url
     and new.adopted_status is not distinct from old.adopted_status then
    return new;
  end if;
  if tg_op = 'INSERT' and new.site_game_key is null and new.adopted_livestats_url is null and new.adopted_status is null then
    return new;
  end if;
  -- Set (for this transaction only) by link_game_to_fixture / start_site_game.
  if current_setting('capture.linking', true) = 'on'
     or coalesce((select public.is_app_admin()), false)
     or coalesce(auth.role() = 'service_role', false)
     or (session_user in ('postgres', 'supabase_admin') and auth.uid() is null) then
    return new;
  end if;
  raise exception 'A game can only be linked to a site fixture by its league admin, through the app' using errcode = '42501';
end;
$$;
create trigger guard_game_site_key
  before insert or update on capture.games
  for each row execute function capture.guard_game_site_key();

-- Link (or, with a null key, unlink) a capture game and a site fixture.
create function capture.link_game_to_fixture(p_game uuid, p_game_key text)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  g capture.games%rowtype;
  l capture.leagues%rowtype;
  comp public.competitions%rowtype;
  sched public.game_schedule%rowtype;
begin
  select * into g from capture.games where uid = p_game;
  if not found then raise exception 'Game not found' using errcode = 'PT404'; end if;
  if not (capture.can_publish(g.league_uid)) then
    raise exception 'Only a league admin can link a game to a site fixture' using errcode = '42501';
  end if;
  perform set_config('capture.linking', 'on', true);

  if p_game_key is null then
    if g.site_game_key is not null and exists (
         select 1 from public.player_stats where game_key = g.site_game_key and source_type = 'swish_stats') then
      raise exception 'Unpublish the game first, then unlink it';
    end if;
    update capture.games set site_game_key = null, adopted_livestats_url = null, adopted_status = null where uid = p_game;
    perform set_config('capture.linking', 'off', true);
    return null;
  end if;

  select * into l from capture.leagues where uid = g.league_uid;
  if l.site_league_id is null then raise exception 'Link the league to a Swish competition first'; end if;
  select * into comp from public.competitions where league_id = l.site_league_id;
  if not found then raise exception 'The linked Swish competition no longer exists'; end if;
  select * into sched from public.game_schedule where game_key = p_game_key;
  if not found then raise exception 'No such fixture on the site'; end if;
  if sched.league_id is distinct from comp.league_id then
    raise exception 'That fixture belongs to a different competition';
  end if;
  if exists (select 1 from public.player_stats where game_key = p_game_key and source_type is distinct from 'swish_stats') then
    raise exception 'That fixture already has LiveStats stats; refusing to replace them';
  end if;

  update capture.games
     set site_game_key = p_game_key,
         adopted_livestats_url = coalesce(adopted_livestats_url, sched."LiveStats URL"),
         adopted_status = coalesce(adopted_status, sched.status)
   where uid = p_game;
  perform set_config('capture.linking', 'off', true);
  return p_game_key;
end;
$$;
revoke all on function capture.link_game_to_fixture(uuid, text) from public, anon;
grant execute on function capture.link_game_to_fixture(uuid, text) to authenticated;

-- Fixtures of the league's linked competition, for the "score a game from the
-- site" screen. Unplayed ones first, nearest to today first.
create function capture.search_site_fixtures(p_league uuid, p_query text default null, p_limit int default 40)
returns table (game_key text, matchtime timestamptz, hometeam text, awayteam text, status text,
               has_stats boolean, captured boolean)
language plpgsql stable security definer set search_path = ''
as $$
declare comp_id uuid;
begin
  if not capture.has_league_role(p_league, 'admin') then
    raise exception 'Only a league admin can search fixtures' using errcode = '42501';
  end if;
  select site_league_id into comp_id from capture.leagues where uid = p_league;
  if comp_id is null then raise exception 'Link the league to a Swish competition first'; end if;
  return query
    select s.game_key, s.matchtime, s.hometeam, s.awayteam, s.status,
           exists (select 1 from public.player_stats ps where ps.game_key = s.game_key and ps.source_type is distinct from 'swish_stats'),
           exists (select 1 from capture.games cg where cg.site_game_key = s.game_key)
      from public.game_schedule s
     where s.league_id = comp_id
       and s.home_team_id is not null and s.away_team_id is not null
       and (coalesce(btrim(p_query), '') = ''
            or s.hometeam ilike '%' || btrim(p_query) || '%' or s.awayteam ilike '%' || btrim(p_query) || '%')
     order by exists (select 1 from public.player_stats ps where ps.game_key = s.game_key and ps.source_type is distinct from 'swish_stats'),
              abs(extract(epoch from (s.matchtime - now())))
     limit least(greatest(coalesce(p_limit, 40), 1), 100);
end;
$$;
revoke all on function capture.search_site_fixtures(uuid, text, int) from public, anon;
grant execute on function capture.search_site_fixtures(uuid, text, int) to authenticated;

-- Start scoring a game that is already on the site: make both teams in the
-- league (linked to the site's teams, squads copied from the site's players),
-- make the game with the league's rules, and link it to the fixture.
create function capture.start_site_game(p_league uuid, p_game_key text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  l     capture.leagues%rowtype;
  comp  public.competitions%rowtype;
  sched public.game_schedule%rowtype;
  v_ids uuid[];
  v_lt  uuid[] := '{}';
  v_tid uuid;
  t     public.teams%rowtype;
  v_one uuid;
  v_game uuid;
begin
  if not capture.has_league_role(p_league, 'admin') then
    raise exception 'Only a league admin can start a game' using errcode = '42501';
  end if;
  select * into l from capture.leagues where uid = p_league;
  if l.site_league_id is null then raise exception 'Link the league to a Swish competition first'; end if;
  select * into comp from public.competitions where league_id = l.site_league_id;
  if not found then raise exception 'The linked Swish competition no longer exists'; end if;
  select * into sched from public.game_schedule where game_key = p_game_key;
  if not found then raise exception 'No such fixture on the site'; end if;
  if sched.league_id is distinct from comp.league_id then raise exception 'That fixture belongs to a different competition'; end if;
  if sched.home_team_id is null or sched.away_team_id is null then raise exception 'That fixture does not have both teams yet'; end if;
  if exists (select 1 from public.player_stats where game_key = p_game_key and source_type is distinct from 'swish_stats') then
    raise exception 'That fixture already has stats';
  end if;
  if exists (select 1 from capture.games where site_game_key = p_game_key) then
    raise exception 'That fixture is already being scored in Scorers Table';
  end if;

  foreach v_tid in array array[sched.home_team_id, sched.away_team_id] loop
    select uid into v_one from capture.league_teams where league_uid = p_league and site_team_id = v_tid;
    if v_one is null then
      select * into t from public.teams where team_id = v_tid;
      insert into capture.league_teams (league_uid, name, abbreviation, logo_url, site_team_id)
      values (p_league, left(btrim(t.name), 120), upper(left(regexp_replace(t.name, '[^A-Za-z]', '', 'g'), 3)), t.logo_url, v_tid)
      on conflict (league_uid, name) do update set site_team_id = coalesce(capture.league_teams.site_team_id, excluded.site_team_id)
      returning uid into v_one;
    end if;
    -- A squad from the site's players if the league has none for this team yet.
    -- The site holds some players twice (initial and full name): keep the full one.
    if not exists (select 1 from capture.squad_players where league_team_uid = v_one) then
      insert into capture.squad_players (league_team_uid, jersey_number, first_name, last_name, position, site_player_id)
      with r as (
        select p.id, p."shirtNumber"::text as num, p.position,
               coalesce(nullif(btrim(p.firstname), ''), split_part(btrim(p.full_name), ' ', 1)) as fn,
               coalesce(nullif(btrim(p.familyname), ''), nullif(btrim(substr(btrim(p.full_name), length(split_part(btrim(p.full_name), ' ', 1)) + 2)), ''), '') as ln
          from public.players p where p.team_id = v_tid
      )
      select v_one, coalesce(r.num, ''), r.fn, r.ln, r.position, r.id
        from r
       where not (length(regexp_replace(r.fn, '\.', '', 'g')) <= 1 and exists (
               select 1 from r q where q.id <> r.id and lower(q.ln) = lower(r.ln)
                  and upper(left(q.fn, 1)) = upper(left(r.fn, 1)) and length(regexp_replace(q.fn, '\.', '', 'g')) > 1))
       order by case when r.num ~ '^\d+$' then r.num::int end nulls last, r.ln;
    end if;
    v_lt := v_lt || v_one;
    v_one := null;
  end loop;

  v_game := capture.create_fixture(p_league, v_lt[1], v_lt[2],
              (sched.matchtime at time zone 'UTC')::date, (sched.matchtime at time zone 'UTC')::time,
              null, null, null, true);

  perform set_config('capture.linking', 'on', true);
  update capture.games
     set site_game_key = p_game_key, adopted_livestats_url = sched."LiveStats URL", adopted_status = sched.status
   where uid = v_game;
  perform set_config('capture.linking', 'off', true);
  return v_game;
end;
$$;
revoke all on function capture.start_site_game(uuid, text) from public, anon;
grant execute on function capture.start_site_game(uuid, text) to authenticated;

-- The existing publisher stays as it is, under a new name, callable only from
-- the wrapper below.
alter function capture.publish_game(uuid, boolean) rename to _publish_game_core;
revoke all on function capture._publish_game_core(uuid, boolean) from public, anon, authenticated;

-- Fix to the roster write added in 20261022: public.game_rosters has a unique
-- key on (game_key, team_id, shirt_number), and a squad can have two players on
-- the same number (or none, which is the same blank number twice). That made the
-- whole publish fail. Keep the first of each number, starters first, and carry on.
do $fix$
declare
  d text := pg_get_functiondef('capture._publish_game_core(uuid, boolean)'::regprocedure);
  old text := $q$    join capture.game_teams gt on gt.uid = gp.team_uid and gt.game_uid = p_game;$q$;
  new text := $q$    join capture.game_teams gt on gt.uid = gp.team_uid and gt.game_uid = p_game
   order by gp.is_starter desc, gp.created_at, gp.uid
  on conflict do nothing;$q$;
begin
  if (length(d) - length(replace(d, old, ''))) <> length(old) then
    raise exception 'roster insert not found exactly once';
  end if;
  execute replace(d, old, new);
end
$fix$;

create function capture.publish_game(p_game uuid, p_listed boolean default true)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  g capture.games%rowtype;
  l capture.leagues%rowtype;
  comp public.competitions%rowtype;
  sched public.game_schedule%rowtype;
  v_core text;
  v_key text;
begin
  select * into g from capture.games where uid = p_game;
  if not found then raise exception 'Game not found' using errcode = 'PT404'; end if;
  if not (capture.can_publish(g.league_uid) or capture.can_score_game(p_game)) then
    raise exception 'Only a league admin or this game''s scorer can publish it' using errcode = '42501';
  end if;

  if g.site_game_key is null then
    return capture._publish_game_core(p_game, p_listed);
  end if;

  -- ---- Publishing into an existing fixture.
  v_key := g.site_game_key;
  if g.status = 'setup' then raise exception 'Start the game before publishing it'; end if;
  select * into l from capture.leagues where uid = g.league_uid;
  select * into comp from public.competitions where league_id = l.site_league_id;
  if not found then raise exception 'The linked Swish competition no longer exists'; end if;
  select * into sched from public.game_schedule where game_key = v_key;
  if not found then raise exception 'The site fixture this game is linked to no longer exists'; end if;
  if sched.league_id is distinct from comp.league_id then
    raise exception 'That fixture belongs to a different competition';
  end if;
  if exists (select 1 from public.player_stats where game_key = v_key and source_type is distinct from 'swish_stats') then
    raise exception 'That fixture already has LiveStats stats; refusing to replace them';
  end if;
  if exists (select 1 from public.live_events where game_key = v_key)
     and not exists (select 1 from public.player_stats where game_key = v_key and source_type = 'swish_stats') then
    raise exception 'That fixture already has play-by-play that did not come from Scorers Table';
  end if;

  -- What this game published here last time (the checks above show it is ours).
  delete from public.game_rosters where game_key = v_key;
  delete from public.live_events  where game_key = v_key;
  delete from public.shot_chart   where game_key = v_key;
  delete from public.player_stats where game_key = v_key;
  delete from public.team_stats   where game_key = v_key;

  v_core := capture._publish_game_core(p_game, p_listed);

  if not exists (select 1 from public.team_stats where game_key = v_core and side = '1' and team_id = sched.home_team_id)
     or not exists (select 1 from public.team_stats where game_key = v_core and side = '2' and team_id = sched.away_team_id) then
    raise exception 'The teams in this game are not the fixture''s home and away teams';
  end if;

  update public.live_events  set game_key = v_key where game_key = v_core;
  update public.shot_chart   set game_key = v_key where game_key = v_core;
  update public.player_stats set game_key = v_key where game_key = v_core;
  update public.team_stats   set game_key = v_key where game_key = v_core;
  update public.game_rosters set game_key = v_key where game_key = v_core;

  -- The fixture keeps its date, team names and ids; it takes the live state,
  -- and lets go of LiveStats so the poller can never re-parse over it.
  update public.game_schedule s
     set status = c.status, home_score = c.home_score, attendance = c.attendance, officials = c.officials,
         final_detected_at = c.final_detected_at, parsed_at = c.parsed_at,
         "LiveStats URL" = null, next_poll_at = null, poll_fail_count = 0
    from public.game_schedule c
   where s.game_key = v_key and c.game_key = v_core;
  delete from public.game_schedule where game_key = v_core;

  return v_key;
end;
$$;
revoke all on function capture.publish_game(uuid, boolean) from public, anon;
grant execute on function capture.publish_game(uuid, boolean) to authenticated;

-- Take a captured game off the site. For a fixture it filled in, the fixture
-- goes back to how it was (scheduled / errored, with its LiveStats URL).
create or replace function capture.unpublish_game(p_game uuid)
returns void
language plpgsql security definer set search_path = ''
as $$
declare g capture.games%rowtype; v_key text;
begin
  select * into g from capture.games where uid = p_game;
  if not found then raise exception 'Game not found' using errcode = 'PT404'; end if;
  if not capture.can_publish(g.league_uid) then
    raise exception 'Only a league admin can unpublish a game' using errcode = '42501';
  end if;
  v_key := coalesce(g.site_game_key, 'SWISH_' || g.game_code);
  if g.site_game_key is not null
     and exists (select 1 from public.player_stats where game_key = v_key and source_type is distinct from 'swish_stats') then
    raise exception 'That fixture has LiveStats stats; refusing to remove them';
  end if;
  delete from public.game_rosters where game_key = v_key;
  delete from public.live_events  where game_key = v_key;
  delete from public.shot_chart   where game_key = v_key;
  delete from public.player_stats where game_key = v_key;
  delete from public.team_stats   where game_key = v_key;
  if g.site_game_key is null then
    delete from public.game_schedule where game_key = v_key;
  else
    update public.game_schedule
       set status = coalesce(g.adopted_status, 'scheduled'), "LiveStats URL" = g.adopted_livestats_url,
           home_score = null, attendance = null, officials = null, parsed_at = null, final_detected_at = null
     where game_key = v_key;
  end if;
end;
$$;
