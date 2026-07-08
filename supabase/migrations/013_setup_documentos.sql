-- ============================================================================
-- TABELA DE DOCUMENTOS E EVIDÊNCIAS DA PROPRIEDADE
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    propriedade_id UUID REFERENCES public.propriedades(id) ON DELETE CASCADE NOT NULL,
    nome VARCHAR(255) NOT NULL,
    categoria VARCHAR(100) DEFAULT 'Outros', -- CAR, LAU, EPI, Contrato, Outros
    arquivo_url TEXT NOT NULL,
    criado_por UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;

-- Políticas para Gestor (Acesso total)
CREATE POLICY "Gestores tem acesso total a documentos" ON public.documentos
FOR ALL USING (public.is_gestor());

-- Políticas para Produtores (Acesso aos seus próprios documentos)
CREATE POLICY "Produtores gerenciam seus próprios documentos" ON public.documentos
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.propriedades
        WHERE propriedades.id = documentos.propriedade_id
        AND propriedades.produtor_id = auth.uid()
    )
);

-- Políticas para Técnicos (Ver e adicionar documentos de propriedades que auditam)
CREATE POLICY "Técnicos gerenciam documentos das propriedades que auditam" ON public.documentos
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.auditorias
        WHERE auditorias.propriedade_id = documentos.propriedade_id
        AND auditorias.tecnico_responsavel_id = auth.uid()
    )
);

-- Conceder Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documentos TO anon, authenticated;
