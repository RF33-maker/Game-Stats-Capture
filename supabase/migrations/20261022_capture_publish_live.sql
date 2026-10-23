-- Publisher v2: live publishing, ordered play-by-play, rosters for lineups.
--
-- 1. A game's scorer (league scorer, or someone who joined with the game code)
--    may publish it, so a game can stream to the site while it is being scored.
--    Before, only a league admin could.
-- 2. live_events.created_at is now set per event, in play order. It used to be
--    one now() for the whole publish, and the site sorts play-by-play on it, so
--    republished games showed their plays in no particular order.
-- 3. game_rosters is written too, which is what the lineup / on-off builder reads.
--
-- Everything else is unchanged from 20261012_capture_publish_game.sql.

create or replace function capture.publish_game(p_game uuid, p_listed boolean default true)
returns text
language plpgsql security definer set search_path = ''
as $$
declare
  g        capture.games%rowtype;
  l        capture.leagues%rowtype;
  comp     public.competitions%rowtype;
  v_key    text;
  t        record;
  p        record;
  e        record;
  v_team   uuid;
  v_pid    uuid;
  team_of  jsonb := '{}';   -- capture team uid   -> site team id
  pid_of   jsonb := '{}';   -- capture player uid -> site player id
  home_uid uuid; away_uid uuid;
  home_id  uuid; away_id  uuid;
  hs int := 0; aw int := 0;
  n  int := 0;
  pts int; is_home boolean; ok boolean; a_type text; a_sub text; quals text[];
  on_court uuid[];
  secs jsonb := '{}'; pm jsonb := '{}';
  last_t int := 0; now_t int; u uuid;
  by_period jsonb := '{}';
  v_shot text;
  v_base timestamp := clock_timestamp()::timestamp;  -- live_events.created_at; the site sorts play-by-play on it
