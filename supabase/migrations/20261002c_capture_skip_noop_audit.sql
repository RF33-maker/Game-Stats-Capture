-- Re-sent rows (outbox replays, coalesced upserts) arrive as UPDATEs that
-- change nothing. Don't audit those, and don't bump updated_at for them.
-- capture schema only.

create or replace function capture.touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $$
begin
  if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
    new.updated_at := old.updated_at;
  else
    new.updated_at := now();
  end if;
  return new;
end;
$$;

create or replace function capture.write_audit()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  r          jsonb := to_jsonb(coalesce(new, old));
  v_game     uuid;
  v_league   uuid;
  v_row_uid  text;
begin
  -- Plain event inserts are the data itself (created_by/created_at on the
  -- row). (Fields are read via jsonb: plpgsql would fail resolving new.<col>
  -- on tables that don't have that column.)
  if tg_table_name = 'stat_events' and tg_op = 'INSERT' then
    if (r->>'replaces_event_uid') is null then
      return null;
    end if;
  end if;
  if tg_op = 'UPDATE' then
    -- A re-sent row that changes nothing.
    if (to_jsonb(new) - 'updated_at') = (to_jsonb(old) - 'updated_at') then
      return null;
    end if;
    -- Clock ticks are not game data.
    if tg_table_name = 'games'
       and (to_jsonb(new) - 'clock_seconds' - 'current_period' - 'updated_at')
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
