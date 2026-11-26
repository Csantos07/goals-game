-- Safely recognize goals created before planner linkage was added.
-- Only link them when the active goal rows exactly match the selected drafts.

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

  -- Older locks predate planner_plan_id. Link their goals only if the entire
  -- active goal set matches the selected planner drafts, including duplicates.
  if exists (
    select 1 from public.goals g
    where g.week_id = target_week_id
      and g.archived_at is null
      and g.planner_plan_id is null
  ) then
    if not exists (
      (select g.player_id, g.assigned_by, g.title, g.goal_type, g.points
       from public.goals g
       where g.week_id = target_week_id and g.archived_at is null
       except all
       select e.player_id, e.assigned_by, trim(e.title), e.goal_type, e.points
       from public.weekly_plan_entries e
       where e.plan_id = selected_plan.id and e.entry_type = 'draft' and e.is_selected)
      union all
      (select e.player_id, e.assigned_by, trim(e.title), e.goal_type, e.points
       from public.weekly_plan_entries e
       where e.plan_id = selected_plan.id and e.entry_type = 'draft' and e.is_selected
       except all
       select g.player_id, g.assigned_by, g.title, g.goal_type, g.points
       from public.goals g
       where g.week_id = target_week_id and g.archived_at is null)
    ) then
      update public.goals
      set planner_plan_id = selected_plan.id
      where week_id = target_week_id
        and archived_at is null
        and planner_plan_id is null;
    end if;
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
