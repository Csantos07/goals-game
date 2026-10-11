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
