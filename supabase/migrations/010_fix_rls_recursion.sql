-- ============================================================================
-- CORREÇÃO DE RECURSÃO INFINITA NAS POLÍTICAS DE SEGURANÇA (RLS)
-- ============================================================================

-- 1. Criação de funções SECURITY DEFINER para quebrar a dependência direta
-- no planejador de consultas do PostgreSQL.

CREATE OR REPLACE FUNCTION public.is_property_producer(prop_id UUID, user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.propriedades
        WHERE id = prop_id AND produtor_id = user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_property_technician(prop_id UUID, user_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.auditorias
        WHERE propriedade_id = prop_id AND tecnico_responsavel_id = user_id
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Concede privilégios de execução
GRANT EXECUTE ON FUNCTION public.is_property_producer(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_property_technician(UUID, UUID) TO anon, authenticated;

-- 2. Recriação das políticas sem dependências cíclicas diretas

-- Remover políticas antigas que causavam recursão
DROP POLICY IF EXISTS "Técnicos veem propriedades que auditam" ON public.propriedades;
DROP POLICY IF EXISTS "Produtores veem auditorias de suas propriedades" ON public.auditorias;

-- Recriar política de propriedades usando a função de quebra de loop
CREATE POLICY "Técnicos veem propriedades que auditam" ON public.propriedades 
FOR SELECT USING (
    public.is_property_technician(id, auth.uid())
);

-- Recriar política de auditorias usando a função de quebra de loop
CREATE POLICY "Produtores veem auditorias de suas propriedades" ON public.auditorias 
FOR SELECT USING (
    public.is_property_producer(propriedade_id, auth.uid())
);
