/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fstwqgnonsqcqewiipqq.supabase.co';
const supabasePublishableKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
  || import.meta.env.VITE_SUPABASE_ANON_KEY;

// Supabase consumes implicit-flow auth fragments while createClient initializes.
// Capture the recovery marker first so the reset page can still distinguish a
// recovery session after the SDK has cleaned the callback URL.
const initialSearchParams = new URLSearchParams(window.location.search);
const initialHashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));

export const initialRecoveryCallbackDetected =
  window.location.pathname === '/reset-password'
  && (
    initialSearchParams.get('type') === 'recovery'
    || initialHashParams.get('type') === 'recovery'
    || initialSearchParams.has('code')
    || initialHashParams.has('access_token')
  );

if (!supabasePublishableKey) {
  console.warn("VITE_SUPABASE_PUBLISHABLE_KEY is missing. Please add it to your environment variables.");
}

export const supabase = createClient(supabaseUrl, supabasePublishableKey || 'missing-key', {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
export const secondarySupabase = createClient(supabaseUrl, supabasePublishableKey || 'missing-key', {
  auth: {
    storageKey: 'perkup-secondary-auth',
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
});
