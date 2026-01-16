import { createClient } from "@supabase/supabase-js";

/**
 * Browser-safe Supabase client.
 * Uses the public anon key, security is enforced by RLS in Supabase.
 */
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);
