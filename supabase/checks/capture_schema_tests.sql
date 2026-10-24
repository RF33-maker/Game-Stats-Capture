-- Behaviour tests for the capture schema. Runs as postgres, impersonates
-- users via request.jwt.claims + SET ROLE. Any failed check raises, which
-- aborts the run. Wrap in BEGIN ... ROLLBACK when running against a real
-- project so the test users and rows are never kept.

insert into auth.users (id, email, aud, role) values
  ('00000000-0000-4000-a000-0000000000a1', 'capture-test-admin@example.invalid',   'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-0000000000a2', 'capture-test-scorer@example.invalid',  'authenticated', 'authenticated'),
  ('00000000-0000-4000-a000-0000000000a3', 'capture-test-outsider@example.invalid','authenticated', 'authenticated');

set local role authenticated;

-- ---- admin builds a league, adds a scorer, sets up a game ----------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
insert into capture.leagues (uid, name) values ('10000000-0000-4000-a000-000000000001', 'Test League');
do $$ begin
  if not exists (select 1 from capture.league_members where league_uid = '10000000-0000-4000-a000-000000000001'
                 and user_id = '00000000-0000-4000-a000-0000000000a1' and role = 'admin') then
    raise exception 'FAIL 1: creator was not made league admin';
  end if;
end $$;
select capture.add_league_member('10000000-0000-4000-a000-000000000001', 'capture-test-scorer@example.invalid', 'scorer');
insert into capture.games (uid, league_uid, status) values ('20000000-0000-4000-a000-000000000001', '10000000-0000-4000-a000-000000000001', 'active');
insert into capture.game_teams (uid, game_uid, is_home, name, abbreviation) values
  ('30000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000001', true,  'Hawks',  'HAW'),
  ('30000000-0000-4000-a000-000000000002', '20000000-0000-4000-a000-000000000001', false, 'Wolves', 'WLF');
insert into capture.game_players (uid, team_uid, jersey_number, first_name, last_name) values
  ('40000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', '23', 'Jamal', 'Reed');

-- ---- scorer captures --------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a2","role":"authenticated"}', true);
insert into capture.stat_events (uid, game_uid, team_uid, player_uid, period, clock_seconds, event_type, value, device_created_at, device_seq)
values ('50000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
        '40000000-0000-4000-a000-000000000001', 1, 590, '2ptm', 2, now(), 1);

-- replaying the outbox must not duplicate
insert into capture.stat_events (uid, game_uid, team_uid, player_uid, period, clock_seconds, event_type, value, device_created_at, device_seq)
values ('50000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
        '40000000-0000-4000-a000-000000000001', 1, 590, '2ptm', 2, now(), 1)
on conflict (uid) do nothing;
do $$ begin
  if (select count(*) from capture.stat_events where game_uid = '20000000-0000-4000-a000-000000000001') <> 1 then
    raise exception 'FAIL 2: replayed insert duplicated the event';
  end if;
end $$;

do $$ declare blocked boolean := false; begin
  begin update capture.stat_events set value = 3 where uid = '50000000-0000-4000-a000-000000000001';
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL 3: a stat event was edited in place'; end if;
end $$;

update capture.stat_events set voided_at = now(), void_reason = 'wrong player' where uid = '50000000-0000-4000-a000-000000000001';
do $$ begin
  if (select voided_by from capture.stat_events where uid = '50000000-0000-4000-a000-000000000001')
     is distinct from '00000000-0000-4000-a000-0000000000a2'::uuid then
    raise exception 'FAIL 4: void did not record the scorer';
  end if;
end $$;

do $$ declare blocked boolean := false; begin
  begin update capture.stat_events set voided_at = null where uid = '50000000-0000-4000-a000-000000000001';
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL 5: a voided event was un-voided'; end if;
end $$;

insert into capture.stat_events (uid, game_uid, team_uid, period, clock_seconds, event_type, value, replaces_event_uid, device_created_at, device_seq)
values ('50000000-0000-4000-a000-000000000002', '20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
        1, 590, '3ptm', 3, '50000000-0000-4000-a000-000000000001', now(), 2);

update capture.game_players set last_name = 'Reed-Jones', jersey_number = '24' where uid = '40000000-0000-4000-a000-000000000001';

do $$ declare blocked boolean := false; begin
  begin delete from capture.stat_events where uid = '50000000-0000-4000-a000-000000000002';
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL 6: a stat event was deleted'; end if;
end $$;

do $$ declare blocked boolean := false; begin
  begin insert into capture.games (uid, league_uid) values ('20000000-0000-4000-a000-000000000009', '10000000-0000-4000-a000-000000000001');
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL 7: a scorer created a game'; end if;
end $$;

do $$ declare blocked boolean := false; begin
  begin insert into capture.stat_events (uid, game_uid, team_uid, period, clock_seconds, event_type, device_created_at, device_seq)
        values ('50000000-0000-4000-a000-000000000008', '20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', 1, 500, 'dunk', now(), 9);
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL 8: an unknown event type was accepted'; end if;
end $$;

-- ---- outsider sees and changes nothing --------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a3","role":"authenticated"}', true);
do $$ begin
  if exists (select 1 from capture.leagues) or exists (select 1 from capture.games)
     or exists (select 1 from capture.stat_events) or exists (select 1 from capture.game_players) then
    raise exception 'FAIL 9: an outsider can read capture data';
  end if;
