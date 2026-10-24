-- A team's roster is this season's players, not every player ever filed under it.
--
-- The site keeps one team record per competition, but its players are filed by
-- the competition they were first imported under. A returning player's old row
-- (filed under last season's competition) is still attached to this season's
-- team, so a roster search by team returned the whole history: 43 rows for
-- Liverpool in NBL D1 2026-27, 31 of them from 2025-26, plus initial-only
-- duplicates ("D. Walsh" next to "Daniel Walsh").
--
-- A player is on this season's roster when their row is filed under the team's
-- competition, or they have played for the team in it. Initial-only duplicates
-- of a full-name row are hidden, and the shirt number comes from this season's
-- box scores when there is one (last season's number can be stale or clash).
-- p_include_past = true gives the old behaviour for the "Earlier seasons" option.
--
-- start_site_game seeds a new game's squads the same way.

drop function capture.search_site_players(text, uuid, uuid, integer);

create function capture.search_site_players(
  p_query text default null, p_competition uuid default null, p_team uuid default null,
  p_limit integer default 25, p_include_past boolean default false)
returns table (player_id uuid, full_name text, first_name text, last_name text, shirt_number text,
               player_position text, photo_path text, team_id uuid, team_name text, competition_id uuid,
               competition_name text, season text, age_group text, other_rows bigint)
language sql stable security definer set search_path = ''
as $$
  with q as (select nullif(btrim(coalesce(p_query, '')), '') as s)
  select p.id, p.full_name, p.firstname, p.familyname,
         coalesce(cur.num, p."shirtNumber"::text), p.position,
         coalesce(p.photo_path_bg_removed, p.photo_path),
         p.team_id, coalesce(t.name, p.team_name),
         case when p_team is not null and not p_include_past then ct.league_id else p.league_id end,
         case when p_team is not null and not p_include_past then ct.name else c.name end,
         case when p_team is not null and not p_include_past then ct.season else c.season end,
         case when p_team is not null and not p_include_past then ct.age_group else c.age_group end,
         (select count(*) - 1 from public.players o where lower(o.full_name) = lower(p.full_name))
  from public.players p
  join public.competitions c on c.league_id = p.league_id
  left join public.teams t on t.team_id = p.team_id
  left join public.competitions ct on ct.league_id = t.league_id
  left join lateral (
    select (array_agg(nullif(btrim(s.shirtnumber::text), '') order by s.created_at desc)
              filter (where nullif(btrim(s.shirtnumber::text), '') is not null))[1] as num,
           count(*) as games
      from public.player_stats s
     where s.player_id = p.id and s.team_id = p.team_id and s.league_id = t.league_id
  ) cur on true
  cross join q
  where p.league_id in (select capture.directory_competitions())
    and (p_competition is null or p.league_id = p_competition)
    and (p_team is null or p.team_id = p_team)
    -- this season's roster: filed under the team's competition, or has played for the team in it
    and (p_team is null or p_include_past or p.league_id = t.league_id or cur.games > 0)
    -- hide "D. Walsh" when "Daniel Walsh" is on the same team
    and (p_team is null or p_include_past
         or not (p.full_name ~ '^[A-Za-z]\. '
                 and exists (select 1 from public.players o
                              where o.team_id = p.team_id and o.id <> p.id and o.full_name !~ '^[A-Za-z]\. '
                                and o.full_name ilike (left(p.full_name, 1) || '% ' || substr(p.full_name, 4)))))
    and (q.s is null or p.full_name ilike '%' || q.s || '%'
         or (coalesce(p.firstname, '') || ' ' || coalesce(p.familyname, '')) ilike '%' || q.s || '%'
         or (q.s ~ '^\d{1,3}$' and coalesce(cur.num, p."shirtNumber"::text) = q.s))
    and (q.s is not null or p_team is not null or p_competition is not null)
  order by (p.full_name ilike coalesce(q.s, '') || '%') desc, coalesce(cur.games, 0) desc, c.created_at desc, p.full_name
  limit least(greatest(coalesce(p_limit, 25), 1), 200);
$$;
revoke all on function capture.search_site_players(text, uuid, uuid, integer, boolean) from public, anon;
grant execute on function capture.search_site_players(text, uuid, uuid, integer, boolean) to authenticated;

-- "Score a site game": copy this season's squad, not the team's whole history.
do $fix$
declare
  d text := pg_get_functiondef('capture.start_site_game(uuid, text)'::regprocedure);
  old text := $q$      with r as (
        select p.id, p."shirtNumber"::text as num, p.position,
               coalesce(nullif(btrim(p.firstname), ''), split_part(btrim(p.full_name), ' ', 1)) as fn,
               coalesce(nullif(btrim(p.familyname), ''), nullif(btrim(substr(btrim(p.full_name), length(split_part(btrim(p.full_name), ' ', 1)) + 2)), ''), '') as ln
          from public.players p where p.team_id = v_tid
      )$q$;
  new text := $q$      with r as (
        select p.id, coalesce(cur.num, p."shirtNumber"::text) as num, p.position,
               coalesce(nullif(btrim(p.firstname), ''), split_part(btrim(p.full_name), ' ', 1)) as fn,
               coalesce(nullif(btrim(p.familyname), ''), nullif(btrim(substr(btrim(p.full_name), length(split_part(btrim(p.full_name), ' ', 1)) + 2)), ''), '') as ln
          from public.players p
          join public.teams tt on tt.team_id = p.team_id
          left join lateral (
            select (array_agg(nullif(btrim(s.shirtnumber::text), '') order by s.created_at desc)
                      filter (where nullif(btrim(s.shirtnumber::text), '') is not null))[1] as num,
                   count(*) as games
              from public.player_stats s
             where s.player_id = p.id and s.team_id = p.team_id and s.league_id = tt.league_id
          ) cur on true
         where p.team_id = v_tid and (p.league_id = tt.league_id or cur.games > 0)
      )$q$;
begin
  if (length(d) - length(replace(d, old, ''))) <> length(old) then
    raise exception 'squad query not found exactly once';
  end if;
  execute replace(d, old, new);
end
$fix$;
