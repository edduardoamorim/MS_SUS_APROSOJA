import { createClient } from '@supabase/supabase-js';

const getEnv = (key: string) => {
  const val = (import.meta.env[key] || '').trim();
  return val.replace(/^['"]|['"]$/g, '').trim();
};

const supabaseUrl = getEnv('VITE_SUPABASE_URL') || getEnv('VTTE_SUPABASE_URL') || getEnv('VITE_PROJECT_URL') || getEnv('PROJECT_URL');
const supabaseAnonKey = getEnv('VITE_SUPABASE_ANON_KEY') || getEnv('VTTE_SUPABASE_ANON_KEY') || getEnv('VITE_SUPABASE_KEY') || getEnv('PROJECT_SERVICE_ROLE_KEY');

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null as any;


