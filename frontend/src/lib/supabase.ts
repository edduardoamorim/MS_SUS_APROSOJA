import { createClient } from '@supabase/supabase-js';

const clean = (val?: string) => (val || '').trim().replace(/^['"]|['"]$/g, '').trim();

const envUrl = clean(import.meta.env.VITE_SUPABASE_URL) ||
               clean(import.meta.env.VTTE_SUPABASE_URL) ||
               clean(import.meta.env.VITE_PROJECT_URL) ||
               clean(import.meta.env.PROJECT_URL);

const envKey = clean(import.meta.env.VITE_SUPABASE_ANON_KEY) ||
               clean(import.meta.env.VTTE_SUPABASE_ANON_KEY) ||
               clean(import.meta.env.VITE_SUPABASE_KEY) ||
               clean(import.meta.env.PROJECT_SERVICE_ROLE_KEY);

const DEFAULT_LOCAL_URL = 'http://127.0.0.1:54321';
const DEFAULT_LOCAL_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';

const forceCloud = import.meta.env.VITE_FORCE_CLOUD === 'true';

let rawUrl = envUrl;
let rawKey = envKey;

const isLocalHost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

if (!rawUrl || (!forceCloud && isLocalHost)) {
  rawUrl = typeof window !== 'undefined' ? window.location.origin : DEFAULT_LOCAL_URL;
  rawKey = DEFAULT_LOCAL_ANON_KEY;
}

export const supabaseUrl = rawUrl;
export const supabaseAnonKey = rawKey;

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null as any;
