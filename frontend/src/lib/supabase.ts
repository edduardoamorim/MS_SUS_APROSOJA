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

// Extrair o ref do projeto Supabase diretamente da anon key (JWT payload.ref)
function extractRefFromKey(key: string): string | null {
  try {
    const payload = JSON.parse(atob(key.split('.')[1]));
    return payload.ref || null;
  } catch { return null; }
}

// Determinar a URL correta do Supabase
let supabaseUrl: string;
let supabaseAnonKey: string;

if (envKey) {
  supabaseAnonKey = envKey;
  const ref = extractRefFromKey(envKey);
  
  // Se a URL do env é válida (contém .supabase.co), usa diretamente
  if (envUrl && envUrl.includes('.supabase.co')) {
    supabaseUrl = envUrl;
  } else if (ref) {
    // Senão, constrói a URL a partir do ref extraído do JWT
    supabaseUrl = `https://${ref}.supabase.co`;
  } else {
    // Fallback para Supabase local (Docker)
    supabaseUrl = 'http://127.0.0.1:54321';
  }
} else {
  // Sem anon key = Supabase local (Docker dev)
  supabaseUrl = 'http://127.0.0.1:54321';
  supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
}

export { supabaseUrl, supabaseAnonKey };

export const isSupabaseConfigured = !!(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured 
  ? createClient(supabaseUrl, supabaseAnonKey) 
  : null as any;

export const createIsolatedAuthClient = () => {
  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });
};

// Log para debug (apenas em dev)
if (import.meta.env.DEV) {
  console.log('[Supabase] URL:', supabaseUrl);
  console.log('[Supabase] Configured:', isSupabaseConfigured);
}

