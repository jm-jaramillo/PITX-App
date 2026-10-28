// Supabase connection details for the static app.
//
// Both values below are PUBLIC by design and safe to commit: the anon key
// only ever grants what Row Level Security allows (see
// supabase/migrations/0001_init.sql). Never put the service_role / secret
// key in this file - it bypasses RLS entirely and this directory is served
// to every visitor. Privileged work (creating accounts) goes through the
// `create-account` Supabase Edge Function instead.
export const SUPABASE_URL = "https://nuezknlzwfkfxlicrgol.supabase.co";
export const SUPABASE_ANON_KEY =
  "sb_publishable_kWt3qzqMcrsOhyG4aiVb0A_uFTRMe6J";
