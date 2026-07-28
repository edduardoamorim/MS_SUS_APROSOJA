-- ============================================================================
-- MIGRATION: ETAPA 1 - NOVAS TABELAS E RLS (PROSPECTOS, PRODUCAO_CREDITO, GRUPOS, MODELOS, ACEITE_TERMOS)
-- ============================================================================

-- Função auxiliar garantida para checar se o usuário é gestor
CREATE OR REPLACE FUNCTION public.is_gestor()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        COALESCE(current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role', '') = 'gestor'
        OR
        EXISTS (
          SELECT 1 FROM public.perfis 
          WHERE perfis.id = auth.uid() AND perfis.role = 'gestor'
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 1. TABELA: prospectos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.prospectos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome TEXT NOT NULL,
    email TEXT NOT NULL,
    telefone TEXT,
    nome_propriedade TEXT,
    municipio TEXT,
    mensagem TEXT,
    status TEXT NOT NULL DEFAULT 'novo',
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.prospectos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura de prospectos apenas para gestor" ON public.prospectos;
CREATE POLICY "Leitura de prospectos apenas para gestor" ON public.prospectos
    FOR SELECT USING (public.is_gestor());

DROP POLICY IF EXISTS "Insercao publica anonima de prospectos" ON public.prospectos;
CREATE POLICY "Insercao publica anonima de prospectos" ON public.prospectos
    FOR INSERT WITH CHECK (true);

GRANT SELECT, INSERT ON public.prospectos TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 2. TABELA: producao_credito
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.producao_credito (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    propriedade_id UUID NOT NULL REFERENCES public.propriedades(id) ON DELETE CASCADE,
    ano_safra TEXT NOT NULL,
    area_plantada_ha NUMERIC(15,4),
    producao_estimada_ton NUMERIC(15,4),
    volume_credito_rtrs NUMERIC(15,4),
    observacoes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.producao_credito ENABLE ROW LEVEL SECURITY;

-- Permissão RLS CRÍTICA: Somente gestor OU o produtor dono da propriedade podem ler e editar. Técnico é bloqueado.
DROP POLICY IF EXISTS "Gestor e Produtor dono veem producao_credito" ON public.producao_credito;
CREATE POLICY "Gestor e Produtor dono veem producao_credito" ON public.producao_credito
    FOR SELECT USING (
        public.is_gestor() 
        OR EXISTS (
            SELECT 1 FROM public.propriedades 
            WHERE propriedades.id = producao_credito.propriedade_id 
            AND propriedades.produtor_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "Gestor e Produtor dono gerenciam producao_credito" ON public.producao_credito;
CREATE POLICY "Gestor e Produtor dono gerenciam producao_credito" ON public.producao_credito
    FOR ALL USING (
        public.is_gestor() 
        OR EXISTS (
            SELECT 1 FROM public.propriedades 
            WHERE propriedades.id = producao_credito.propriedade_id 
            AND propriedades.produtor_id = auth.uid()
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.producao_credito TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. TABELAS: grupos_propriedades e propriedades_grupos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.grupos_propriedades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nome_grupo TEXT NOT NULL,
    regiao TEXT,
    descricao TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.propriedades_grupos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    grupo_id UUID NOT NULL REFERENCES public.grupos_propriedades(id) ON DELETE CASCADE,
    propriedade_id UUID NOT NULL REFERENCES public.propriedades(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (grupo_id, propriedade_id)
);

ALTER TABLE public.grupos_propriedades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.propriedades_grupos ENABLE ROW LEVEL SECURITY;

-- Permissão RLS: Leitura e escrita exclusivas do perfil 'gestor'
DROP POLICY IF EXISTS "Gestor gerencia grupos_propriedades" ON public.grupos_propriedades;
CREATE POLICY "Gestor gerencia grupos_propriedades" ON public.grupos_propriedades
    FOR ALL USING (public.is_gestor());

DROP POLICY IF EXISTS "Gestor gerencia propriedades_grupos" ON public.propriedades_grupos;
CREATE POLICY "Gestor gerencia propriedades_grupos" ON public.propriedades_grupos
    FOR ALL USING (public.is_gestor());

GRANT ALL ON public.grupos_propriedades TO authenticated, service_role;
GRANT ALL ON public.propriedades_grupos TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 4. TABELA: modelos_documentos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.modelos_documentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    titulo TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT CHECK (categoria IN ('RH', 'Ambiental', 'Seguranca', 'Geral')),
    arquivo_url TEXT NOT NULL,
    criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.modelos_documentos ENABLE ROW LEVEL SECURITY;

-- Permissão RLS: Leitura para todos autenticados. Edição/Exclusão apenas gestor.
DROP POLICY IF EXISTS "Autenticados leem modelos_documentos" ON public.modelos_documentos;
CREATE POLICY "Autenticados leem modelos_documentos" ON public.modelos_documentos
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Gestor gerencia modelos_documentos" ON public.modelos_documentos;
CREATE POLICY "Gestor gerencia modelos_documentos" ON public.modelos_documentos
    FOR ALL USING (public.is_gestor());

GRANT ALL ON public.modelos_documentos TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 5. TABELA: aceite_termos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.aceite_termos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    propriedade_id UUID REFERENCES public.propriedades(id) ON DELETE CASCADE,
    tipo_termo TEXT CHECK (tipo_termo IN ('Adesao', 'Delegacao')),
    metodo TEXT CHECK (metodo IN ('GovBr', 'UploadManual')),
    assinado_em TIMESTAMPTZ DEFAULT now(),
    ip_origem TEXT,
    arquivo_pdf_url TEXT,
    hash_validacao TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.aceite_termos ENABLE ROW LEVEL SECURITY;

-- Permissão RLS: Leitura e inserção apenas do próprio produtor ou do gestor
DROP POLICY IF EXISTS "Produtor e Gestor leem aceite_termos" ON public.aceite_termos;
CREATE POLICY "Produtor e Gestor leem aceite_termos" ON public.aceite_termos
    FOR SELECT USING (public.is_gestor() OR usuario_id = auth.uid());

DROP POLICY IF EXISTS "Produtor e Gestor inserem aceite_termos" ON public.aceite_termos;
CREATE POLICY "Produtor e Gestor inserem aceite_termos" ON public.aceite_termos
    FOR INSERT WITH CHECK (public.is_gestor() OR usuario_id = auth.uid());

GRANT SELECT, INSERT ON public.aceite_termos TO authenticated, service_role;

SELECT 'Migration Etapa 1 aplicada com sucesso!' AS resultado;
