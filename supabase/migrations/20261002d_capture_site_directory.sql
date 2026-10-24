-- Swish Organiser directory: read-only search over the site's competitions,
-- teams and players, so rosters can link to existing ids.
--
-- capture schema only. Reads public tables (never writes them) and returns
-- only fields the site already shows publicly — no date of birth, no social
-- handles. Results follow the site's own visibility rule
-- (public.is_league_publicly_visible), plus any competition one of the
-- caller's capture leagues is linked to. Callable by people who score for or
-- run a capture league (and app admins).
--
-- On the site a "competition" is public.competitions, keyed by league_id;
-- players and teams carry that id in their league_id column.

create function capture.can_use_directory()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from capture.league_members m
    where m.user_id = auth.uid() and m.role >= 'scorer'
  ) or coalesce(public.is_app_admin(), false);
$$;

-- Competitions the caller may see in the directory.
create function capture.directory_competitions()
returns setof uuid
language sql stable security definer set search_path = ''
as $$
  select c.league_id
  from public.competitions c
  where capture.can_use_directory()
    and (
      coalesce(public.is_league_publicly_visible(c.league_id), false)
      or c.league_id in (
        select l.site_league_id from capture.leagues l
        where l.site_league_id is not null and capture.has_league_role(l.uid, 'scorer')
      )
    );
$$;

create function capture.search_site_competitions(p_query text default null, p_limit int default 20)
returns table (
  competition_id uuid, name text, season text, age_group text, gender text,
  division text, organisation text, logo_url text, team_count bigint, player_count bigint
)
language sql stable security definer set search_path = ''
as $$
  select c.league_id, c.name, c.season, c.age_group, c.gender, c.division, c.organisation, c.logo_url,
         (select count(*) from public.teams t where t.league_id = c.league_id),
         (select count(*) from public.players p where p.league_id = c.league_id)
  from public.competitions c
  where c.league_id in (select capture.directory_competitions())
    and (coalesce(btrim(p_query), '') = ''
         or c.name ilike '%' || btrim(p_query) || '%'
         or c.organisation ilike '%' || btrim(p_query) || '%')
  order by (c.name ilike btrim(coalesce(p_query, '')) || '%') desc, c.created_at desc
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

create function capture.search_site_teams(p_query text default null, p_competition uuid default null, p_limit int default 20)
returns table (
  team_id uuid, name text, logo_url text, competition_id uuid,
  competition_name text, season text, age_group text, player_count bigint
)
language sql stable security definer set search_path = ''
as $$
  select t.team_id, t.name, t.logo_url, t.league_id, c.name, c.season, c.age_group,
         (select count(*) from public.players p where p.team_id = t.team_id)
  from public.teams t
  join public.competitions c on c.league_id = t.league_id
  where t.league_id in (select capture.directory_competitions())
    and (p_competition is null or t.league_id = p_competition)
    and (coalesce(btrim(p_query), '') = '' or t.name ilike '%' || btrim(p_query) || '%')
  order by (t.name ilike btrim(coalesce(p_query, '')) || '%') desc, c.created_at desc, t.name
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$$;

create function capture.search_site_players(
  p_query text default null, p_competition uuid default null, p_team uuid default null, p_limit int default 25
)
returns table (
  player_id uuid, full_name text, first_name text, last_name text, shirt_number text,
  player_position text, photo_path text, team_id uuid, team_name text,
  competition_id uuid, competition_name text, season text, age_group text,
  other_rows bigint
)
language sql stable security definer set search_path = ''
as $$
  with q as (select nullif(btrim(coalesce(p_query, '')), '') as s)
  select p.id, p.full_name, p.firstname, p.familyname, p."shirtNumber"::text, p.position,
         coalesce(p.photo_path_bg_removed, p.photo_path),
         p.team_id, coalesce(t.name, p.team_name), p.league_id, c.name, c.season, c.age_group,
         -- other rows on the site with the same name (likely the same person elsewhere)
         (select count(*) - 1 from public.players o where lower(o.full_name) = lower(p.full_name))
  from public.players p
  join public.competitions c on c.league_id = p.league_id
  left join public.teams t on t.team_id = p.team_id
  cross join q
  where p.league_id in (select capture.directory_competitions())
    and (p_competition is null or p.league_id = p_competition)
    and (p_team is null or p.team_id = p_team)
    and (q.s is null
         or p.full_name ilike '%' || q.s || '%'
         or (coalesce(p.firstname, '') || ' ' || coalesce(p.familyname, '')) ilike '%' || q.s || '%'
         or (q.s ~ '^\d{1,3}$' and p."shirtNumber"::text = q.s))
    and (q.s is not null or p_team is not null or p_competition is not null)
  order by (p.full_name ilike coalesce(q.s, '') || '%') desc, c.created_at desc, p.full_name
  limit least(greatest(coalesce(p_limit, 25), 1), 200);
$$;

revoke all on function capture.can_use_directory() from public, anon;
revoke all on function capture.directory_competitions() from public, anon;
revoke all on function capture.search_site_competitions(text, int) from public, anon;
revoke all on function capture.search_site_teams(text, uuid, int) from public, anon;
revoke all on function capture.search_site_players(text, uuid, uuid, int) from public, anon;
grant execute on function capture.can_use_directory() to authenticated;
grant execute on function capture.directory_competitions() to authenticated;
grant execute on function capture.search_site_competitions(text, int) to authenticated;
grant execute on function capture.search_site_teams(text, uuid, int) to authenticated;
grant execute on function capture.search_site_players(text, uuid, uuid, int) to authenticated;
