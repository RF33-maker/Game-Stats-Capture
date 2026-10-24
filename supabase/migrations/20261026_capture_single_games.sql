-- Single games: score a one-off game privately, then (if it is good) add it to
-- a league and, optionally, to a real fixture on the Swish site.
--
-- Every game belongs to a capture league, so each approved account gets one
-- private "Single games" league (kind = 'personal'). It can never be linked to
-- a Swish competition, so nothing in it is published.
--
-- assign_game_to_league moves a game into a league the caller runs, links it to
-- one of that league's competition fixtures (or leaves it as a new game), and
-- publishes it straight away, all in one transaction: if the teams do not match
-- the fixture, nothing moves.

alter table capture.leagues
  add column kind text not null default 'league' check (kind in ('league', 'personal'));
alter table capture.leagues
  add constraint personal_leagues_stay_private check (kind = 'league' or site_league_id is null);
create unique index leagues_one_personal_per_user on capture.leagues (created_by) where kind = 'personal';

-- The caller's private league for one-off games, made on first use. Same
-- approval as creating a league: single games are part of the paid feature.
create function capture.my_single_games_league()
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_uid uuid;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  if not capture.is_approved_organiser() then
    raise exception 'Scoring games is part of the paid feature. Request access first.' using errcode = '42501';
  end if;
  select uid into v_uid from capture.leagues where kind = 'personal' and created_by = auth.uid();
  if v_uid is null then
    insert into capture.leagues (uid, name, created_by, kind)
    values (gen_random_uuid(), 'Single games', auth.uid(), 'personal')
    returning uid into v_uid;
  end if;
  return v_uid;
end;
$$;
revoke all on function capture.my_single_games_league() from public, anon;
grant execute on function capture.my_single_games_league() to authenticated;

create function capture.assign_game_to_league(p_game uuid, p_league uuid, p_game_key text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  g     capture.games%rowtype;
  dst   capture.leagues%rowtype;
  comp  public.competitions%rowtype;
  sched public.game_schedule%rowtype;
  v_home uuid; v_away uuid;
  v_key text;
begin
  select * into g from capture.games where uid = p_game;
  if not found then raise exception 'Game not found' using errcode = 'PT404'; end if;
  if not capture.has_league_role(g.league_uid, 'admin') then
    raise exception 'You can only move games out of a league you run' using errcode = '42501';
  end if;
  if not capture.has_league_role(p_league, 'admin') then
    raise exception 'You can only add games to a league you run' using errcode = '42501';
  end if;
  select * into dst from capture.leagues where uid = p_league;
  if dst.kind = 'personal' then raise exception 'Pick a league, not single games'; end if;
  if g.league_uid = p_league then raise exception 'That game is already in this league'; end if;
  if dst.site_league_id is null then
    raise exception 'Link that league to a Swish competition first, so there is somewhere to publish to';
  end if;
  if exists (select 1 from public.player_stats
              where source_type = 'swish_stats' and game_key in ('SWISH_' || g.game_code, coalesce(g.site_game_key, ''))) then
    raise exception 'This game is already published; unpublish it first';
  end if;

  if p_game_key is not null then
    select * into comp from public.competitions where league_id = dst.site_league_id;
    if not found then raise exception 'The linked Swish competition no longer exists'; end if;
    select * into sched from public.game_schedule where game_key = p_game_key;
    if not found then raise exception 'No such fixture on the site'; end if;
    if sched.league_id is distinct from comp.league_id then raise exception 'That fixture belongs to a different competition'; end if;
    if exists (select 1 from public.player_stats where game_key = p_game_key and source_type is distinct from 'swish_stats') then
      raise exception 'That fixture already has stats';
    end if;
    if exists (select 1 from capture.games where site_game_key = p_game_key and uid <> p_game) then
      raise exception 'That fixture is already being scored in another game';
    end if;
    select site_team_id into v_home from capture.game_teams where game_uid = p_game and is_home;
    select site_team_id into v_away from capture.game_teams where game_uid = p_game and not is_home;
    if v_home is distinct from sched.home_team_id or v_away is distinct from sched.away_team_id then
      raise exception 'The teams in this game are not the fixture''s home and away teams. Check each team is linked to its Swish team and that home and away are the right way round.';
    end if;
  end if;

  perform set_config('capture.linking', 'on', true);
  update capture.games
     set league_uid = p_league, home_league_team_uid = null, away_league_team_uid = null, venue_uid = null,
         site_game_key = p_game_key,
         adopted_livestats_url = case when p_game_key is null then null else sched."LiveStats URL" end,
         adopted_status = case when p_game_key is null then null else sched.status end
   where uid = p_game;
  perform set_config('capture.linking', 'off', true);

  if g.status <> 'setup' then
    v_key := capture.publish_game(p_game, true);
  else
    v_key := coalesce(p_game_key, 'SWISH_' || g.game_code);
  end if;
  return v_key;
end;
$$;
revoke all on function capture.assign_game_to_league(uuid, uuid, text) from public, anon;
grant execute on function capture.assign_game_to_league(uuid, uuid, text) to authenticated;
