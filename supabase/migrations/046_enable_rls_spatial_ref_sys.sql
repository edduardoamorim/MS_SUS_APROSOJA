-- ============================================================================
-- MIGRATION 046: DEFCON FIX - REMOVER ALERTA SPATIAL_REF_SYS NO SECURITY ADVISOR
-- ============================================================================

-- 1. Executar via função SECURITY DEFINER para ignorar restrição de ownership do PostGIS
CREATE OR REPLACE FUNCTION public.apply_spatial_ref_sys_security()
RETURNS void AS $$
BEGIN
    -- Tenta habilitar RLS na tabela de projeções PostGIS
    BEGIN
        EXECUTE 'ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Aviso ao habilitar RLS em spatial_ref_sys: %', SQLERRM;
    END;

    -- Tenta criar a política de SELECT público
    BEGIN
        EXECUTE 'DROP POLICY IF EXISTS "Allow public read-only access to spatial_ref_sys" ON public.spatial_ref_sys';
        EXECUTE 'CREATE POLICY "Allow public read-only access to spatial_ref_sys" ON public.spatial_ref_sys FOR SELECT USING (true)';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'Aviso ao criar política em spatial_ref_sys: %', SQLERRM;
    END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Executar a função
SELECT public.apply_spatial_ref_sys_security();
DROP FUNCTION public.apply_spatial_ref_sys_security();

-- 2. REVOGAR a permissão da API REST pública (PostgREST) sobre spatial_ref_sys
-- Isso esconde a tabela do PostgREST para que o Security Advisor pare de sinalizar "RLS Disabled in Public"
REVOKE ALL ON public.spatial_ref_sys FROM anon, authenticated;
GRANT SELECT ON public.spatial_ref_sys TO postgres, service_role;

-- 3. Habilitar RLS em todas as tabelas do schema public
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
          AND table_type = 'BASE TABLE'
    ) LOOP
        BEGIN
            EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', r.table_name);
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'Aviso RLS na tabela %: %', r.table_name, SQLERRM;
        END;
    END LOOP;
END $$;

-- 4. Notificar PostgREST para recarregar a definição de schemas e aplicar as revogações
NOTIFY pgrst, 'reload schema';
