-- ============================================================================
-- MIGRATION 047: MOVER EXTENSÃO POSTGIS PARA O SCHEMA EXTENSIONS (SUPABASE BEST PRACTICE)
-- ============================================================================

-- 1. Criar o schema 'extensions' (padrão de segurança recomendado pela Supabase)
CREATE SCHEMA IF NOT EXISTS extensions;

-- 2. Conceder uso do schema para todas as roles do Supabase
GRANT USAGE ON SCHEMA extensions TO anon, authenticated, service_role;

-- 3. Mover a extensão PostGIS para o schema 'extensions'
-- Este comando move automaticamente a tabela spatial_ref_sys de 'public' para 'extensions'
ALTER EXTENSION postgis SET SCHEMA extensions;

-- 4. Notificar PostgREST para recarregar a definição do schema público
NOTIFY pgrst, 'reload schema';
