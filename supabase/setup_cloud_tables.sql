-- ============================================================================
-- EXECUTAR NO SUPABASE DASHBOARD > SQL EDITOR
-- https://supabase.com/dashboard/project/bosbmfnzhjdtirhitgig/sql
-- ============================================================================

-- 1. Habilitar PostGIS (se ainda não existir)
CREATE EXTENSION IF NOT EXISTS postgis;

-- 2. Tabela de imóveis do CAR (Cadastro Ambiental Rural)
-- Colunas mapeiam diretamente do shapefile CAR-SHP-2026
CREATE TABLE IF NOT EXISTS public.imoveis_car (
    id SERIAL PRIMARY KEY,
    cod_imovel VARCHAR(255),        -- codigosica do shapefile (mapeado na importação)
    codigosica TEXT,                 -- código SICA original (ex: MS-5003207-2D62.5420...)
    cod_tema VARCHAR(50),
    nom_tema VARCHAR(100),
    numerocar VARCHAR(50),           -- ex: CARMS0020869
    municipio VARCHAR(255),          -- ex: CORUMBA
    nomeprop_1 TEXT,                 -- nome da fazenda (ex: FAZENDA CÁCERES)
    nome_imovel TEXT,                -- alias para nome da fazenda
    nome_proprietario TEXT,
    cpf_cnpj_proprietario VARCHAR(30),
    situacao_cadastral VARCHAR(50),  -- Inscrito, Pendente, Aprovado
    situcaocad VARCHAR(50),          -- alias do shapefile
    area_total_ha NUMERIC(15,4),
    areatotalc NUMERIC(20,4),        -- área total calculada do shapefile
    area_ha NUMERIC(15,4),
    coordenadas_texto TEXT,
    data_criacao TEXT,
    data_sicar TEXT,
    ativo INTEGER DEFAULT 1,
    responsavel_cpf_cnpj VARCHAR(30),
    responsavel_nome TEXT,
    responsavel_papel VARCHAR(100),
    geom geometry(MultiPolygon, 4326)
);

-- Índices para pesquisa rápida
CREATE INDEX IF NOT EXISTS idx_imoveis_car_cod ON public.imoveis_car (cod_imovel);
CREATE INDEX IF NOT EXISTS idx_imoveis_car_codigosica ON public.imoveis_car (codigosica);
CREATE INDEX IF NOT EXISTS idx_imoveis_car_numerocar ON public.imoveis_car (numerocar);
CREATE INDEX IF NOT EXISTS idx_imoveis_car_municipio ON public.imoveis_car (municipio);
CREATE INDEX IF NOT EXISTS idx_imoveis_car_geom ON public.imoveis_car USING GIST (geom);

-- 3. Tabela de imóveis do SIGEF (INCRA)
-- Colunas mapeiam diretamente do shapefile Sigef Brasil_MS
CREATE TABLE IF NOT EXISTS public.imoveis_sigef (
    id SERIAL PRIMARY KEY,
    parcela_co VARCHAR(255),         -- UUID da parcela (ex: f1b14991-4149-4e70-9aa5-...)
    rt VARCHAR(100),                 -- Responsável Técnico
    art VARCHAR(100),                -- ART
    situacao_i VARCHAR(100),         -- REGISTRADA, CERTIFICADA, etc.
    codigo_imo VARCHAR(100),         -- código do imóvel (ex: 9070810023725)
    data_submi DATE,
    data_aprov DATE,
    status VARCHAR(100),             -- REGISTRADA, etc.
    nome_area TEXT,                   -- nome da fazenda (ex: Fazenda Lageado - Remanescente)
    municipio_ VARCHAR(50),          -- código IBGE do município
    uf_id INTEGER,                   -- código UF (50 = MS)
    geom geometry(MultiPolygon, 4326)
);

CREATE INDEX IF NOT EXISTS idx_imoveis_sigef_parcela ON public.imoveis_sigef (parcela_co);
CREATE INDEX IF NOT EXISTS idx_imoveis_sigef_codigo ON public.imoveis_sigef (codigo_imo);
CREATE INDEX IF NOT EXISTS idx_imoveis_sigef_geom ON public.imoveis_sigef USING GIST (geom);

-- 4. RLS e Permissões (leitura para todos)
ALTER TABLE public.imoveis_car ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imoveis_sigef ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura publica imoveis_car" ON public.imoveis_car;
CREATE POLICY "Leitura publica imoveis_car" ON public.imoveis_car
FOR SELECT USING (true);

DROP POLICY IF EXISTS "Leitura publica imoveis_sigef" ON public.imoveis_sigef;
CREATE POLICY "Leitura publica imoveis_sigef" ON public.imoveis_sigef
FOR SELECT USING (true);

GRANT SELECT ON public.imoveis_car TO anon, authenticated;
GRANT SELECT ON public.imoveis_sigef TO anon, authenticated;

-- 5. Confirmar
SELECT 'Tabelas criadas com sucesso!' AS resultado;
