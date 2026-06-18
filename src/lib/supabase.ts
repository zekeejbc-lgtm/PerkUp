/// <reference types="vite/client" />
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://fteiarxsdfwsroeudhoc.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseAnonKey) {
  console.warn("VITE_SUPABASE_ANON_KEY is missing. Please add it to your environment variables.");
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey || 'missing-key');
