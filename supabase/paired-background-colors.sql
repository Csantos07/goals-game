-- Add per-image visual settings without altering existing backgrounds or global preferences.
alter table public.user_backgrounds
  add column if not exists theme_mode text,
  add column if not exists accent text;

alter table public.user_backgrounds
  add constraint user_backgrounds_theme_mode_valid
  check (theme_mode is null or theme_mode in ('dark', 'light'));

alter table public.user_backgrounds
  add constraint user_backgrounds_accent_valid
  check (accent is null or accent ~ '^#[0-9a-fA-F]{6}$');

-- Null values on older backgrounds mean "inherit the user's existing colors"
-- until the first customization; no existing settings are overwritten.
