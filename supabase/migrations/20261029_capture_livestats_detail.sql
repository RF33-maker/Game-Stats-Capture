-- LiveStats-level detail on published play-by-play.
--
-- Compared with the NBL Division One 2026-27 LiveStats games, the first
-- captured game (Liverpool v Tees Valley) went out with every shot a jump
-- shot, no 'blocked' tag on blocked shots and no free-throw count on fouls.
-- Pro scoring now always asks the shot type (the full LiveStats list),
-- turnover type and fast break, so the publisher needs to carry them:
--
--  * Shot types: every capture tag maps to its LiveStats sub_type (this
--    replaces 20261028_capture_floater_shot_type.sql, never applied).
--  * A missed shot followed by the other team's block at the same moment is
--    tagged 'blocked', as LiveStats tags it (about 5 a game in D1).
--  * A foul followed by the other team's free throws is tagged
--    '1freethrow' / '2freethrow' / '3freethrow' (about 14 a game in D1).
--
-- Checked by stripping these tags from the 64 LiveStats D1 games and re-tagging
-- them with the rules below: 'blocked' 318 of LiveStats' 319 (24 extra); free
-- throws agree on ~800 fouls, with ~10% either way, mostly games whose stored
-- play-by-play is incomplete. (LiveStats' untyped foul rows are skipped; the
-- capture app never writes those.)
--
-- Team rebounds and team turnovers ('team'), coach, referees, attendance and
-- playing position were already published; they were empty on that game
-- because they weren't recorded or filled in at setup.

-- Capture shot tag -> LiveStats sub_type. No tag (or 'jump') = jump shot.
create or replace function capture._shot_sub_type(p_qualifiers text[])
returns text language sql immutable set search_path to '' as $$
  select coalesce((
    select case q
             when 'layup'         then 'layup'
             when 'driving_layup' then 'drivinglayup'
             when 'reverse_layup' then 'reverselayup'
             when 'dunk'          then 'dunk'
             when 'alley_oop'     then 'alleyoop'
             when 'floater'       then 'floatingjumpshot'
             when 'tip'           then 'tipinlayup'
             when 'hook'          then 'hookshot'
             when 'pullup'        then 'pullupjumpshot'
             when 'stepback'      then 'stepbackjumpshot'
             when 'turnaround'    then 'turnaroundjumpshot'
             when 'fadeaway'      then 'fadeaway'
             when 'eurostep'      then 'eurostep'
           end
      from unnest(p_qualifiers) with ordinality u(q, i)
     where q in ('layup', 'driving_layup', 'reverse_layup', 'dunk', 'alley_oop', 'floater', 'tip',
                 'hook', 'pullup', 'stepback', 'turnaround', 'fadeaway', 'eurostep')
     order by i limit 1), 'jumpshot');
$$;
revoke all on function capture._shot_sub_type(text[]) from public, anon, authenticated;

-- 'blocked' on shots and the free-throw count on fouls, from a game's
-- just-published play-by-play (action_number is play order).
create or replace function capture._publish_detail_tags(p_key text)
returns void language plpgsql security definer set search_path to '' as $$
begin
  -- A missed shot is blocked when the other team's block is among the next
  -- few plays at the same clock (the app asks for the block, then the rebound).
  update public.live_events s
     set qualifiers = array_append(coalesce(s.qualifiers, '{}'), 'blocked')
   where s.game_key = p_key and s.action_type in ('2pt', '3pt') and not s.success
     and not ('blocked' = any(coalesce(s.qualifiers, '{}')))
     and exists (select 1 from public.live_events b
                  where b.game_key = p_key and b.action_type = 'block'
                    and b.period = s.period and b.clock = s.clock and b.team_no <> s.team_no
                    and b.action_number between s.action_number + 1 and s.action_number + 3);

  -- A foul's free throws: the first trip by the other team at the same clock
  -- before the next foul; '1of2' -> '2freethrow'.
  update public.live_events f
     set qualifiers = array_append(coalesce(f.qualifiers, '{}'), ft.total || 'freethrow')
    from (
      select f2.action_number n,
             (select split_part(t.sub_type, 'of', 2)
                from public.live_events t
               where t.game_key = p_key and t.action_type = 'freethrow'
                 and t.period = f2.period and t.clock = f2.clock and t.team_no <> f2.team_no
                 and t.action_number > f2.action_number
                 and t.action_number < coalesce((select min(x.action_number) from public.live_events x
                                                  where x.game_key = p_key and x.action_type = 'foul'
                                                    and x.action_number > f2.action_number), 2147483647)
               order by t.action_number limit 1) total
        from public.live_events f2
       where f2.game_key = p_key and f2.action_type = 'foul' and f2.sub_type <> ''
    ) ft
   where f.game_key = p_key and f.action_number = ft.n and ft.total in ('1', '2', '3')
     and not (ft.total || 'freethrow' = any(coalesce(f.qualifiers, '{}')));
end;
$$;
revoke all on function capture._publish_detail_tags(text) from public, anon, authenticated;

-- Patch the publisher: use the shot map, and tag before the game-flow pass
-- (which keeps every qualifier other than 2ndchance/fromturnover).
do $fix$
declare
  d text := pg_get_functiondef('capture._publish_game_core(uuid, boolean)'::regprocedure);
  old1 text := $q$        v_shot := (select q from unnest(e.qualifiers) q where q in ('layup', 'dunk', 'hook', 'tip') limit 1);
        a_sub := case v_shot when 'layup' then 'layup' when 'dunk' then 'dunk' when 'hook' then 'hookshot' when 'tip' then 'tipinlayup' else 'jumpshot' end;$q$;
  new1 text := $q$        a_sub := capture._shot_sub_type(e.qualifiers);$q$;
  old2 text := $q$  perform capture._publish_game_flow(p_game, v_key);$q$;
  new2 text := $q$  perform capture._publish_detail_tags(v_key);
  perform capture._publish_game_flow(p_game, v_key);$q$;
begin
  if (length(d) - length(replace(d, old1, ''))) <> length(old1) then
    raise exception 'shot sub type lines not found exactly once';
  end if;
  if (length(d) - length(replace(d, old2, ''))) <> length(old2) then
    raise exception 'game flow call not found exactly once';
  end if;
  execute replace(replace(d, old1, new1), old2, new2);
end
$fix$;
