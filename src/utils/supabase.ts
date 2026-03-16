/// <reference types="vite/client" />
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? '';
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ?? '';

let supabase: SupabaseClient;

if (supabaseUrl && supabaseKey) {
  supabase = createClient(supabaseUrl, supabaseKey);
} else {
  // Graceful fallback when env vars are missing (e.g. on Vercel without config).
  // Creates a dummy client that will fail on use — prevents crash at import time.
  supabase = createClient('https://placeholder.supabase.co', 'placeholder-key');
}

export default supabase;
export { supabase };
        