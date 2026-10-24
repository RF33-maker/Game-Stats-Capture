-- Running leagues and games is a paid feature that Swish approves first.
--
-- Until now any signed-in account could insert a league (leagues_insert only
-- checked created_by), became its admin through add_creator_as_admin, and so
-- could create games, teams and fixtures. Scoring a game someone else set up
-- (game code, assigned scorer, team manager) is not affected; only creating
-- leagues is gated, and games, teams, venues and fixtures all hang off a league
-- the creator administers.
--
-- 1. capture.organiser_access: one row per account that asked, approved or
--    revoked by a Swish admin (public.is_app_admin()).
-- 2. leagues_insert now also needs an approved organiser (Swish admins count).
-- 3. A league may only be linked to a Swish competition (site_league_id, which
--    decides where publish_game writes) by a Swish admin or that competition's
--    owner. Before, any league admin could point their league at any
--    competition, e.g. the NBL's, and publish teams and players into it.
--
-- Existing league creators are approved so nothing already running stops.

create table capture.organiser_access (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'approved', 'revoked')),
  organisation text check (length(organisation) <= 200),
  note         text check (length(note) <= 1000),
  plan         text,            -- set when billing exists; approval is manual until then
  requested_at timestamptz not null default now(),
  decided_at   timestamptz,
  decided_by   uuid references auth.users(id) on delete set null
);
alter table capture.organiser_access enable row level security;
revoke all on capture.organiser_access from public, anon, authenticated;
grant select on capture.organiser_access to authenticated;

-- A person sees their own request; Swish admins see all. Nobody writes the
-- table directly: requests and decisions go through the functions below.
create policy organiser_access_select on capture.organiser_access for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_app_admin()));

insert into capture.organiser_access (user_id, status, decided_at)
select distinct created_by, 'approved', now() from capture.leagues
on conflict (user_id) do update set status = 'approved', decided_at = now();

create function capture.is_approved_organiser()
returns boolean language sql stable security definer set search_path = ''
as $$
  select coalesce((select public.is_app_admin()), false)
      or exists (select 1 from capture.organiser_access a where a.user_id = auth.uid() and a.status = 'approved');
$$;
revoke all on function capture.is_approved_organiser() from public, anon;
grant execute on function capture.is_approved_organiser() to authenticated;

-- Ask for access. Safe to call again to update the details; it never
-- approves anyone, and a revoked account stays revoked.
create function capture.request_organiser_access(p_organisation text, p_note text default null)
returns text
language plpgsql security definer set search_path = ''
as $$
declare v_status text;
begin
  if auth.uid() is null then raise exception 'Sign in first' using errcode = '42501'; end if;
  insert into capture.organiser_access (user_id, organisation, note)
  values (auth.uid(), nullif(btrim(p_organisation), ''), nullif(btrim(p_note), ''))
  on conflict (user_id) do update
    set organisation = coalesce(nullif(btrim(p_organisation), ''), capture.organiser_access.organisation),
        note         = coalesce(nullif(btrim(p_note), ''), capture.organiser_access.note)
    where capture.organiser_access.status = 'pending'
  returning status into v_status;
  if v_status is null then
    select status into v_status from capture.organiser_access where user_id = auth.uid();
  end if;
  return v_status;
end;
$$;
revoke all on function capture.request_organiser_access(text, text) from public, anon;
grant execute on function capture.request_organiser_access(text, text) to authenticated;

-- Swish admins: approve or revoke an account.
create function capture.decide_organiser_access(p_user uuid, p_approve boolean, p_plan text default null)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not coalesce((select public.is_app_admin()), false) then
    raise exception 'Only a Swish admin can decide organiser access' using errcode = '42501';
  end if;
  insert into capture.organiser_access (user_id, status, plan, decided_at, decided_by)
  values (p_user, case when p_approve then 'approved' else 'revoked' end, p_plan, now(), auth.uid())
  on conflict (user_id) do update
    set status = excluded.status, plan = coalesce(excluded.plan, capture.organiser_access.plan),
        decided_at = excluded.decided_at, decided_by = excluded.decided_by;
end;
$$;
revoke all on function capture.decide_organiser_access(uuid, boolean, text) from public, anon;
grant execute on function capture.decide_organiser_access(uuid, boolean, text) to authenticated;

-- Swish admins: who is waiting (or approved / revoked), with their email.
create function capture.list_organiser_requests(p_status text default 'pending')
returns table (user_id uuid, email text, organisation text, note text, status text, plan text,
               requested_at timestamptz, decided_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not coalesce((select public.is_app_admin()), false) then
    raise exception 'Only a Swish admin can list organiser requests' using errcode = '42501';
  end if;
  return query
    select a.user_id, u.email::text, a.organisation, a.note, a.status, a.plan, a.requested_at, a.decided_at
      from capture.organiser_access a join auth.users u on u.id = a.user_id
     where p_status is null or a.status = p_status
     order by a.requested_at;
end;
$$;
revoke all on function capture.list_organiser_requests(text) from public, anon;
grant execute on function capture.list_organiser_requests(text) to authenticated;

-- Only approved organisers create leagues.
drop policy leagues_insert on capture.leagues;
create policy leagues_insert on capture.leagues for insert to authenticated
  with check (created_by = (select auth.uid()) and capture.is_approved_organiser());

-- Linking a league to a Swish competition: a Swish admin, or that competition's owner.
create function capture.guard_league_site_link()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.site_league_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.site_league_id is not distinct from old.site_league_id then return new; end if;
  if coalesce((select public.is_app_admin()), false)
     or coalesce(auth.role() = 'service_role', false)
     or (session_user in ('postgres', 'supabase_admin') and auth.uid() is null) then
    return new;
  end if;
  if exists (select 1 from public.competitions c
              where c.league_id = new.site_league_id
                and (c.user_id::text = auth.uid()::text or c.created_by::text = auth.uid()::text)) then
    return new;
  end if;
  raise exception 'Only the owner of a Swish competition can publish a league into it' using errcode = '42501';
end;
$$;
create trigger guard_league_site_link
  before insert or update of site_league_id on capture.leagues
  for each row execute function capture.guard_league_site_link();
