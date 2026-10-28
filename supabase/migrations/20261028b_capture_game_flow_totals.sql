-- Team totals that LiveStats games have and captured games left empty.
--
-- A captured game's team_stats rows had no bench, second-chance or off-turnover
-- points, biggest lead, lead changes, times tied, time leading, biggest run or
-- team code. The site's league tables add a missing value as 0 while still
-- counting the game, so each captured game pulled both teams' averages down.
-- After every publish they are now worked out from what was just published:
--
--  * Each shot and free throw is tagged '2ndchance' (its possession had an
--    offensive rebound) and/or 'fromturnover' (its possession began with the
--    other team's turnover), as LiveStats tags its play-by-play. The team totals
--    are the made points carrying each tag, which is how LiveStats' own add up.
--  * Bench points: box-score points of players who did not start.
--  * Biggest lead, lead changes, times tied, time leading (minutes, as text, the
--    way LiveStats stores it) and biggest run: from the running score and clock.
--    Like LiveStats, a team that never led has no biggest lead (null, not 0).
--  * code is the team's abbreviation (it used to go in shortname); shortname is
--    the team's short name from its LiveStats games, else the abbreviation.
--  * Fast-break points need the scorer to tag fast breaks, which the app only
--    offers with detail prompts on. A game with no fast-break tag at all now
--    publishes them as unknown (null) rather than 0, for the team and players.
--    Likewise second-chance points need rebounds recorded, and off-turnover
--    points need turnovers recorded.
--
-- Also: a game that fills a site fixture now goes out under the fixture's team
-- names (team_stats.name, player_stats.team_name). They came from the capture
-- team, which can differ: Liverpool v Tees Valley went out as "Tees Valley
-- Mohawks Senior Men" against the fixture's "...Senior Men I", and the site,
-- which matches scores by team name, lost the score from the page title.
--
-- Checked by running the same rules on the 64 LiveStats games of NBL Division
-- One 2026-27 and comparing with LiveStats' figures (128 team rows): bench points
-- 128 exact; second-chance and off-turnover points within 3% in total (107 and 94
-- rows exact); biggest lead 125; time leading within 30 seconds 119; biggest run
-- 115; lead changes 110; times tied 102. Most of the rest are games whose stored
-- play-by-play is incomplete (in 20 of the 64 the shots don't add up to the final).

-- Second-chance and off-turnover attempts, from a game's published play-by-play.
-- The ball changes hands on a turnover, a defensive rebound, a jump ball won, or
-- the other team shooting; nobody has it at a period's start or end. Free throws
-- for a technical don't change possession. LiveStats records a dead-ball team
-- rebound after a missed first free throw: that is not a second chance.
create function capture._possession_tags(p_key text)
returns table(action_number int, tags text[])
language plpgsql stable set search_path = ''
as $$
declare
  e        record;
  owner    int;                 -- team_no with the ball
  from_tov boolean := false;    -- this possession began with the other team's turnover
  second   boolean := false;    -- this possession has had an offensive rebound
  tech     boolean := false;    -- the last foul was a technical
  ft_more  boolean := false;    -- the last play was a free throw with more to come
begin
  for e in
    select le.action_number n, le.team_no t, le.action_type a, le.sub_type s
      from public.live_events le where le.game_key = p_key order by le.action_number
  loop
    if e.a in ('period', 'game') then
      owner := null; from_tov := false; second := false; tech := false; ft_more := false;
    elsif e.t not in (1, 2) then
      continue;
    elsif e.a = 'jumpball' and e.s = 'won' then
      owner := e.t; from_tov := false; second := false; ft_more := false;
    elsif e.a = 'turnover' then
      owner := 3 - e.t; from_tov := true; second := false; tech := false; ft_more := false;
    elsif e.a = 'rebound' and e.s = 'offensive' then
      if ft_more then continue; end if;
      if owner is distinct from e.t then owner := e.t; from_tov := false; end if;
      second := true; tech := false;
    elsif e.a = 'rebound' then
      owner := e.t; from_tov := false; second := false; tech := false; ft_more := false;
    elsif e.a = 'foul' then
      tech := e.s ilike '%technical%';
    elsif e.a in ('2pt', '3pt', 'freethrow') then
      ft_more := e.a = 'freethrow' and e.s ~ '^\d+of\d+$'
                 and split_part(e.s, 'of', 1)::int < split_part(e.s, 'of', 2)::int;
      action_number := e.n;
      if e.a = 'freethrow' and tech then
        tags := '{}';
      else
        tech := false;
        if owner is distinct from e.t then owner := e.t; from_tov := false; second := false; end if;
        tags := case when second then array['2ndchance'] else '{}' end
             || case when from_tov then array['fromturnover'] else '{}' end;
      end if;
      return next;
    end if;
  end loop;
end;
$$;
revoke all on function capture._possession_tags(text) from public, anon, authenticated;

-- The team totals above for one published game, per side (team_no 1 home, 2 away).
-- Reads the play-by-play's running score, clock and qualifiers, and the box score,
-- so it gives LiveStats' own figures back on a LiveStats game.
create function capture._game_flow(p_key text, p_periods int, p_period_mins int, p_ot_mins int)
returns table(team_no int, bench_points int, second_chance_points int, points_from_turnovers int,
              biggest_lead int, lead_changes int, times_tied int, time_leading text, biggest_run int)
language sql stable set search_path = ''
as $$
  with ev as (
    select le.action_number,
           split_part(le.score, '-', 1)::int h, split_part(le.score, '-', 2)::int a,
           -- seconds since tip-off, never going backwards (a play added late can carry an earlier clock)
           max((least(le.period, p_periods) - 1) * p_period_mins * 60
               + greatest(le.period - p_periods - 1, 0) * p_ot_mins * 60
               + (case when le.period > p_periods then p_ot_mins else p_period_mins end) * 60
               - (split_part(le.clock, ':', 1)::int * 60 + split_part(le.clock, ':', 2)::int
                  + coalesce(nullif(split_part(le.clock, ':', 3), '')::numeric, 0) / 100))
             over (order by le.action_number) t
      from public.live_events le
     where le.game_key = p_key and le.period >= 1 and le.clock ~ '^\d+:\d+' and le.score ~ '^\d+-\d+$'
  ),
  -- each change of score: who scored, how many, the margin after it, and how long it stood
  sc as (
    select action_number, diff, case when d1 > 0 and d2 <= 0 then 1 when d2 > 0 and d1 <= 0 then 2 end team_no,
           greatest(d1, d2) pts, coalesce(lead(t) over (order by action_number), (select max(t) from ev)) - t dur
      from (select action_number, t, h - a diff,
                   h - lag(h, 1, 0) over (order by action_number) d1, a - lag(a, 1, 0) over (order by action_number) d2
              from ev) x
     where d1 <> 0 or d2 <> 0
  ),
  leader as (select sign(diff) s, lag(sign(diff)) over (order by action_number) prev from sc where diff <> 0),
  runs as (
    select team_no, sum(pts) run
      from (select team_no, pts, count(*) filter (where team_no is distinct from prev_team) over (order by action_number) grp
              from (select action_number, team_no, pts, lag(team_no) over (order by action_number) prev_team from sc) x) y
     where team_no is not null
     group by grp, team_no
  ),
  made as (
    select le.team_no, le.qualifiers q, case le.action_type when '3pt' then 3 when '2pt' then 2 else 1 end pts
      from public.live_events le
     where le.game_key = p_key and le.success and le.action_type in ('2pt', '3pt', 'freethrow')
  )
  select tm.t,
         (select case when bool_or(ps.starter) then coalesce(sum(ps.spoints) filter (where not coalesce(ps.starter, false)), 0) end::int
            from public.player_stats ps where ps.game_key = p_key and ps.side = tm.t::text),
         (select coalesce(sum(pts) filter (where '2ndchance' = any(q)), 0)::int from made where made.team_no = tm.t),
         (select coalesce(sum(pts) filter (where 'fromturnover' = any(q)), 0)::int from made where made.team_no = tm.t),
         (select nullif(greatest(0, coalesce(max(case when tm.t = 1 then diff else -diff end), 0)), 0)::int from sc),
         (select count(*)::int from leader where prev is not null and s <> prev),
         (select count(*)::int from sc where diff = 0),
         (select (coalesce(sum(dur) filter (where case when tm.t = 1 then diff > 0 else diff < 0 end), 0)::float8 / 60)::text from sc),
         (select max(run)::int from runs where runs.team_no = tm.t)
    from (values (1), (2)) tm(t);
$$;
revoke all on function capture._game_flow(text, int, int, int) from public, anon, authenticated;

-- Tags the play-by-play published under p_key and fills the team totals. Safe to
-- run again on rows already published (the tags are replaced, not added twice).
create function capture._publish_game_flow(p_game uuid, p_key text)
returns void
language plpgsql set search_path = ''
as $$
declare
  g       capture.games%rowtype;
  has_reb boolean; has_tov boolean; has_fb boolean;
begin
  select * into g from capture.games where uid = p_game;
  select coalesce(bool_or(event_type in ('oreb', 'dreb')), false), coalesce(bool_or(event_type = 'tov'), false),
         coalesce(bool_or('fastbreak' = any(qualifiers)), false)
    into has_reb, has_tov, has_fb
    from capture.stat_events where game_uid = p_game and voided_at is null;

  update public.live_events le
     set qualifiers = nullif(pt.tags || array(select q from unnest(le.qualifiers) with ordinality u(q, i)
                                               where q not in ('2ndchance', 'fromturnover') order by i), '{}')
    from capture._possession_tags(p_key) pt
   where le.game_key = p_key and le.action_number = pt.action_number;

  update public.team_stats ts
     set tot_sbenchpoints         = f.bench_points,
         tot_spointssecondchance  = case when has_reb then f.second_chance_points end,
         tot_spointsfromturnovers = case when has_tov then f.points_from_turnovers end,
         tot_spointsfastbreak     = case when has_fb then ts.tot_spointsfastbreak end,
         tot_sbiggestlead         = f.biggest_lead,
         tot_leadchanges          = f.lead_changes,
         tot_timesscoreslevel     = f.times_tied,
         tot_timeleading          = f.time_leading,
         tot_biggestscoringrun    = f.biggest_run::text,
         code      = coalesce(nullif(upper(btrim(gt.abbreviation)), ''),
                              (select o.code from public.team_stats o
                                where o.team_id = ts.team_id and o.source_type is distinct from 'swish_stats' and nullif(o.code, '') is not null
                                order by o.created_at desc limit 1)),
         shortname = coalesce((select o.shortname from public.team_stats o
                                where o.team_id = ts.team_id and o.source_type is distinct from 'swish_stats' and nullif(o.shortname, '') is not null
                                order by o.created_at desc limit 1),
                              nullif(btrim(gt.abbreviation), ''))
    from capture._game_flow(p_key, g.period_count, g.period_duration_mins, g.overtime_duration_mins) f,
         capture.game_teams gt
   where ts.game_key = p_key and ts.side = f.team_no::text
     and gt.game_uid = p_game and gt.is_home = (f.team_no = 1);

  if not has_fb then
    update public.player_stats set spointsfastbreak = null where game_key = p_key;
  end if;
end;
$$;
revoke all on function capture._publish_game_flow(uuid, text) from public, anon, authenticated;

-- For a game filling a site fixture, the team names the fixture uses, on the rows
-- published under p_key. Only where the side's team is the fixture's team; with
-- no fixture (or no name on it) the capture team's name stays.
create function capture._publish_fixture_names(p_game uuid, p_key text)
returns void
language plpgsql set search_path = ''
as $$
declare
  v_fixture text := (select site_game_key from capture.games where uid = p_game);
begin
  if v_fixture is null then return; end if;
  update public.team_stats ts
     set name = case ts.side when '1' then s.hometeam else s.awayteam end
    from public.game_schedule s
   where s.game_key = v_fixture and ts.game_key = p_key
     and ts.team_id = case ts.side when '1' then s.home_team_id when '2' then s.away_team_id end
     and nullif(btrim(case ts.side when '1' then s.hometeam else s.awayteam end), '') is not null;
  update public.player_stats ps
     set team_name = case ps.side when '1' then s.hometeam else s.awayteam end
    from public.game_schedule s
   where s.game_key = v_fixture and ps.game_key = p_key
     and ps.team_id = case ps.side when '1' then s.home_team_id when '2' then s.away_team_id end
     and nullif(btrim(case ps.side when '1' then s.hometeam else s.awayteam end), '') is not null;
end;
$$;
revoke all on function capture._publish_fixture_names(uuid, text) from public, anon, authenticated;

-- The publisher does both last, once the box score and team rows are written.
do $fix$
declare
  d text := pg_get_functiondef('capture._publish_game_core(uuid, boolean)'::regprocedure);
  old text := $q$  update public.game_schedule set home_score = hs,$q$;
  new text := $q$  perform capture._publish_game_flow(p_game, v_key);
  perform capture._publish_fixture_names(p_game, v_key);

  update public.game_schedule set home_score = hs,$q$;
begin
  if (length(d) - length(replace(d, old, ''))) <> length(old) then
    raise exception 'schedule score update not found exactly once';
  end if;
  execute replace(d, old, new);
end
$fix$;
