-- League members with their names/emails, for the league page.
-- Emails live in auth.users, which signed-in users can't read, so this is a
-- security-definer function scoped to leagues the caller belongs to.
-- Additive, `capture` schema only.

create function capture.list_league_members(p_league uuid)
returns table (
  user_id    uuid,
  role       capture.league_role,
  email      text,
  first_name text,
  last_name  text,
  avatar_url text,
  created_at timestamptz
)
language sql stable security definer set search_path = ''
as $$
  select m.user_id,
         m.role,
         u.email::text,
         coalesce(u.raw_user_meta_data->>'first_name', split_part(u.raw_user_meta_data->>'full_name', ' ', 1)),
         coalesce(u.raw_user_meta_data->>'last_name',
                  nullif(regexp_replace(coalesce(u.raw_user_meta_data->>'full_name', ''), '^\S+\s*', ''), '')),
         coalesce(u.raw_user_meta_data->>'avatar_url', u.raw_user_meta_data->>'picture'),
         m.created_at
  from capture.league_members m
  join auth.users u on u.id = m.user_id
  where m.league_uid = p_league
    and capture.has_league_role(p_league, 'viewer')
  order by m.created_at;
$$;

revoke all on function capture.list_league_members(uuid) from public, anon;
grant execute on function capture.list_league_members(uuid) to authenticated;
