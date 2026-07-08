-- ============================================================================
-- 1. EXTENSÕES ESPACIAIS (PostGIS)
-- ============================================================================
-- Habilita a extensão PostGIS no schema public para suportar geometria (Polygon)
CREATE EXTENSION IF NOT EXISTS postgis SCHEMA public;

-- ============================================================================
-- 2. ENUMS
-- ============================================================================
-- Criação de um tipo ENUM para garantir a integridade dos status de auditoria
CREATE TYPE status_auditoria AS ENUM (
    'Autoavaliação', 
    'Visita de Campo', 
    'Em Análise', 
    'Certificada'
);

-- ============================================================================
-- 3. MODELAGEM DAS TABELAS
-- ============================================================================

-- Tabela: propriedades
-- Armazena os dados das fazendas. Adicionamos produtor_id referenciando auth.users.
CREATE TABLE public.propriedades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    produtor_id UUID REFERENCES auth.users(id) NOT NULL, -- Vinculado ao Produtor
    nome_fazenda VARCHAR(255) NOT NULL,
    nome_produtor VARCHAR(255) NOT NULL,
    -- Validação básica para formato do CAR (Cadastro Ambiental Rural)
    codigo_car VARCHAR(255) UNIQUE CHECK (codigo_car ~ '^[A-Z]{2}-\d{7}-[0-9A-Z]{4}\.[0-9A-Z]{4}\.[0-9A-Z]{4}\.[0-9A-Z]{4}$'), 
    geom geometry(Polygon, 4326), -- Armazena o polígono da propriedade com SRID 4326 (WGS 84, padrão web/GPS)
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela: auditorias
-- Registra as auditorias (certificações ou autoavaliações) vinculadas às propriedades
CREATE TABLE public.auditorias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    propriedade_id UUID REFERENCES public.propriedades(id) ON DELETE CASCADE,
    tecnico_responsavel_id UUID REFERENCES auth.users(id), -- Vinculado ao Técnico/Auditor responsável
    data_agendamento TIMESTAMPTZ,
    status status_auditoria DEFAULT 'Autoavaliação',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela: perguntas_rtrs
-- Catálogo estático das perguntas e critérios da certificação (Meio Ambiente, Trabalhista, etc.)
CREATE TABLE public.perguntas_rtrs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    secao VARCHAR(255) NOT NULL, 
    numero_criterio VARCHAR(50) NOT NULL UNIQUE, -- Ex: '1.1', '2.3'
    enunciado TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Tabela: respostas_auditoria
-- Respostas individuais para cada critério durante uma auditoria
CREATE TABLE public.respostas_auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auditoria_id UUID REFERENCES public.auditorias(id) ON DELETE CASCADE,
    pergunta_id UUID REFERENCES public.perguntas_rtrs(id) ON DELETE CASCADE,
    conforme BOOLEAN NOT NULL,
    observacoes TEXT,
    evidencia_url TEXT, -- Link para arquivo(s) armazenado(s) no Supabase Storage
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (auditoria_id, pergunta_id) -- Uma mesma pergunta não pode ser respondida 2 vezes na mesma auditoria
);


-- ============================================================================
-- 4. SEGURANÇA E CONTROLE DE ACESSO (RLS - ROW LEVEL SECURITY)
-- ============================================================================

-- Habilitando RLS para todas as tabelas
ALTER TABLE public.propriedades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perguntas_rtrs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respostas_auditoria ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- Políticas da Tabela: PROPRIEDADES
-- ----------------------------------------------------------------------------
-- Produtores: podem fazer CRUD apenas nas suas propriedades
CREATE POLICY "Produtores podem ver suas próprias propriedades" ON public.propriedades FOR SELECT USING (auth.uid() = produtor_id);
CREATE POLICY "Produtores podem inserir propriedades" ON public.propriedades FOR INSERT WITH CHECK (auth.uid() = produtor_id);
CREATE POLICY "Produtores podem editar suas próprias propriedades" ON public.propriedades FOR UPDATE USING (auth.uid() = produtor_id);

-- Técnicos/Auditores: podem VER propriedades que possuem uma auditoria delegada a eles
CREATE POLICY "Técnicos veem propriedades que auditam" ON public.propriedades FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.auditorias 
        WHERE auditorias.propriedade_id = propriedades.id 
        AND auditorias.tecnico_responsavel_id = auth.uid()
    )
);

-- ----------------------------------------------------------------------------
-- Políticas da Tabela: AUDITORIAS
-- ----------------------------------------------------------------------------
-- Produtores: podem VER auditorias feitas em suas propriedades
CREATE POLICY "Produtores veem auditorias de suas propriedades" ON public.auditorias FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.propriedades 
        WHERE propriedades.id = auditorias.propriedade_id 
        AND propriedades.produtor_id = auth.uid()
    )
);

-- Técnicos/Auditores: podem fazer tudo (ALL) nas auditorias sob sua responsabilidade
CREATE POLICY "Técnicos gerenciam suas auditorias" ON public.auditorias FOR ALL USING (auth.uid() = tecnico_responsavel_id);

-- ----------------------------------------------------------------------------
-- Políticas da Tabela: PERGUNTAS_RTRS
-- ----------------------------------------------------------------------------
-- Todos os usuários logados podem ler o catálogo de critérios
CREATE POLICY "Todos autenticados podem ler perguntas" ON public.perguntas_rtrs FOR SELECT TO authenticated USING (true);

-- ----------------------------------------------------------------------------
-- Políticas da Tabela: RESPOSTAS_AUDITORIA
-- ----------------------------------------------------------------------------
-- Produtores: podem VER respostas das auditorias de suas propriedades
CREATE POLICY "Produtores veem respostas de suas propriedades" ON public.respostas_auditoria FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.auditorias
        JOIN public.propriedades ON auditorias.propriedade_id = propriedades.id
        WHERE auditorias.id = respostas_auditoria.auditoria_id
        AND propriedades.produtor_id = auth.uid()
    )
);

-- Produtores: podem INSERIR/EDITAR respostas caso a auditoria esteja no status de 'Autoavaliação'
CREATE POLICY "Produtores podem responder em fase de Autoavaliação" ON public.respostas_auditoria FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.auditorias
        JOIN public.propriedades ON auditorias.propriedade_id = propriedades.id
        WHERE auditorias.id = respostas_auditoria.auditoria_id
        AND propriedades.produtor_id = auth.uid()
        AND auditorias.status = 'Autoavaliação'
    )
);

-- Técnicos/Auditores: podem fazer TUDO nas respostas das auditorias em que estão responsáveis
CREATE POLICY "Técnicos gerenciam respostas de suas auditorias" ON public.respostas_auditoria FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.auditorias 
        WHERE auditorias.id = respostas_auditoria.auditoria_id 
        AND auditorias.tecnico_responsavel_id = auth.uid()
    )
);
