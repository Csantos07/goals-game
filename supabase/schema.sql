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

create policy "users can view self and group members"
on public.profiles for select
to authenticated
using (
  id = (select auth.uid())
  or exists (
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


-- Persistent user settings, backgrounds, and shared envelopes.
create table public.user_backgrounds (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  data_url text not null,
  is_private boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.user_preferences (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  theme_mode text not null default 'dark' check (theme_mode in ('dark','light')),
  accent text not null default '#c9ff54',
  active_profile_id uuid references public.profiles(id) on delete set null,
  selected_background_id uuid references public.user_backgrounds(id) on delete set null,
  last_celebrated_week date,
  updated_at timestamptz not null default now()
);

create table public.envelopes (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  name text not null,
  balance_cents bigint not null default 0 check (balance_cents >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (group_id, name)
);

create index user_backgrounds_profile_id_idx on public.user_backgrounds(profile_id);
create index user_preferences_active_profile_id_idx on public.user_preferences(active_profile_id);
create index user_preferences_selected_background_id_idx on public.user_preferences(selected_background_id);
create index envelopes_group_id_idx on public.envelopes(group_id);

alter table public.user_backgrounds enable row level security;
alter table public.user_preferences enable row level security;
alter table public.envelopes enable row level security;

grant select, insert, update, delete on public.user_backgrounds to authenticated;
grant select, insert, update on public.user_preferences to authenticated;
grant select, insert, update, delete on public.envelopes to authenticated;

create policy "users can view their backgrounds"
on public.user_backgrounds for select
to authenticated
using (profile_id = (select auth.uid()));

create policy "users can create their backgrounds"
on public.user_backgrounds for insert
to authenticated
with check (profile_id = (select auth.uid()));

create policy "users can update their backgrounds"
on public.user_backgrounds for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

create policy "users can delete their backgrounds"
on public.user_backgrounds for delete
to authenticated
using (profile_id = (select auth.uid()));

create policy "users can view their preferences"
on public.user_preferences for select
to authenticated
using (profile_id = (select auth.uid()));

create policy "users can create their preferences"
on public.user_preferences for insert
to authenticated
with check (profile_id = (select auth.uid()));

create policy "users can update their preferences"
on public.user_preferences for update
to authenticated
using (profile_id = (select auth.uid()))
with check (profile_id = (select auth.uid()));

create policy "members can view envelopes"
on public.envelopes for select
to authenticated
using (private.is_group_member(group_id));

create policy "members can create envelopes"
on public.envelopes for insert
to authenticated
with check (private.is_group_member(group_id));

create policy "members can update envelopes"
on public.envelopes for update
to authenticated
using (private.is_group_member(group_id))
with check (private.is_group_member(group_id));

create policy "members can delete envelopes"
on public.envelopes for delete
to authenticated
using (private.is_group_member(group_id));

alter publication supabase_realtime add table public.goals;
alter publication supabase_realtime add table public.goal_completions;
alter publication supabase_realtime add table public.envelopes;
alter publication supabase_realtime add table public.user_preferences;


-- Weekly pot contributions and winner allocations.
create table public.weekly_contributions (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now()
);

create table public.weekly_allocations (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks(id) on delete cascade,
  profile_id uuid not null references public.profiles(id),
  envelope_id uuid not null references public.envelopes(id),
  amount_cents bigint not null check (amount_cents > 0),
  created_at timestamptz not null default now(),
  unique (week_id, profile_id)
);

create index weekly_contributions_week_id_idx on public.weekly_contributions(week_id);
create index weekly_contributions_profile_id_idx on public.weekly_contributions(profile_id);
create unique index weekly_allocations_one_settlement_per_week on public.weekly_allocations(week_id);
create index weekly_allocations_profile_id_idx on public.weekly_allocations(profile_id);
create index weekly_allocations_envelope_id_idx on public.weekly_allocations(envelope_id);

alter table public.weekly_contributions enable row level security;
alter table public.weekly_allocations enable row level security;

grant select, insert on public.weekly_contributions to authenticated;
grant select on public.weekly_allocations to authenticated;

create policy "members read weekly contributions"
on public.weekly_contributions for select
to authenticated
using (
  exists (
    select 1 from public.weeks w
    where w.id = weekly_contributions.week_id
      and private.is_group_member(w.group_id)
  )
);

create policy "members contribute to current week"
on public.weekly_contributions for insert
to authenticated
with check (
  profile_id = (select auth.uid())
  and exists (
    select 1 from public.weeks w
    where w.id = weekly_contributions.week_id
      and private.is_group_member(w.group_id)
      and w.starts_on <= (now() at time zone 'America/Chicago')::date
      and w.ends_on >= (now() at time zone 'America/Chicago')::date
      and w.status = 'active'
  )
);

create policy "members read weekly allocations"
on public.weekly_allocations for select
to authenticated
using (
  exists (
    select 1 from public.weeks w
    where w.id = weekly_allocations.week_id
      and private.is_group_member(w.group_id)
  )
);

create or replace function private.allocate_weekly_winnings_impl(
  target_week_id uuid,
  target_envelope_name text
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  w public.weeks%rowtype;
  top_score bigint;
  winner_count bigint;
  winner_id uuid;
  total_pot bigint;
  target_id uuid;
begin
  if (select auth.uid()) is null then
    raise exception 'You must be signed in.';
  end if;

  select * into w
    from public.weeks
   where id = target_week_id
   for update;

  if not found or not private.is_group_member(w.group_id) then
    raise exception 'Week not found.';
  end if;

  if w.ends_on >= (now() at time zone 'America/Chicago')::date then
    raise exception 'Week has not ended.';
  end if;

  if exists (select 1 from public.weekly_allocations where week_id = w.id) then
    raise exception 'This week has already been allocated.';
  end if;

  with scores as (
    select gm.profile_id,
      coalesce(sum(
        case
          when g.goal_type = 'oneTime' then
            case when g.completed_at is null then 0 else g.points end
          else g.points * (
            select count(*) from public.goal_completions gc
            where gc.goal_id = g.id
              and gc.completed_on between w.starts_on and w.ends_on
          )
        end
      ), 0)::bigint as score
    from public.group_members gm
    left join public.goals g
      on g.player_id = gm.profile_id and g.week_id = w.id
    where gm.group_id = w.group_id
    group by gm.profile_id
  )
  select max(score) into top_score from scores;

  with scores as (
    select gm.profile_id,
      coalesce(sum(
        case
          when g.goal_type = 'oneTime' then
            case when g.completed_at is null then 0 else g.points end
          else g.points * (
            select count(*) from public.goal_completions gc
            where gc.goal_id = g.id
              and gc.completed_on between w.starts_on and w.ends_on
          )
        end
      ), 0)::bigint as score
    from public.group_members gm
    left join public.goals g
      on g.player_id = gm.profile_id and g.week_id = w.id
    where gm.group_id = w.group_id
    group by gm.profile_id
  )
  select count(*), (array_agg(profile_id order by profile_id))[1]
    into winner_count, winner_id
    from scores
   where score = top_score;

  if winner_count <> 1 then
    raise exception 'Tied week; the pot remains unassigned.';
  end if;

  if winner_id is distinct from (select auth.uid()) then
    raise exception 'Only the winning player can allocate the pot.';
  end if;

  select coalesce(sum(amount_cents), 0)
    into total_pot
    from public.weekly_contributions
   where week_id = w.id;

  if total_pot <= 0 then
    raise exception 'There is no pot to allocate.';
  end if;

  select id into target_id
    from public.envelopes
   where group_id = w.group_id
     and name = target_envelope_name
   for update;

  if target_id is null then
    raise exception 'Envelope not found.';
  end if;

  insert into public.weekly_allocations (week_id, profile_id, envelope_id, amount_cents)
  values (w.id, winner_id, target_id, total_pot);

  update public.envelopes
     set balance_cents = balance_cents + total_pot,
         updated_at = now()
   where id = target_id;

  return total_pot;
end;
$function$;

revoke all on function private.allocate_weekly_winnings_impl(uuid, text) from public, anon;
grant execute on function private.allocate_weekly_winnings_impl(uuid, text) to authenticated;

create or replace function public.allocate_weekly_winnings(
  target_week_id uuid,
  target_envelope_name text
)
returns bigint
language sql
security invoker
set search_path = ''
as $function$
  select private.allocate_weekly_winnings_impl(target_week_id, target_envelope_name)
$function$;

revoke all on function public.allocate_weekly_winnings(uuid, text) from public, anon;
grant execute on function public.allocate_weekly_winnings(uuid, text) to authenticated;

alter publication supabase_realtime add table public.weekly_contributions;
alter publication supabase_realtime add table public.weekly_allocations;


-- Shared weekly goal planning.
-- Shared planning board for the next weekly game.
create table public.weekly_plans (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.groups(id) on delete cascade,
  starts_on date not null,
  status text not null default 'planning' check (status in ('planning', 'started')),
  started_week_id uuid references public.weeks(id) on delete set null,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  unique (group_id, starts_on)
);

create table public.weekly_plan_entries (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.weekly_plans(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 120),
  entry_type text not null default 'idea' check (entry_type in ('idea', 'draft')),
  player_id uuid references public.profiles(id) on delete set null,
  assigned_by uuid references public.profiles(id) on delete set null,
  goal_type text check (goal_type is null or goal_type in ('oneTime', 'daily')),
  points integer check (points is null or points between 1 and 1000),
  is_selected boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_plan_entry_shape check (
    (entry_type = 'idea' and player_id is null and assigned_by is null
      and goal_type is null and points is null and is_selected = false)
    or
    (entry_type = 'draft' and player_id is not null and assigned_by is not null
      and goal_type is not null and points is not null)
  )
);

create index weekly_plan_entries_plan_id_created_at_idx
  on public.weekly_plan_entries(plan_id, created_at);

alter table public.weekly_plans enable row level security;
alter table public.weekly_plan_entries enable row level security;

grant select, insert on public.weekly_plans to authenticated;
grant select, insert, delete on public.weekly_plan_entries to authenticated;
grant update (title, entry_type, player_id, assigned_by, goal_type, points, is_selected, updated_at)
  on public.weekly_plan_entries to authenticated;

create policy "group members read weekly plans"
on public.weekly_plans for select
to authenticated
using (private.is_group_member(group_id));

create policy "group members create weekly plans"
on public.weekly_plans for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and private.is_group_member(group_id)
);

create policy "group members read plan entries"
on public.weekly_plan_entries for select
to authenticated
using (
  exists (
    select 1 from public.weekly_plans p
    where p.id = weekly_plan_entries.plan_id
      and private.is_group_member(p.group_id)
  )
);

create policy "group members add plan entries"
on public.weekly_plan_entries for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.weekly_plans p
    where p.id = weekly_plan_entries.plan_id
      and private.is_group_member(p.group_id)
  )
  and (player_id is null or exists (
    select 1 from public.group_members gm
    join public.weekly_plans p on p.group_id = gm.group_id
    where p.id = weekly_plan_entries.plan_id and gm.profile_id = weekly_plan_entries.player_id
  ))
  and (assigned_by is null or exists (
    select 1 from public.group_members gm
    join public.weekly_plans p on p.group_id = gm.group_id
    where p.id = weekly_plan_entries.plan_id and gm.profile_id = weekly_plan_entries.assigned_by
  ))
);

create policy "group members edit plan entries"
on public.weekly_plan_entries for update
to authenticated
using (
  exists (
    select 1 from public.weekly_plans p
    where p.id = weekly_plan_entries.plan_id
      and private.is_group_member(p.group_id)
  )
)
with check (
  exists (
    select 1 from public.weekly_plans p
    where p.id = weekly_plan_entries.plan_id
      and private.is_group_member(p.group_id)
  )
  and (player_id is null or exists (
    select 1 from public.group_members gm
    join public.weekly_plans p on p.group_id = gm.group_id
    where p.id = weekly_plan_entries.plan_id and gm.profile_id = weekly_plan_entries.player_id
  ))
  and (assigned_by is null or exists (
    select 1 from public.group_members gm
    join public.weekly_plans p on p.group_id = gm.group_id
    where p.id = weekly_plan_entries.plan_id and gm.profile_id = weekly_plan_entries.assigned_by
  ))
);

create policy "group members delete plan entries"
on public.weekly_plan_entries for delete
to authenticated
using (
  exists (
    select 1 from public.weekly_plans p
    where p.id = weekly_plan_entries.plan_id
      and private.is_group_member(p.group_id)
  )
);

create or replace function public.start_weekly_plan(target_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_plan public.weekly_plans%rowtype;
  target_week_id uuid;
  selected_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to start the next week.';
  end if;

  select * into selected_plan
  from public.weekly_plans
  where id = target_plan_id
  for update;

  if not found or not exists (
    select 1 from public.group_members gm
    where gm.group_id = selected_plan.group_id
      and gm.profile_id = (select auth.uid())
  ) then
    raise exception 'Plan not found.';
  end if;

  if selected_plan.status <> 'planning' then
    raise exception 'This next week has already been started.';
  end if;

  if selected_plan.starts_on <= (now() at time zone 'America/Chicago')::date then
    raise exception 'The planned week has already begun.';
  end if;

  select count(*) into selected_count
  from public.weekly_plan_entries
  where plan_id = selected_plan.id and entry_type = 'draft' and is_selected;

  if selected_count = 0 then
    raise exception 'Select at least one draft goal to start the next week.';
  end if;

  if exists (
    select 1
    from public.weekly_plan_entries e
    where e.plan_id = selected_plan.id
      and e.entry_type = 'draft'
      and e.is_selected
      and (
        not exists (select 1 from public.group_members gm
          where gm.group_id = selected_plan.group_id and gm.profile_id = e.player_id)
        or not exists (select 1 from public.group_members gm
          where gm.group_id = selected_plan.group_id and gm.profile_id = e.assigned_by)
      )
  ) then
    raise exception 'A selected draft has a player who is not in this group.';
  end if;

  insert into public.weeks (group_id, starts_on, ends_on, status)
  values (selected_plan.group_id, selected_plan.starts_on, selected_plan.starts_on + 6, 'active')
  on conflict (group_id, starts_on) do nothing;

  select id into target_week_id
  from public.weeks
  where group_id = selected_plan.group_id
    and starts_on = selected_plan.starts_on;

  if exists (select 1 from public.weeks where id = target_week_id and status <> 'active') then
    raise exception 'The planned week is already closed.';
  end if;

  if exists (select 1 from public.goals where week_id = target_week_id) then
    raise exception 'Goals already exist for this week. Remove them before starting this plan.';
  end if;

  insert into public.goals (week_id, player_id, assigned_by, title, goal_type, points)
  select target_week_id, player_id, assigned_by, trim(title), goal_type, points
  from public.weekly_plan_entries
  where plan_id = selected_plan.id
    and entry_type = 'draft'
    and is_selected
  order by created_at;

  update public.weekly_plans
  set status = 'started',
      started_week_id = target_week_id,
      started_at = now(),
      updated_at = now()
  where id = selected_plan.id;

  return target_week_id;
end;
$$;

revoke all on function public.start_weekly_plan(uuid) from public, anon;
grant execute on function public.start_weekly_plan(uuid) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'weekly_plans') then
      execute 'alter publication supabase_realtime add table public.weekly_plans';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'weekly_plan_entries') then
      execute 'alter publication supabase_realtime add table public.weekly_plan_entries';
    end if;
  end if;
end
$$;


-- Weekly planning policy and foreign-key hardening.
-- Tighten the weekly planner after its initial schema rollout.
create index if not exists weekly_plans_created_by_idx
  on public.weekly_plans(created_by);
create index if not exists weekly_plans_started_week_id_idx
  on public.weekly_plans(started_week_id);
create index if not exists weekly_plan_entries_player_id_idx
  on public.weekly_plan_entries(player_id);
create index if not exists weekly_plan_entries_assigned_by_idx
  on public.weekly_plan_entries(assigned_by);
create index if not exists weekly_plan_entries_created_by_idx
  on public.weekly_plan_entries(created_by);

drop policy "group members create weekly plans" on public.weekly_plans;
create policy "group members create future weekly plans"
on public.weekly_plans for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and starts_on > (now() at time zone 'America/Chicago')::date
  and private.is_group_member(group_id)
);

create policy "planner entries insert only into open future plans"
on public.weekly_plan_entries as restrictive for insert to authenticated
with check (exists (
  select 1 from public.weekly_plans p
  where p.id = weekly_plan_entries.plan_id
    and p.status = 'planning'
    and p.starts_on > (now() at time zone 'America/Chicago')::date
));

create policy "planner entries update only in open future plans"
on public.weekly_plan_entries as restrictive for update to authenticated
using (exists (
  select 1 from public.weekly_plans p
  where p.id = weekly_plan_entries.plan_id
    and p.status = 'planning'
    and p.starts_on > (now() at time zone 'America/Chicago')::date
))
with check (exists (
  select 1 from public.weekly_plans p
  where p.id = weekly_plan_entries.plan_id
    and p.status = 'planning'
    and p.starts_on > (now() at time zone 'America/Chicago')::date
));

create policy "planner entries delete only in open future plans"
on public.weekly_plan_entries as restrictive for delete to authenticated
using (exists (
  select 1 from public.weekly_plans p
  where p.id = weekly_plan_entries.plan_id
    and p.status = 'planning'
    and p.starts_on > (now() at time zone 'America/Chicago')::date
));
