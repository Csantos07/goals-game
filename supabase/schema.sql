-- Goals Game Supabase schema
-- Auth: Supabase email/password.
-- Multiplayer: users join reusable groups; groups can have 2, 3, 4+ players.

create extension if not exists pgcrypto;
create schema if not exists private;

revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Goals Game',
  invite_code text not null unique default upper(substr(encode(gen_random_bytes(6), 'hex'), 1, 8)),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.group_members (
  group_id uuid not null references public.groups(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, profile_id)
);

create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'active' check (status in ('active','closed')),
  reward_choice text,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (group_id, starts_on)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  goal_type text not null check (goal_type in ('oneTime','daily')),
  points integer not null check (points > 0),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.goal_completions (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.goals(id) on delete cascade,
  completed_on date not null,
  completed_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (goal_id, completed_on)
);

create index group_members_profile_id_idx on public.group_members(profile_id);
create index weeks_group_id_idx on public.weeks(group_id);
create index goals_week_id_idx on public.goals(week_id);
create index goals_player_id_idx on public.goals(player_id);
create index goal_completions_goal_id_idx on public.goal_completions(goal_id);
create index groups_created_by_idx on public.groups(created_by);
create index goals_assigned_by_idx on public.goals(assigned_by);
create index goal_completions_completed_by_idx on public.goal_completions(completed_by);

-- New auth users automatically get a public profile.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(
      nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Player'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_user() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.handle_new_user();

-- Private membership helpers used by RLS policies.
create or replace function private.is_group_member(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and profile_id = (select auth.uid())
  )
$$;

create or replace function private.is_group_owner(target_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.group_members
    where group_id = target_group_id
      and profile_id = (select auth.uid())
      and role = 'owner'
  )
$$;

revoke all on function private.is_group_member(uuid) from public;
revoke all on function private.is_group_owner(uuid) from public;
grant execute on function private.is_group_member(uuid) to authenticated;
grant execute on function private.is_group_owner(uuid) to authenticated;

-- Private mutation implementations.
create or replace function private.create_group_impl(group_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_group_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in.';
  end if;

  insert into public.groups (name, created_by)
  values (
    coalesce(nullif(trim(group_name), ''), 'Goals Game'),
    (select auth.uid())
  )
  returning id into new_group_id;

  insert into public.group_members (group_id, profile_id, role)
  values (new_group_id, (select auth.uid()), 'owner');

  return new_group_id;
end;
$$;

create or replace function private.join_group_impl(code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_group_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in.';
  end if;

  select id
  into target_group_id
  from public.groups
  where invite_code = upper(trim(code));

  if target_group_id is null then
    raise exception 'That invite code was not found.';
  end if;

  insert into public.group_members (group_id, profile_id, role)
  values (target_group_id, (select auth.uid()), 'member')
  on conflict (group_id, profile_id) do nothing;

  return target_group_id;
end;
$$;

revoke all on function private.create_group_impl(text) from public;
revoke all on function private.join_group_impl(text) from public;
grant execute on function private.create_group_impl(text) to authenticated;
grant execute on function private.join_group_impl(text) to authenticated;

-- Public RPC wrappers remain security-invoker and delegate to private helpers.
create or replace function public.create_group(group_name text default 'Goals Game')
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.create_group_impl(group_name)
$$;

create or replace function public.join_group(code text)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  select private.join_group_impl(code)
$$;

revoke all on function public.create_group(text) from public;
revoke all on function public.join_group(text) from public;
grant execute on function public.create_group(text) to authenticated;
grant execute on function public.join_group(text) to authenticated;

alter table public.profiles enable row level security;
alter table public.groups enable row level security;
alter table public.group_members enable row level security;
alter table public.weeks enable row level security;
alter table public.goals enable row level security;
alter table public.goal_completions enable row level security;

grant select, update on public.profiles to authenticated;
grant select, update on public.groups to authenticated;
grant select, delete on public.group_members to authenticated;
grant select, insert, update on public.weeks to authenticated;
grant select, insert, update, delete on public.goals to authenticated;
grant select, insert, delete on public.goal_completions to authenticated;

create policy "users can view their profile"
on public.profiles for select
to authenticated
using (id = (select auth.uid()));

create policy "group members can view one another"
on public.profiles for select
to authenticated
using (
  exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.profile_id = (select auth.uid())
      and theirs.profile_id = profiles.id
  )
);

create policy "users can update their profile"
on public.profiles for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

create policy "members can view groups"
on public.groups for select
to authenticated
using (private.is_group_member(id));

create policy "owners can update groups"
on public.groups for update
to authenticated
using (private.is_group_owner(id))
with check (private.is_group_owner(id));

create policy "members can view memberships"
on public.group_members for select
to authenticated
using (private.is_group_member(group_id));

create policy "owners can remove memberships"
on public.group_members for delete
to authenticated
using (
  profile_id = (select auth.uid())
  or private.is_group_owner(group_id)
);

create policy "members can view weeks"
on public.weeks for select
to authenticated
using (private.is_group_member(group_id));

create policy "members can create weeks"
on public.weeks for insert
to authenticated
with check (private.is_group_member(group_id));

create policy "members can update weeks"
on public.weeks for update
to authenticated
using (private.is_group_member(group_id))
with check (private.is_group_member(group_id));

create policy "members can view goals"
on public.goals for select
to authenticated
using (
  exists (
    select 1
    from public.weeks w
    where w.id = goals.week_id
      and private.is_group_member(w.group_id)
  )
);

create policy "members can create goals"
on public.goals for insert
to authenticated
with check (
  exists (
    select 1
    from public.weeks w
    where w.id = goals.week_id
      and private.is_group_member(w.group_id)
  )
);

create policy "members can update goals"
on public.goals for update
to authenticated
using (
  exists (
    select 1
    from public.weeks w
    where w.id = goals.week_id
      and private.is_group_member(w.group_id)
  )
)
with check (
  exists (
    select 1
    from public.weeks w
    where w.id = goals.week_id
      and private.is_group_member(w.group_id)
  )
);

create policy "members can delete goals"
on public.goals for delete
to authenticated
using (
  exists (
    select 1
    from public.weeks w
    where w.id = goals.week_id
      and private.is_group_member(w.group_id)
  )
);

create policy "members can view completions"
on public.goal_completions for select
to authenticated
using (
  exists (
    select 1
    from public.goals g
    join public.weeks w on w.id = g.week_id
    where g.id = goal_completions.goal_id
      and private.is_group_member(w.group_id)
  )
);

create policy "members can create completions"
on public.goal_completions for insert
to authenticated
with check (
  completed_by = (select auth.uid())
  and exists (
    select 1
    from public.goals g
    join public.weeks w on w.id = g.week_id
    where g.id = goal_completions.goal_id
      and private.is_group_member(w.group_id)
  )
);

create policy "members can delete completions"
on public.goal_completions for delete
to authenticated
using (
  exists (
    select 1
    from public.goals g
    join public.weeks w on w.id = g.week_id
    where g.id = goal_completions.goal_id
      and private.is_group_member(w.group_id)
  )
);
