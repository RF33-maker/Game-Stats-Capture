-- A league admin can invite a specific person to score one game, by email.
--
-- The other way in already exists: every game gets a six-character code when it
-- is created (trigger games_code, so schedules, fixtures and "score a site
-- game" all have one), and anyone signed in can type it to score that game
-- (join_game_by_code). An invite is the same access, named: the person is added
-- to capture.game_scorers like a code joiner, with via_code = false, so the
-- organiser's list can tell them apart.
--
-- Scoring one game is not the paid league feature, so the person needs an
-- account but no organiser approval. They get that game only.

create function capture.add_game_scorer(p_game uuid, p_email text)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  v_user uuid;
  v_status text;
begin
  if not capture.has_league_role(capture.game_league(p_game), 'admin') then
    raise exception 'Only a league admin can invite a scorer' using errcode = '42501';
  end if;
  select status into v_status from capture.games where uid = p_game;
  if v_status is null then raise exception 'Game not found' using errcode = 'PT404'; end if;
  if v_status = 'final' then raise exception 'This game is final'; end if;
  select id into v_user from auth.users where lower(email) = lower(btrim(p_email));
  if v_user is null then
    raise exception 'No account uses that email yet — ask them to sign up first, or give them the game code' using errcode = 'P0002';
  end if;
  insert into capture.game_scorers (game_uid, user_id, added_by, via_code)
  values (p_game, v_user, auth.uid(), false)
  on conflict (game_uid, user_id) do nothing;
  return v_user;
end;
$$;
revoke all on function capture.add_game_scorer(uuid, text) from public, anon;
grant execute on function capture.add_game_scorer(uuid, text) to authenticated;
