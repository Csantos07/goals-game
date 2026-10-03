-- Goals Game MVP schema for Supabase
-- Run in the Supabase SQL editor when you're ready to connect the prototype.

create extension if not exists pgcrypto;

create table public.couples (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our Team',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  couple_id uuid references public.couples(id) on delete set null,
  display_name text not null,
  created_at timestamptz not null default now()
);

create table public.weeks (
  id uuid primary key default gen_random_uuid(),
  couple_id uuid not null references public.couples(id) on delete cascade,
  starts_on date not null,
  ends_on date not null,
  status text not null default 'active' check (status in ('active','closed')),
  winner_id uuid references public.profiles(id),
  reward_choice text,
  created_at timestamptz not null default now()
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.weeks(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  assigned_by uuid references public.profiles(id),
  title text not null,
  points integer not null check (points > 0),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.couples enable row level security;
alter table public.profiles enable row level security;
alter table public.weeks enable row level security;
alter table public.goals enable row level security;

-- Helper: current user's couple.
create or replace function public.my_couple_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select couple_id from public.profiles where id = auth.uid()
$$;

create policy "members can view their couple"
on public.couples for select
using (id = public.my_couple_id());

create policy "members can view couple profiles"
on public.profiles for select
using (couple_id = public.my_couple_id());

create policy "members can view their weeks"
on public.weeks for select
using (couple_id = public.my_couple_id());

create policy "members can create their weeks"
on public.weeks for insert
with check (couple_id = public.my_couple_id());

create policy "members can update their weeks"
on public.weeks for update
using (couple_id = public.my_couple_id())
with check (couple_id = public.my_couple_id());

create policy "members can view goals in their weeks"
on public.goals for select
using (exists (
  select 1 from public.weeks w
  where w.id = goals.week_id and w.couple_id = public.my_couple_id()
));

create policy "members can create goals in their weeks"
on public.goals for insert
with check (exists (
  select 1 from public.weeks w
  where w.id = goals.week_id and w.couple_id = public.my_couple_id()
));

create policy "members can update goals in their weeks"
on public.goals for update
using (exists (
  select 1 from public.weeks w
  where w.id = goals.week_id and w.couple_id = public.my_couple_id()
))
with check (exists (
  select 1 from public.weeks w
  where w.id = goals.week_id and w.couple_id = public.my_couple_id()
));
