import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { WebPublicConfig } from './webConfig.js';

export function createBrowserSupabaseClient(config: WebPublicConfig): SupabaseClient | null {
  const url = config.VITE_SUPABASE_URL;
  const anonKey = config.VITE_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });
}
