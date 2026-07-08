-- ============================================================================
-- 1. TABELA DE PERFIS DE USUÁRIOS
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.perfis (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    nome VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'produtor', -- gestor, tecnico, produtor
    regiao VARCHAR(100),
    fazendas_vinculadas INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'Ativo',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Habilitando RLS para a tabela de perfis
ALTER TABLE public.perfis ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- 2. ALTERAÇÕES NA TABELA PROPRIEDADES (FLEXIBILIDADE TEMPORÁRIA)
-- ============================================================================
-- Como o frontend do gestor não tem o ID do produtor obrigatoriamente logo de cara,
-- precisamos tornar produtor_id opcional por enquanto, OU garantir que a interface passe-o.
-- Vamos permitir que produtor_id seja nulo apenas para inserções manuais do gestor onde ele pode vincular depois.
ALTER TABLE public.propriedades ALTER COLUMN produtor_id DROP NOT NULL;

-- ============================================================================
-- 3. POLÍTICAS DE RLS PARA A ROLE 'GESTOR'
-- ============================================================================

-- Função utilitária para checar se o usuário logado é gestor
CREATE OR REPLACE FUNCTION public.is_gestor()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role' = 'gestor'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- Políticas da Tabela: PROPRIEDADES
-- ----------------------------------------------------------------------------
CREATE POLICY "Gestor tem acesso total a propriedades" ON public.propriedades FOR ALL USING (public.is_gestor());

-- ----------------------------------------------------------------------------
-- Políticas da Tabela: AUDITORIAS
-- ----------------------------------------------------------------------------
CREATE POLICY "Gestor tem acesso total a auditorias" ON public.auditorias FOR ALL USING (public.is_gestor());

-- ----------------------------------------------------------------------------
-- Políticas da Tabela: PERGUNTAS_RTRS
-- ----------------------------------------------------------------------------
CREATE POLICY "Gestor tem acesso total a perguntas" ON public.perguntas_rtrs FOR ALL USING (public.is_gestor());

-- ----------------------------------------------------------------------------
-- Políticas da Tabela: RESPOSTAS_AUDITORIA
-- ----------------------------------------------------------------------------
CREATE POLICY "Gestor tem acesso total a respostas" ON public.respostas_auditoria FOR ALL USING (public.is_gestor());

-- ----------------------------------------------------------------------------
-- Políticas da Tabela: PERFIS
-- ----------------------------------------------------------------------------
CREATE POLICY "Gestor tem acesso total a perfis" ON public.perfis FOR ALL USING (public.is_gestor());
CREATE POLICY "Usuários veem seus próprios perfis" ON public.perfis FOR SELECT USING (auth.uid() = id);
