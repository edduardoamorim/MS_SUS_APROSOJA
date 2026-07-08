-- ============================================================================
-- 1. TABELA DE PENDÊNCIAS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.pendencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    propriedade_id UUID REFERENCES public.propriedades(id) ON DELETE CASCADE NOT NULL,
    titulo VARCHAR(255) NOT NULL,
    descricao TEXT NOT NULL,
    status VARCHAR(50) DEFAULT 'Pendente' CHECK (status IN ('Pendente', 'Em Análise', 'Resolvida')),
    prazo DATE,
    evidencia_url TEXT,
    resolucao_descricao TEXT,
    criado_por UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================================
-- 2. SEGURANÇA E CONTROLE DE ACESSO (RLS)
-- ============================================================================
ALTER TABLE public.pendencias ENABLE ROW LEVEL SECURITY;

-- Políticas para a role 'gestor' (Acesso total)
CREATE POLICY "Gestores tem acesso total a pendencias" 
ON public.pendencias FOR ALL USING (public.is_gestor());

-- Políticas para 'produtores'
-- Podem ver pendências de suas próprias propriedades
CREATE POLICY "Produtores veem pendencias de suas propriedades" 
ON public.pendencias FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.propriedades 
        WHERE propriedades.id = pendencias.propriedade_id 
        AND propriedades.produtor_id = auth.uid()
    )
);

-- Podem enviar resolução (status -> 'Em Análise', evidencia_url, resolucao_descricao)
CREATE POLICY "Produtores podem atualizar para resolucao" 
ON public.pendencias FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM public.propriedades 
        WHERE propriedades.id = pendencias.propriedade_id 
        AND propriedades.produtor_id = auth.uid()
    )
) WITH CHECK (
    status IN ('Pendente', 'Em Análise') -- Apenas permite status 'Pendente' ou 'Em Análise' (enviada para revisão), nunca 'Resolvida' diretamente
);

-- Políticas para 'tecnicos'
-- Podem ver e gerenciar pendências de propriedades vinculadas a auditorias atribuídas a eles
CREATE POLICY "Tecnicos gerenciam pendencias de propriedades que auditam" 
ON public.pendencias FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.auditorias 
        WHERE auditorias.propriedade_id = pendencias.propriedade_id 
        AND auditorias.tecnico_responsavel_id = auth.uid()
    )
);

-- ============================================================================
-- 3. PERMISSÕES DE ACESSO E PRIVILÉGIOS (GRANTS)
-- ============================================================================
GRANT SELECT, INSERT, UPDATE, DELETE ON public.pendencias TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