begin
  select * into g from capture.games where uid = p_game;
  if not found then raise exception 'Game not found' using errcode = 'PT404'; end if;
  if not (capture.can_publish(g.league_uid) or capture.can_score_game(p_game)) then
    raise exception 'Only a league admin or this game''s scorer can publish it' using errcode = '42501';
  end if;
  if g.status = 'setup' then raise exception 'Start the game before publishing it'; end if;
  select * into l from capture.leagues where uid = g.league_uid;
  if l.site_league_id is null then
    raise exception 'Link this league to a Swish competition first';
  end if;
  select * into comp from public.competitions where league_id = l.site_league_id;
  if not found then raise exception 'The linked Swish competition no longer exists'; end if;

  v_key := 'SWISH_' || g.game_code;

  -- ---- Teams: the row for this team in this competition, made if missing.
  for t in select * from capture.game_teams where game_uid = p_game loop
    select team_id into v_team from public.teams where team_id = t.site_team_id and league_id = comp.league_id;
    if v_team is null then
      select team_id into v_team from public.teams where league_id = comp.league_id and lower(name) = lower(t.name) limit 1;
    end if;
    if v_team is null then
      insert into public.teams (league_id, name, logo_url) values (comp.league_id, t.name, t.logo_url) returning team_id into v_team;
    end if;
    team_of := team_of || jsonb_build_object(t.uid::text, v_team);
    if t.is_home then home_uid := t.uid; home_id := v_team; else away_uid := t.uid; away_id := v_team; end if;

    -- ---- Players: the linked profile if it is on this team, else by name, else new.
    for p in select * from capture.game_players where team_uid = t.uid loop
      v_pid := null;
      select id into v_pid from public.players where id = p.site_player_id and team_id = v_team;
      if v_pid is null then
        select id into v_pid from public.players
         where team_id = v_team and lower(full_name) = lower(btrim(p.first_name || ' ' || p.last_name))
         order by created_at limit 1;
      end if;
      if v_pid is null then
        insert into public.players (full_name, firstname, familyname, "shirtNumber", team_name, league_id, team_id, position)
        values (btrim(p.first_name || ' ' || p.last_name), nullif(p.first_name, ''), nullif(p.last_name, ''),
                case when p.jersey_number ~ '^\d+$' then p.jersey_number::int end, t.name, comp.league_id, v_team, p.position)
        returning id into v_pid;
      end if;
      pid_of := pid_of || jsonb_build_object(p.uid::text, v_pid);
    end loop;
  end loop;
  if home_id is null or away_id is null then raise exception 'The game needs a home and an away team'; end if;

  -- ---- Start again for this game only.
  delete from public.game_rosters where game_key = v_key;
  delete from public.live_events  where game_key = v_key;
  delete from public.shot_chart   where game_key = v_key;
  delete from public.player_stats where game_key = v_key;
  delete from public.team_stats   where game_key = v_key;

  insert into public.game_schedule (game_key, competitionname, matchtime, hometeam, awayteam, league_id,
                                    home_team_id, away_team_id, status, attendance, officials, organisation)
  values (v_key, comp.name,
          (g.game_date + coalesce(g.tipoff_time, time '12:00')) at time zone 'Europe/London',
          (select name from capture.game_teams where uid = home_uid), (select name from capture.game_teams where uid = away_uid),
          comp.league_id, home_id, away_id,
          case g.status when 'final' then 'final' else 'live' end, g.attendance,
          (select jsonb_object_agg('referee' || rn, jsonb_build_object('name', name))
             from (select name, row_number() over (order by case role when 'crew_chief' then 0 else 1 end, created_at) rn
                     from capture.game_officials where game_uid = p_game and role in ('crew_chief', 'umpire')) o),
          comp.organisation)
  on conflict (game_key) do update set
    competitionname = excluded.competitionname, matchtime = excluded.matchtime, hometeam = excluded.hometeam,
    awayteam = excluded.awayteam, league_id = excluded.league_id, home_team_id = excluded.home_team_id,
    away_team_id = excluded.away_team_id, status = excluded.status, attendance = excluded.attendance,
    officials = excluded.officials;

  -- ---- Play by play, in game order. Also tracks who is on court for minutes and +/-.
  select coalesce(array_agg(gp.uid), '{}') into on_court
    from capture.game_players gp join capture.game_teams gt on gt.uid = gp.team_uid
   where gt.game_uid = p_game and gp.is_starter;

  for e in
    select se.*, gp.first_name, gp.last_name, gp.jersey_number
      from capture.stat_events se left join capture.game_players gp on gp.uid = se.player_uid
     where se.game_uid = p_game and se.voided_at is null
     order by se.device_seq, se.created_at
  loop
    n := n + 1;
    is_home := e.team_uid = home_uid;
    quals := '{}';
    ok := true; pts := 0; a_sub := '';

    -- game clock -> seconds since tip-off
    now_t := (least(e.period, g.period_count) - 1) * g.period_duration_mins * 60
           + greatest(e.period - g.period_count - 1, 0) * g.overtime_duration_mins * 60
           + greatest(0, (case when e.period > g.period_count then g.overtime_duration_mins else g.period_duration_mins end) * 60 - e.clock_seconds);
    if now_t > last_t then
      foreach u in array on_court loop
        secs := secs || jsonb_build_object(u::text, coalesce((secs->>u::text)::int, 0) + now_t - last_t);
      end loop;
      last_t := now_t;
    end if;

    case
      when e.event_type in ('2ptm', '2pta', '2ptb', '3ptm', '3pta', '3ptb') then
        a_type := left(e.event_type, 1) || 'pt';
        ok := e.event_type like '%m';
        pts := case when ok then left(e.event_type, 1)::int else 0 end;
        v_shot := (select q from unnest(e.qualifiers) q where q in ('layup', 'dunk', 'hook', 'tip') limit 1);
        a_sub := case v_shot when 'layup' then 'layup' when 'dunk' then 'dunk' when 'hook' then 'hookshot' when 'tip' then 'tipinlayup' else 'jumpshot' end;
        if e.shot_zone in ('ra', 'paint') then quals := array_append(quals, 'pointsinthepaint'); end if;
        if 'fastbreak' = any(e.qualifiers) then quals := array_append(quals, 'fastbreak'); end if;
      when e.event_type in ('ftm', 'fta') then
        a_type := 'freethrow'; ok := e.event_type = 'ftm'; pts := case when ok then 1 else 0 end;
        a_sub := coalesce(e.ft_sequence_index, 1) || 'of' || coalesce(e.ft_sequence_total, 1);
      when e.event_type in ('oreb', 'dreb') then
        a_type := 'rebound'; a_sub := case e.event_type when 'oreb' then 'offensive' else 'defensive' end;
        if e.player_uid is null then quals := array_append(quals, 'team'); end if;
      when e.event_type = 'ast' then a_type := 'assist';
      when e.event_type = 'stl' then a_type := 'steal';
      when e.event_type = 'blk' then a_type := 'block';
      when e.event_type = 'fd'  then a_type := 'foulon';
      when e.event_type = 'tov' then
        a_type := 'turnover';
        a_sub := coalesce((select case q when 'bad_pass' then 'badpass' when 'ball_handling' then 'ballhandling' when 'travel' then 'travel'
                                         when 'out_of_bounds' then 'outofbounds' when 'double_dribble' then 'doubledribble'
                                         when 'three_seconds' then '3sec' when 'five_seconds' then '5sec' when 'eight_seconds' then '8sec'
                                         when 'shot_clock' then '24sec' when 'backcourt' then 'backcourt' when 'offensive_foul' then 'offensive' end
                             from unnest(e.qualifiers) q limit 1), '');
        if e.player_uid is null then quals := array_append(quals, 'team'); end if;
      when e.event_type = 'pf' then
        a_type := 'foul'; a_sub := case when 'offensive' = any(e.qualifiers) then 'offensive' else 'personal' end;
        if 'shooting' = any(e.qualifiers) then quals := array_append(quals, 'shooting'); end if;
      when e.event_type = 'tf' then
        a_type := 'foul';
        a_sub := case when 'coach' = any(e.qualifiers) then 'coachTechnical' when 'bench' = any(e.qualifiers) then 'benchTechnical' else 'technical' end;
      when e.event_type = 'flagrant' then
        a_type := 'foul'; a_sub := case when 'disqualifying' = any(e.qualifiers) then 'disqualifying' else 'unsportsmanlike' end;
      when e.event_type in ('sub_in', 'sub_out') then
        a_type := 'substitution'; a_sub := case e.event_type when 'sub_in' then 'in' else 'out' end;
        if e.event_type = 'sub_in' and not e.player_uid = any(on_court) then on_court := on_court || e.player_uid; end if;
        if e.event_type = 'sub_out' then on_court := array_remove(on_court, e.player_uid); end if;
      when e.event_type = 'timeout' then a_type := 'timeout'; a_sub := 'full';
      when e.event_type = 'period_start' then a_type := 'period'; a_sub := 'start';
      when e.event_type = 'period_end' then a_type := 'period'; a_sub := 'end';
      when e.event_type = 'jump_ball' then a_type := 'jumpball'; a_sub := case when e.team_uid is null then 'startperiod' else 'won' end;
      else continue;
    end case;

    if pts > 0 then
      if is_home then hs := hs + pts; else aw := aw + pts; end if;
      by_period := by_period || jsonb_build_object(
        e.team_uid::text || ':' || least(e.period, 4),
        coalesce((by_period->>(e.team_uid::text || ':' || least(e.period, 4)))::int, 0) + pts);
      foreach u in array on_court loop
        pm := pm || jsonb_build_object(u::text, coalesce((pm->>u::text)::int, 0)
              + case when (select team_uid from capture.game_players where uid = u) = e.team_uid then pts else -pts end);
      end loop;
    end if;

    insert into public.live_events (league_id, game_key, team_id, action_number, period, clock, player_name, team_no,
                                    action_type, sub_type, qualifiers, success, scoring, score, x_coord, y_coord,
                                    player_id, points, shirt_number, period_type, team_score, opp_score, score_diff, created_at)
    values (comp.league_id, v_key, (team_of->>e.team_uid::text)::uuid, n, e.period,
            lpad((e.clock_seconds / 60)::text, 2, '0') || ':' || lpad((e.clock_seconds % 60)::text, 2, '0') || ':00',
            case when e.player_uid is null then ''
                 else btrim(coalesce(left(nullif(e.first_name, ''), 1) || '. ', '') || e.last_name) end,
            case when e.team_uid is null then 0 when is_home then 1 else 2 end,
            a_type, a_sub, nullif(quals, '{}'), ok, a_type in ('2pt', '3pt', 'freethrow'), hs || '-' || aw,
            case when a_type in ('2pt', '3pt') then e.shot_x end, case when a_type in ('2pt', '3pt') then e.shot_y end,
            (pid_of->>e.player_uid::text)::uuid, pts, coalesce(e.jersey_number, ''),
            case when e.period > g.period_count then 'OVERTIME' else 'REGULAR' end,
            case when e.team_uid is null then null when is_home then hs else aw end,
            case when e.team_uid is null then null when is_home then aw else hs end,
            case when e.team_uid is null then null when is_home then hs - aw else aw - hs end,
            v_base + n * interval '1 millisecond');

    if a_type in ('2pt', '3pt') and e.shot_x is not null then
      insert into public.shot_chart (league_id, game_key, team_id, player_name, team_no, period, clock, shot_type, sub_type,
                                     success, x, y, player_id, action_number)
      values (comp.league_id, v_key, (team_of->>e.team_uid::text)::uuid,
              btrim(coalesce(left(nullif(e.first_name, ''), 1) || '. ', '') || e.last_name),
              case when is_home then 1 else 2 end, e.period,
              lpad((e.clock_seconds / 60)::text, 2, '0') || ':' || lpad((e.clock_seconds % 60)::text, 2, '0') || ':00',
              a_type, a_sub, ok, e.shot_x, e.shot_y, (pid_of->>e.player_uid::text)::uuid, n);
    end if;
  end loop;

  -- Players still on court keep the clock until where the game has got to.
  now_t := (least(g.current_period, g.period_count) - 1) * g.period_duration_mins * 60
         + greatest(g.current_period - g.period_count - 1, 0) * g.overtime_duration_mins * 60
         + greatest(0, (case when g.current_period > g.period_count then g.overtime_duration_mins else g.period_duration_mins end) * 60 - g.clock_seconds);
  if now_t > last_t then
    foreach u in array on_court loop
      secs := secs || jsonb_build_object(u::text, coalesce((secs->>u::text)::int, 0) + now_t - last_t);
    end loop;
  end if;

  -- ---- Box score: one row per rostered player.
  insert into public.player_stats (
    league_id, parent_league_id, age_group, is_public, game_key, team_id, team_name, player_id, full_name, firstname, familyname,
    shirtnumber, position, playingposition, starter, captain, active, side, identifier_duplicate, source_type,
    sminutes, spoints, sfieldgoalsmade, sfieldgoalsattempted, sfieldgoalspercentage,
    stwopointersmade, stwopointersattempted, stwopointerspercentage,
    sthreepointersmade, sthreepointersattempted, sthreepointerspercentage,
    sfreethrowsmade, sfreethrowsattempted, sfreethrowspercentage,
    sreboundsoffensive, sreboundsdefensive, sreboundstotal, sassists, sturnovers, ssteals, sblocks,
    sfoulspersonal, sfoulson, splusminuspoints, spointsfastbreak, spointsinthepaint, efg_percent, ts_percent, efficiency)
  select comp.league_id, comp.parent_league_id, comp.age_group, p_listed, v_key, (team_of->>gt.uid::text)::uuid, gt.name,
         (pid_of->>gp.uid::text)::uuid, btrim(gp.first_name || ' ' || gp.last_name), gp.first_name, gp.last_name,
         gp.jersey_number, gp.position, gp.position, gp.is_starter, gp.is_captain, true,
         case when gt.is_home then '1' else '2' end, v_key || '_' || gp.uid, 'swish_stats',
         lpad((coalesce((secs->>gp.uid::text)::int, 0) / 60)::text, 2, '0') || ':' || lpad((coalesce((secs->>gp.uid::text)::int, 0) % 60)::text, 2, '0'),
         s.pts, s.fgm, s.fga, round(100.0 * s.fgm / nullif(s.fga, 0), 1),
         s.m2, s.a2, round(100.0 * s.m2 / nullif(s.a2, 0), 1),
         s.m3, s.a3, round(100.0 * s.m3 / nullif(s.a3, 0), 1),
         s.ftm, s.fta, round(100.0 * s.ftm / nullif(s.fta, 0), 1),
         s.oreb, s.dreb, s.oreb + s.dreb, s.ast, s.tov, s.stl, s.blk, s.fouls, s.fd,
         coalesce((pm->>gp.uid::text)::int, 0), s.fb, s.pitp,
         round(100.0 * (s.fgm + 0.5 * s.m3) / nullif(s.fga, 0), 1),
         round(100.0 * s.pts / nullif(2 * (s.fga + 0.44 * s.fta), 0), 1),
         s.pts + s.oreb + s.dreb + s.ast + s.stl + s.blk - (s.fga - s.fgm) - (s.fta - s.ftm) - s.tov
    from capture.game_players gp
    join capture.game_teams gt on gt.uid = gp.team_uid and gt.game_uid = p_game
    cross join lateral (
      select coalesce(sum(case event_type when '2ptm' then 2 when '3ptm' then 3 when 'ftm' then 1 else 0 end), 0)::int pts,
             count(*) filter (where event_type in ('2ptm', '3ptm'))::int fgm,
             count(*) filter (where event_type in ('2ptm', '2pta', '2ptb', '3ptm', '3pta', '3ptb'))::int fga,
             count(*) filter (where event_type = '2ptm')::int m2,
             count(*) filter (where event_type in ('2ptm', '2pta', '2ptb'))::int a2,
             count(*) filter (where event_type = '3ptm')::int m3,
             count(*) filter (where event_type in ('3ptm', '3pta', '3ptb'))::int a3,
             count(*) filter (where event_type = 'ftm')::int ftm,
             count(*) filter (where event_type in ('ftm', 'fta'))::int fta,
             count(*) filter (where event_type = 'oreb')::int oreb,
             count(*) filter (where event_type = 'dreb')::int dreb,
             count(*) filter (where event_type = 'ast')::int ast,
             count(*) filter (where event_type = 'tov')::int tov,
             count(*) filter (where event_type = 'stl')::int stl,
             count(*) filter (where event_type = 'blk')::int blk,
             count(*) filter (where event_type in ('pf', 'tf', 'flagrant'))::int fouls,
             count(*) filter (where event_type = 'fd')::int fd,
             coalesce(sum(case when 'fastbreak' = any(qualifiers) then case event_type when '2ptm' then 2 when '3ptm' then 3 when 'ftm' then 1 else 0 end else 0 end), 0)::int fb,
             coalesce(sum(case when shot_zone in ('ra', 'paint') and event_type = '2ptm' then 2 else 0 end), 0)::int pitp
        from capture.stat_events se
       where se.game_uid = p_game and se.voided_at is null and se.player_uid = gp.uid
    ) s
   where gp.is_active;

  -- ---- Rosters, as the lineup / on-off builder reads them (starters decide who is on court at tip-off).
  insert into public.game_rosters (game_key, league_id, team_id, team_no, player_name, shirt_number, pno, starter, active, player_id)
  select v_key, comp.league_id, (team_of->>gt.uid::text)::uuid, case when gt.is_home then '1' else '2' end,
         btrim(gp.first_name || ' ' || gp.last_name), gp.jersey_number,
         row_number() over (partition by gt.uid order by gp.created_at, gp.uid)::int,
         gp.is_starter, gp.is_active, (pid_of->>gp.uid::text)::uuid
    from capture.game_players gp
    join capture.game_teams gt on gt.uid = gp.team_uid and gt.game_uid = p_game;

  -- ---- Team totals (players + anything credited to the team itself).
  insert into public.team_stats (
    league_id, parent_league_id, age_group, is_public, game_key, team_id, name, shortname, coach, side,
    identifier_duplicate, source_type, score, full_score, p1_score, p2_score, p3_score, p4_score, tot_sminutes,
    tot_spoints, tot_sfieldgoalsmade, tot_sfieldgoalsattempted, tot_sfieldgoalspercentage,
    tot_stwopointersmade, tot_stwopointersattempted, tot_stwopointerspercentage,
    tot_sthreepointersmade, tot_sthreepointersattempted, tot_sthreepointerspercentage,
    tot_sfreethrowsmade, tot_sfreethrowsattempted, tot_sfreethrowspercentage,
    tot_sreboundsoffensive, tot_sreboundsdefensive, tot_sreboundstotal,
    tot_sreboundsteam, tot_sreboundsteamoffensive, tot_sreboundsteamdefensive,
    tot_sassists, tot_sturnovers, tot_ssteals, tot_sblocks, tot_sfoulspersonal, tot_sfoulson,
    tot_spointsfastbreak, tot_spointsinthepaint, splusminuspoints,
    possessions, opp_points, efg_percent, ts_percent, off_rating)
  select comp.league_id, comp.parent_league_id, comp.age_group, p_listed, v_key, (team_of->>gt.uid::text)::uuid, gt.name,
         nullif(gt.abbreviation, ''), gt.head_coach, case when gt.is_home then '1' else '2' end,
         v_key || '_' || (team_of->>gt.uid::text), 'swish_stats',
         case when gt.is_home then hs else aw end, hs || '-' || aw,
         coalesce((by_period->>(gt.uid::text || ':1'))::int, 0), coalesce((by_period->>(gt.uid::text || ':2'))::int, 0),
         coalesce((by_period->>(gt.uid::text || ':3'))::int, 0), coalesce((by_period->>(gt.uid::text || ':4'))::int, 0),
         (last_t / 60 * 5) || ':00',
         s.pts, s.fgm, s.fga, round(100.0 * s.fgm / nullif(s.fga, 0), 1),
         s.m2, s.a2, round(100.0 * s.m2 / nullif(s.a2, 0), 1),
         s.m3, s.a3, round(100.0 * s.m3 / nullif(s.a3, 0), 1),
         s.ftm, s.fta, round(100.0 * s.ftm / nullif(s.fta, 0), 1),
         s.oreb, s.dreb, s.oreb + s.dreb, s.treb, s.toreb, s.treb - s.toreb,
         s.ast, s.tov, s.stl, s.blk, s.fouls, s.fd, s.fb, s.pitp,
         case when gt.is_home then hs - aw else aw - hs end,
         round(s.fga + 0.44 * s.fta - s.oreb + s.tov, 1),
         case when gt.is_home then aw else hs end,
         round(100.0 * (s.fgm + 0.5 * s.m3) / nullif(s.fga, 0), 1),
         round(100.0 * s.pts / nullif(2 * (s.fga + 0.44 * s.fta), 0), 1),
         round(100.0 * s.pts / nullif(s.fga + 0.44 * s.fta - s.oreb + s.tov, 0), 1)
    from capture.game_teams gt
    cross join lateral (
      select coalesce(sum(case event_type when '2ptm' then 2 when '3ptm' then 3 when 'ftm' then 1 else 0 end), 0)::int pts,
             count(*) filter (where event_type in ('2ptm', '3ptm'))::int fgm,
             count(*) filter (where event_type in ('2ptm', '2pta', '2ptb', '3ptm', '3pta', '3ptb'))::int fga,
             count(*) filter (where event_type = '2ptm')::int m2,
             count(*) filter (where event_type in ('2ptm', '2pta', '2ptb'))::int a2,
             count(*) filter (where event_type = '3ptm')::int m3,
             count(*) filter (where event_type in ('3ptm', '3pta', '3ptb'))::int a3,
             count(*) filter (where event_type = 'ftm')::int ftm,
             count(*) filter (where event_type in ('ftm', 'fta'))::int fta,
             count(*) filter (where event_type = 'oreb')::int oreb,
             count(*) filter (where event_type = 'dreb')::int dreb,
             count(*) filter (where event_type in ('oreb', 'dreb') and player_uid is null)::int treb,
             count(*) filter (where event_type = 'oreb' and player_uid is null)::int toreb,
             count(*) filter (where event_type = 'ast')::int ast,
             count(*) filter (where event_type = 'tov')::int tov,
             count(*) filter (where event_type = 'stl')::int stl,
             count(*) filter (where event_type = 'blk')::int blk,
             count(*) filter (where event_type in ('pf', 'tf', 'flagrant'))::int fouls,
             count(*) filter (where event_type = 'fd')::int fd,
             coalesce(sum(case when 'fastbreak' = any(qualifiers) then case event_type when '2ptm' then 2 when '3ptm' then 3 when 'ftm' then 1 else 0 end else 0 end), 0)::int fb,
             coalesce(sum(case when shot_zone in ('ra', 'paint') and event_type = '2ptm' then 2 else 0 end), 0)::int pitp
        from capture.stat_events se
       where se.game_uid = p_game and se.voided_at is null and se.team_uid = gt.uid
    ) s
   where gt.game_uid = p_game;

  update public.game_schedule set home_score = hs,
         final_detected_at = case when g.status = 'final' then coalesce(final_detected_at, now()) end,
         parsed_at = now()
   where game_key = v_key;

  return v_key;
end;
$$;

revoke all on function capture.publish_game(uuid, boolean) from public, anon;
grant execute on function capture.publish_game(uuid, boolean) to authenticated;
