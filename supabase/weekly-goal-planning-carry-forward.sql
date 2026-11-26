-- Replace the week-start function to carry brainstorm ideas into the next planning round.
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

  -- Keep brainstorm ideas visible after the planner advances to the following week.
  insert into public.weekly_plans (group_id, starts_on, created_by)
  values (selected_plan.group_id, selected_plan.starts_on + 7, (select auth.uid()))
  on conflict (group_id, starts_on) do nothing;

  select id into next_plan_id
  from public.weekly_plans
  where group_id = selected_plan.group_id
    and starts_on = selected_plan.starts_on + 7;

  insert into public.weekly_plan_entries (plan_id, title, entry_type, created_by)
  select next_plan_id, title, 'idea', created_by
  from public.weekly_plan_entries
  where plan_id = selected_plan.id
    and entry_type = 'idea'
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

-- Restore ideas from each group's most recently started plan to its next planning round.
with source_plans as (
  select distinct on (p.group_id)
    p.id,
    p.group_id,
    p.starts_on,
    p.created_by
  from public.weekly_plans p
  where p.status = 'started'
    and p.starts_on <= (now() at time zone 'America/Chicago')::date
    and exists (
      select 1
      from public.weekly_plan_entries e
      where e.plan_id = p.id and e.entry_type = 'idea'
    )
  order by p.group_id, p.starts_on desc
)
insert into public.weekly_plans (group_id, starts_on, created_by)
select group_id, starts_on + 7, created_by
from source_plans
on conflict (group_id, starts_on) do nothing;

with source_plans as (
  select distinct on (p.group_id)
    p.id,
    p.group_id,
    p.starts_on
  from public.weekly_plans p
  where p.status = 'started'
    and p.starts_on <= (now() at time zone 'America/Chicago')::date
    and exists (
      select 1
      from public.weekly_plan_entries e
      where e.plan_id = p.id and e.entry_type = 'idea'
    )
  order by p.group_id, p.starts_on desc
)
insert into public.weekly_plan_entries (plan_id, title, entry_type, created_by)
select next_plan.id, source_entry.title, 'idea', source_entry.created_by
from source_plans source_plan
join public.weekly_plans next_plan
  on next_plan.group_id = source_plan.group_id
  and next_plan.starts_on = source_plan.starts_on + 7
join public.weekly_plan_entries source_entry
  on source_entry.plan_id = source_plan.id
  and source_entry.entry_type = 'idea'
where not exists (
  select 1
  from public.weekly_plan_entries existing_entry
  where existing_entry.plan_id = next_plan.id
    and existing_entry.entry_type = 'idea'
    and existing_entry.title = source_entry.title
    and existing_entry.created_by = source_entry.created_by
);
