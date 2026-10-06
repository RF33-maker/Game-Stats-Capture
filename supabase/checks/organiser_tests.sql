-- Behaviour tests for the organiser migration. Wrap in BEGIN ... ROLLBACK.
insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-0000000000a1', 'capture-test-admin@example.invalid',   'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-0000000000a2', 'capture-test-manager@example.invalid', 'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-0000000000a3', 'capture-test-volunteer@example.invalid','authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-0000000000a4', 'capture-test-outsider@example.invalid','authenticated', 'authenticated');
set local role authenticated;

-- admin builds the league
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
insert into capture.leagues (uid, name, period_duration_mins, foul_limit) values ('10000000-0000-4000-a000-000000000001', 'Org Test', 8, 4);
insert into capture.venues (uid, league_uid, name) values ('70000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', 'Main Hall');
insert into capture.league_teams (uid, league_uid, name, abbreviation, head_coach) values
  ('80000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', 'Hawks', 'HAW', 'Coach H'),
  ('80000000-0000-4000-a000-000000000002', '10000000-0000-4000-a000-000000000001', 'Wolves', 'WLF', null);
insert into capture.squad_players (uid, league_team_uid, jersey_number, first_name, last_name) values
  ('90000000-0000-4000-a000-000000000001', '80000000-0000-4000-a000-000000000001', '4', 'Ann', 'One'),
  ('90000000-0000-4000-a000-000000000002', '80000000-0000-4000-a000-000000000001', '5', 'Bea', 'Two'),
  ('90000000-0000-4000-a000-000000000003', '80000000-0000-4000-a000-000000000002', '7', 'Cat', 'Three');
insert into capture.squad_players (league_team_uid, jersey_number, first_name, last_name, is_active)
  values ('80000000-0000-4000-a000-000000000001', '9', 'Old', 'Player', false);
select capture.add_team_manager('80000000-0000-4000-a000-000000000001', 'capture-test-manager@example.invalid');

-- fixtures
select set_config('test.game1', capture.create_fixture('10000000-0000-4000-a000-000000000001', '80000000-0000-4000-a000-000000000001',
  '80000000-0000-4000-a000-000000000002', date '2026-11-01', time '18:30', '70000000-0000-4000-a000-000000000001', 'Round 1', 1)::text, true);
select set_config('test.game2', capture.create_fixture('10000000-0000-4000-a000-000000000001', '80000000-0000-4000-a000-000000000002',
  '80000000-0000-4000-a000-000000000001', date '2026-11-08')::text, true);
do $$ declare g capture.games%rowtype; begin
  select * into g from capture.games where uid = current_setting('test.game1')::uuid;
  if g.game_code !~ '^[A-HJKMNP-Z2-9]{6}$' then raise exception 'FAIL O1: bad game code %', g.game_code; end if;
  if g.period_duration_mins <> 8 or g.foul_limit <> 4 or g.clock_seconds <> 480 then raise exception 'FAIL O2: league rules not copied to the game'; end if;
  if g.venue <> 'Main Hall' or g.tipoff_time <> time '18:30' or g.round_label <> 'Round 1' then raise exception 'FAIL O3: fixture details wrong'; end if;
  if (select count(*) from capture.game_teams where game_uid = g.uid) <> 2 then raise exception 'FAIL O4: game teams not created'; end if;
  if (select count(*) from capture.game_players p join capture.game_teams t on t.uid = p.team_uid where t.game_uid = g.uid) <> 3 then
    raise exception 'FAIL O5: active squad players not copied (inactive must be left out)'; end if;
  if (select head_coach from capture.game_teams where game_uid = g.uid and is_home) <> 'Coach H' then raise exception 'FAIL O6: coach not copied'; end if;
  if (select game_code from capture.games where uid = current_setting('test.game2')::uuid) = g.game_code then raise exception 'FAIL O7: duplicate game codes'; end if;
end $$;
do $$ declare blocked boolean := false; begin
  begin perform capture.create_fixture('10000000-0000-4000-a000-000000000001', '80000000-0000-4000-a000-000000000001', '80000000-0000-4000-a000-000000000001', current_date);
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL O8: a team was scheduled against itself'; end if;
end $$;

-- team manager
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a2","role":"authenticated"}', true);
insert into capture.squad_players (league_team_uid, jersey_number, first_name, last_name) values ('80000000-0000-4000-a000-000000000001', '11', 'New', 'Signing');
update capture.league_teams set color_primary = '#112233' where uid = '80000000-0000-4000-a000-000000000001';
update capture.league_teams set color_primary = '#445566' where uid = '80000000-0000-4000-a000-000000000002';
update capture.game_players set jersey_number = '44'
  where squad_player_uid = '90000000-0000-4000-a000-000000000001';
update capture.game_players set jersey_number = '77'
  where squad_player_uid = '90000000-0000-4000-a000-000000000003';
do $$ declare blocked boolean := false; begin
  if (select count(*) from capture.league_teams) <> 2 or (select count(*) from capture.games) <> 2 then raise exception 'FAIL O9: manager cannot see their league''s teams and their games'; end if;
  begin insert into capture.squad_players (league_team_uid, first_name, last_name) values ('80000000-0000-4000-a000-000000000002', 'X', 'Y');
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL O10: manager edited another team''s squad'; end if;
  blocked := false;
  begin perform capture.create_fixture('10000000-0000-4000-a000-000000000001', '80000000-0000-4000-a000-000000000001', '80000000-0000-4000-a000-000000000002', current_date);
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL O11: manager created a fixture'; end if;
  blocked := false;
  begin insert into capture.stat_events (uid, game_uid, period, clock_seconds, event_type, device_created_at, device_seq)
        values (gen_random_uuid(), current_setting('test.game1')::uuid, 1, 100, 'timeout', now(), 1);
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL O12: manager recorded a stat'; end if;
end $$;

