import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabaseConfigured = Boolean(url && anon);

// Lazy fallback: if envs missing, app still mounts and shows a setup screen.
export const supabase: SupabaseClient = createClient(
  url ?? 'http://localhost.invalid',
  anon ?? 'public-anon-key-placeholder',
);
