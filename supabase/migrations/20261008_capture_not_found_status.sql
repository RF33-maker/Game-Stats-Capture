-- A wrong game code or unknown email is "not found" (HTTP 404), not a server
-- error: PostgREST maps errcode PTxyz to status xyz. capture schema only.
-- Applied 2026-10-08 as `capture_not_found_status`: the two functions below
-- are unchanged from 20261006_capture_organiser.sql except for the errcode
-- on their "not found" branch ('P0002' -> 'PT404').
--   capture.join_game_by_code(text)
--   capture.add_team_manager(uuid, text)

create or replace function capture.join_game_by_code(p_code text)
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
    raise exception 'No open game has that code — check it with your league organiser' using errcode = 'PT404';
  end if;
  insert into capture.game_scorers (game_uid, user_id, added_by, via_code)
  values (v_game, auth.uid(), auth.uid(), true)
  on conflict (game_uid, user_id) do nothing;
  return v_game;
end;
$$;

create or replace function capture.add_team_manager(p_league_team uuid, p_email text)
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
    raise exception 'No Swish account uses that email yet — ask them to sign up first' using errcode = 'PT404';
  end if;
  insert into capture.team_managers (league_team_uid, user_id, added_by)
  values (p_league_team, v_user, auth.uid())
  on conflict (league_team_uid, user_id) do nothing;
  return v_user;
end;
$$;