-- volunteer with the code
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a3","role":"authenticated"}', true);
do $$ declare blocked boolean := false; begin
  if exists (select 1 from capture.games) then raise exception 'FAIL O13: volunteer sees games before entering a code'; end if;
  begin perform capture.join_game_by_code('ZZZZZZ'); exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL O14: a wrong code was accepted'; end if;
end $$;
reset role;
select set_config('test.code1', (select game_code from capture.games where uid = current_setting('test.game1')::uuid), true);
set local role authenticated;
select capture.join_game_by_code(lower(substr(current_setting('test.code1'), 1, 3)) || '-' || substr(current_setting('test.code1'), 4));
do $$ begin
  if (select count(*) from capture.games) <> 1 then raise exception 'FAIL O15: volunteer should see exactly the one game'; end if;
  if (select count(*) from capture.leagues) <> 1 then raise exception 'FAIL O16: volunteer cannot see the league of their game'; end if;
  if (select count(*) from capture.game_players) <> 3 then raise exception 'FAIL O17: volunteer cannot see the rosters'; end if;
end $$;
update capture.games set status = 'active' where uid = current_setting('test.game1')::uuid;
insert into capture.stat_events (uid, game_uid, period, clock_seconds, event_type, device_created_at, device_seq)
  values ('50000000-0000-4000-a000-000000000001', current_setting('test.game1')::uuid, 1, 470, 'jump_ball', now(), 1);
insert into capture.game_officials (game_uid, role, name) values (current_setting('test.game1')::uuid, 'crew_chief', 'R. Eferee');
update capture.game_players set is_starter = true where squad_player_uid = '90000000-0000-4000-a000-000000000002';
do $$ declare blocked boolean := false; old_code text; begin
  select game_code into old_code from capture.games where uid = current_setting('test.game1')::uuid;
  update capture.games set game_code = 'AAAAAA' where uid = current_setting('test.game1')::uuid;
  if (select game_code from capture.games where uid = current_setting('test.game1')::uuid) <> old_code then raise exception 'FAIL O18: a scorer changed the game code'; end if;
  begin update capture.games set game_date = date '2030-01-01' where uid = current_setting('test.game1')::uuid;
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL O19: a volunteer scorer rescheduled the game'; end if;
  if exists (select 1 from capture.game_scorers where user_id <> auth.uid()) then raise exception 'FAIL O20: volunteer sees other scorers'; end if;
end $$;

-- manager is locked out of the roster once the game is live
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a2","role":"authenticated"}', true);
update capture.game_players set jersey_number = '99' where squad_player_uid = '90000000-0000-4000-a000-000000000001';

-- outsider
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a4","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from capture.league_teams) or exists (select 1 from capture.squad_players) or exists (select 1 from capture.venues)
     or exists (select 1 from capture.game_officials) or exists (select 1 from capture.games) then
    raise exception 'FAIL O21: an outsider can read organiser data';
  end if;
end $$;

-- admin checks what everyone did
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  if (select count(*) from capture.squad_players where league_team_uid = '80000000-0000-4000-a000-000000000001') <> 4 then raise exception 'FAIL O22: manager''s squad addition missing'; end if;
  if (select color_primary from capture.league_teams where uid = '80000000-0000-4000-a000-000000000001') <> '#112233' then raise exception 'FAIL O23: manager could not edit own team'; end if;
  if (select color_primary from capture.league_teams where uid = '80000000-0000-4000-a000-000000000002') is not null then raise exception 'FAIL O24: manager edited another team'; end if;
  if (select p.jersey_number from capture.game_players p join capture.game_teams t on t.uid = p.team_uid where t.game_uid = current_setting('test.game1')::uuid and p.squad_player_uid = '90000000-0000-4000-a000-000000000001') <> '44' then
    raise exception 'FAIL O25: manager roster edit in setup did not apply, or applied after tip-off (%)', (select p.jersey_number from capture.game_players p join capture.game_teams t on t.uid = p.team_uid where t.game_uid = current_setting('test.game1')::uuid and p.squad_player_uid = '90000000-0000-4000-a000-000000000001'); end if;
  if (select p.jersey_number from capture.game_players p join capture.game_teams t on t.uid = p.team_uid where t.game_uid = current_setting('test.game1')::uuid and p.squad_player_uid = '90000000-0000-4000-a000-000000000003') <> '7' then raise exception 'FAIL O26: manager edited the opponent''s roster'; end if;
  if (select count(*) from capture.list_game_scorers(current_setting('test.game1')::uuid) where via_code) <> 1 then raise exception 'FAIL O27: code scorer not listed'; end if;
  if (select count(*) from capture.list_team_managers('80000000-0000-4000-a000-000000000001')) <> 1 then raise exception 'FAIL O28: manager not listed'; end if;
  if not exists (select 1 from capture.audit_log where table_name = 'league_teams' and league_uid = '10000000-0000-4000-a000-000000000001')
     or not exists (select 1 from capture.audit_log where table_name = 'squad_players' and league_uid = '10000000-0000-4000-a000-000000000001')
     or not exists (select 1 from capture.audit_log where table_name = 'game_scorers' and game_uid = current_setting('test.game1')::uuid) then
    raise exception 'FAIL O29: organiser changes missing from the audit trail'; end if;
  update capture.games set game_date = date '2026-11-02' where uid = current_setting('test.game1')::uuid;
end $$;

reset role;
set local role anon;
do $$ declare blocked boolean := false; begin
  begin perform 1 from capture.league_teams limit 1; exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL O30: anon can read league teams'; end if;
  blocked := false;
  begin perform capture.join_game_by_code('AAAAAA'); exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL O31: anon can use a game code'; end if;
end $$;
reset role;
