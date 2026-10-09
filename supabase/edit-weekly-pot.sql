-- Run this in the Supabase SQL editor before testing the pot Edit button.
-- Edits replace only the authenticated player's contribution for an active week.
create or replace function public.set_weekly_contribution(
  target_week_id uuid,
  target_amount_cents bigint
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_group_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in to edit your contribution';
  end if;
  if target_amount_cents is null or target_amount_cents < 0 or target_amount_cents > 100000000 then
    raise exception 'Invalid contribution amount';
  end if;
  select w.group_id into active_group_id
  from public.weeks w
  where w.id = target_week_id
    and w.status = 'active'
    and w.starts_on <= current_date
    and w.ends_on >= current_date;
  if active_group_id is null then
    raise exception 'Only the active week can be edited';
  end if;
  if not exists (
    select 1 from public.group_members gm
    where gm.group_id = active_group_id and gm.profile_id = auth.uid()
  ) then
    raise exception 'Not a member of this group';
  end if;
  if exists (select 1 from public.weekly_allocations wa where wa.week_id = target_week_id) then
    raise exception 'This pot has already been allocated';
  end if;
  delete from public.weekly_contributions
  where week_id = target_week_id and profile_id = auth.uid();
  if target_amount_cents > 0 then
    insert into public.weekly_contributions (week_id, profile_id, amount_cents)
    values (target_week_id, auth.uid(), target_amount_cents);
  end if;
end;
$$;
revoke all on function public.set_weekly_contribution(uuid, bigint) from public;
grant execute on function public.set_weekly_contribution(uuid, bigint) to authenticated;
