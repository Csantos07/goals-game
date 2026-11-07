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
