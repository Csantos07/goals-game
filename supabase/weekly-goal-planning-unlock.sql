-- Reopen a locked weekly plan without discarding its generated goals.
-- Archived planner goals stay in the database and are hidden from the active game.

alter table public.goals
  add column if not exists planner_plan_id uuid references public.weekly_plans(id) on delete set null,
  add column if not exists archived_at timestamptz;

create index if not exists goals_active_week_id_idx
  on public.goals(week_id)
  where archived_at is null;

create or replace function public.start_weekly_plan(target_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_plan public.weekly_plans%rowtype;
  target_week_id uuid;
  next_plan_id uuid;
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

  if exists (
    select 1 from public.goals
    where week_id = target_week_id and archived_at is null
  ) then
    raise exception 'Active goals already exist for this week. Resolve them before starting this plan.';
  end if;

  insert into public.goals (week_id, player_id, assigned_by, title, goal_type, points, planner_plan_id)
  select target_week_id, player_id, assigned_by, trim(title), goal_type, points, selected_plan.id
  from public.weekly_plan_entries
  where plan_id = selected_plan.id
    and entry_type = 'draft'
    and is_selected
  order by created_at;

  -- Keep brainstorm ideas visible after the planner advances to the following week.
  insert into public.weekly_plans (group_id, starts_on, created_by)
  values (selected_plan.group_id, selected_plan.starts_on + 7, (select auth.uid()))
  on conflict (group_id, starts_on) do nothing;

  select id into next_plan_id
  from public.weekly_plans
  where group_id = selected_plan.group_id
    and starts_on = selected_plan.starts_on + 7;

  insert into public.weekly_plan_entries (plan_id, title, entry_type, created_by)
  select next_plan_id, source_entry.title, 'idea', source_entry.created_by
  from public.weekly_plan_entries source_entry
  where source_entry.plan_id = selected_plan.id
    and source_entry.entry_type = 'idea'
    and not exists (
      select 1 from public.weekly_plan_entries existing_entry
      where existing_entry.plan_id = next_plan_id
        and existing_entry.entry_type = 'idea'
        and existing_entry.title = source_entry.title
        and existing_entry.created_by = source_entry.created_by
    )
  order by source_entry.created_at;

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

create or replace function public.unlock_weekly_plan(target_plan_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_plan public.weekly_plans%rowtype;
  target_week_id uuid;
  archived_count integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to unlock the next week.';
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

  if selected_plan.status <> 'started' or selected_plan.started_week_id is null then
    raise exception 'This plan is not locked.';
  end if;

  if selected_plan.starts_on <= (now() at time zone 'America/Chicago')::date then
    raise exception 'The week has already begun, so its goals can no longer be unlocked.';
  end if;

  target_week_id := selected_plan.started_week_id;

  if not exists (
    select 1 from public.weeks w
    where w.id = target_week_id
      and w.group_id = selected_plan.group_id
      and w.starts_on = selected_plan.starts_on
      and w.status = 'active'
  ) then
    raise exception 'The planned week is no longer open.';
  end if;

  if exists (
    select 1
    from public.goals g
    where g.week_id = target_week_id
      and g.archived_at is null
      and g.planner_plan_id is distinct from selected_plan.id
  ) then
    raise exception 'This week has goals outside the planner. Resolve them before unlocking.';
  end if;

  if exists (
    select 1
    from public.goals g
    where g.week_id = target_week_id
      and g.planner_plan_id = selected_plan.id
      and (
        g.completed_at is not null
        or exists (select 1 from public.goal_completions gc where gc.goal_id = g.id)
      )
  ) then
    raise exception 'Goals with recorded progress cannot be unlocked.';
  end if;

  update public.goals
  set archived_at = now()
  where week_id = target_week_id
    and planner_plan_id = selected_plan.id
    and archived_at is null;

  get diagnostics archived_count = row_count;
  if archived_count = 0 then
    raise exception 'No generated goals were found to unlock.';
  end if;

  update public.weekly_plans
  set status = 'planning',
      started_week_id = null,
      started_at = null,
      updated_at = now()
  where id = selected_plan.id;

  return target_week_id;
end;
$$;

revoke all on function public.unlock_weekly_plan(uuid) from public, anon;
grant execute on function public.unlock_weekly_plan(uuid) to authenticated;