end $$;
do $$ declare blocked boolean := false; begin
  begin insert into capture.stat_events (uid, game_uid, team_uid, period, clock_seconds, event_type, device_created_at, device_seq)
        values ('50000000-0000-4000-a000-000000000007', '20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', 1, 500, '2ptm', now(), 9);
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL 10: an outsider recorded a stat'; end if;
end $$;
do $$ declare blocked boolean := false; begin
  begin perform capture.add_league_member('10000000-0000-4000-a000-000000000001', 'capture-test-outsider@example.invalid', 'admin');
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL 11: an outsider made themselves admin'; end if;
end $$;

-- ---- admin finalises ---------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
update capture.games set status = 'final' where uid = '20000000-0000-4000-a000-000000000001';
do $$ begin
  if (select finalized_by from capture.games where uid = '20000000-0000-4000-a000-000000000001')
     is distinct from '00000000-0000-4000-a000-0000000000a1'::uuid then
    raise exception 'FAIL 12: finalising did not record the admin';
  end if;
end $$;

-- ---- scorer is locked out of the final game --------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a2","role":"authenticated"}', true);
update capture.stat_events set voided_at = now() where uid = '50000000-0000-4000-a000-000000000002';
do $$ declare blocked boolean := false; begin
  begin insert into capture.stat_events (uid, game_uid, team_uid, period, clock_seconds, event_type, device_created_at, device_seq)
        values ('50000000-0000-4000-a000-000000000006', '20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001', 4, 0, 'ftm', now(), 10);
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL 13: a scorer added an event to a final game'; end if;
end $$;
do $$ declare blocked boolean := false; begin
  begin update capture.games set status = 'active' where uid = '20000000-0000-4000-a000-000000000001';
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL 14: a scorer re-opened a final game'; end if;
end $$;

-- names stay editable after the final whistle
update capture.game_players set first_name = 'Jay' where uid = '40000000-0000-4000-a000-000000000001';

insert into capture.correction_requests (uid, game_uid, stat_event_uid, description, proposed)
values ('60000000-0000-4000-a000-000000000001', '20000000-0000-4000-a000-000000000001', '50000000-0000-4000-a000-000000000002',
        'That three was a two', '{"event_type": "2ptm"}');
-- RLS hides the row from a non-admin's UPDATE, so this is a silent no-op.
update capture.correction_requests set status = 'approved' where uid = '60000000-0000-4000-a000-000000000001';
do $$ begin
  if (select status from capture.correction_requests where uid = '60000000-0000-4000-a000-000000000001') <> 'pending' then
    raise exception 'FAIL 15: a scorer approved their own correction';
  end if;
end $$;
do $$ begin
  if exists (select 1 from capture.audit_log) then
    raise exception 'FAIL 16: a scorer can read the audit log';
  end if;
end $$;

-- ---- admin reviews and applies --------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-a000-0000000000a1","role":"authenticated"}', true);
do $$ begin
  if (select voided_at from capture.stat_events where uid = '50000000-0000-4000-a000-000000000002') is not null then
    raise exception 'FAIL 17: the scorer voided an event in a final game';
  end if;
  if (select first_name from capture.game_players where uid = '40000000-0000-4000-a000-000000000001') <> 'Jay' then
    raise exception 'FAIL 18: name edit after final did not apply';
  end if;
end $$;
update capture.correction_requests set status = 'approved', review_note = 'ok' where uid = '60000000-0000-4000-a000-000000000001';
update capture.stat_events set voided_at = now(), void_reason = 'correction 6000…01' where uid = '50000000-0000-4000-a000-000000000002';
insert into capture.stat_events (uid, game_uid, team_uid, period, clock_seconds, event_type, value, replaces_event_uid, device_created_at, device_seq)
values ('50000000-0000-4000-a000-000000000003', '20000000-0000-4000-a000-000000000001', '30000000-0000-4000-a000-000000000001',
        1, 590, '2ptm', 2, '50000000-0000-4000-a000-000000000002', now(), 3);
update capture.correction_requests set status = 'applied' where uid = '60000000-0000-4000-a000-000000000001';

do $$ declare n int; begin
  select count(*) into n from capture.audit_log where game_uid = '20000000-0000-4000-a000-000000000001';
  -- expected at least: game insert, 2 team inserts, player insert, void, replacement insert,
  -- 2 player edits, finalise, correction insert + 2 status changes, admin void, admin replacement
  if n < 14 then raise exception 'FAIL 19: audit log has only % rows for the game', n; end if;
  if exists (select 1 from capture.audit_log where table_name = 'stat_events' and action = 'insert'
             and new_row->>'replaces_event_uid' is null) then
    raise exception 'FAIL 20: plain event inserts were audited';
  end if;
end $$;

-- ---- signed-out visitors -----------------------------------------------------------
reset role;
set local role anon;
do $$ declare blocked boolean := false; begin
  begin perform 1 from capture.leagues limit 1;
  exception when others then blocked := true; end;
  if not blocked then raise exception 'FAIL 21: anon can read capture'; end if;
end $$;

reset role;
select 'ALL CAPTURE TESTS PASSED' as result;
