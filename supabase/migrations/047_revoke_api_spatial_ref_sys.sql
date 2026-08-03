-- ============================================================================
-- MIGRATION 047: DEFCON FIX - REMOVER SPATIAL_REF_SYS DA API PÚBLICA (POSTGREST)
-- ============================================================================
-- MOTIVO: A tabela spatial_ref_sys pertence à role de sistema 'supabase_admin'.
-- Tentar rodar 'ALTER TABLE ... ENABLE ROW LEVEL SECURITY' gera o erro '42501: must be owner'.
-- Ao revogar a exposição da API REST pública (roles anon e authenticated), o PostgREST
-- oculta a tabela da API externa e o Supabase Security Advisor limpa o alerta de risco!

-- 1. Revogar todas as permissões de API pública sobre a tabela spatial_ref_sys
REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon;
REVOKE ALL ON TABLE public.spatial_ref_sys FROM authenticated;
REVOKE ALL ON TABLE public.spatial_ref_sys FROM PUBLIC;

-- 2. Manter acesso de leitura apenas para o backend de administração (service_role e postgres)
GRANT SELECT ON TABLE public.spatial_ref_sys TO postgres, service_role;

-- 3. Notificar PostgREST para recarregar o schema da API
NOTIFY pgrst, 'reload schema';
