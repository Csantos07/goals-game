-- Keep editable plan entries scoped to an unstarted future plan.
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

drop policy "group members add plan entries" on public.weekly_plan_entries;
create policy "group members add plan entries to future plans"
on public.weekly_plan_entries for insert
to authenticated
with check (
  created_by = (select auth.uid())
  and exists (
    select 1 from public.weekly_plans p
    where p.id = weekly_plan_entries.plan_id
      and p.status = 'planning'
      and p.starts_on > (now() at time zone 'America/Chicago')::date
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

drop policy "group members edit plan entries" on public.weekly_plan_entries;
create policy "group members edit entries in future plans"
on public.weekly_plan_entries for update
to authenticated
using (
  exists (
    select 1 from public.weekly_plans p
    where p.id = weekly_plan_entries.plan_id
      and p.status = 'planning'
      and p.starts_on > (now() at time zone 'America/Chicago')::date
      and private.is_group_member(p.group_id)
  )
)
with check (
  exists (
    select 1 from public.weekly_plans p
    where p.id = weekly_plan_entries.plan_id
      and p.status = 'planning'
      and p.starts_on > (now() at time zone 'America/Chicago')::date
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

drop policy "group members delete plan entries" on public.weekly_plan_entries;
create policy "group members delete entries in future plans"
on public.weekly_plan_entries for delete
to authenticated
using (
  exists (
    select 1 from public.weekly_plans p
    where p.id = weekly_plan_entries.plan_id
      and p.status = 'planning'
      and p.starts_on > (now() at time zone 'America/Chicago')::date
      and private.is_group_member(p.group_id)
  )
);
