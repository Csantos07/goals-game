-- Run once in the Supabase SQL Editor before deploying the private themes UI.
-- Existing backgrounds remain regular themes because the new flag defaults to false.
alter table public.user_backgrounds
  add column if not exists is_private boolean not null default false;
