export const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL ??
  "https://nbrcsxraiznydpynzazc.supabase.co";

export const supabasePublishableKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_IX6nXSY0NS0-K1-tu8HA3g_bjVcENsW";

export function hasSupabaseConfig() {
  return Boolean(supabaseUrl && supabasePublishableKey);
}
