-- ============================================================================
-- TABELAS DE CONSULTA PARA IMÓVEIS CAR E SIGEF + AJUSTES NA PROPRIEDADES
-- ============================================================================

-- 1. Tabela de imóveis do CAR (Cadastro Ambiental Rural)
CREATE TABLE IF NOT EXISTS public.imoveis_car (
    id SERIAL PRIMARY KEY,
    cod_imovel VARCHAR(255),
    cod_tema VARCHAR(50),
    nom_tema VARCHAR(100),
    geom geometry(MultiPolygon, 4326)
);

CREATE INDEX IF NOT EXISTS idx_imoveis_car_cod ON public.imoveis_car (cod_imovel);
CREATE INDEX IF NOT EXISTS idx_imoveis_car_prefix ON public.imoveis_car (LEFT(cod_imovel, 12));
CREATE INDEX IF NOT EXISTS idx_imoveis_car_geom ON public.imoveis_car USING GIST (geom);

-- 2. Tabela de imóveis do SIGEF (INCRA)
CREATE TABLE IF NOT EXISTS public.imoveis_sigef (
    id SERIAL PRIMARY KEY,
    parcela_co VARCHAR(255),
    rt VARCHAR(100),
    art VARCHAR(100),
    situacao_i VARCHAR(100),
    codigo_imo VARCHAR(100),
    data_submi DATE,
    data_aprov DATE,
    status VARCHAR(100),
    nome_area TEXT,
    geom geometry(MultiPolygon, 4326)
);

CREATE INDEX IF NOT EXISTS idx_imoveis_sigef_parcela ON public.imoveis_sigef (parcela_co);
CREATE INDEX IF NOT EXISTS idx_imoveis_sigef_geom ON public.imoveis_sigef USING GIST (geom);

-- 3. RLS e Permissões (leitura para todos autenticados)
ALTER TABLE public.imoveis_car ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.imoveis_sigef ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Leitura publica imoveis_car" ON public.imoveis_car;
CREATE POLICY "Leitura publica imoveis_car" ON public.imoveis_car
FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Leitura publica imoveis_sigef" ON public.imoveis_sigef;
CREATE POLICY "Leitura publica imoveis_sigef" ON public.imoveis_sigef
FOR SELECT TO authenticated USING (true);

GRANT SELECT ON public.imoveis_car TO anon, authenticated;
GRANT SELECT ON public.imoveis_sigef TO anon, authenticated;

-- 4. Ajustar tabela propriedades para aceitar SIGEF e outras origens
-- Remover a constraint rígida do CAR
ALTER TABLE public.propriedades DROP CONSTRAINT IF EXISTS propriedades_codigo_car_check;

-- Adicionar colunas novas
ALTER TABLE public.propriedades ADD COLUMN IF NOT EXISTS codigo_sigef VARCHAR(255);
ALTER TABLE public.propriedades ADD COLUMN IF NOT EXISTS origem_cadastro VARCHAR(50) DEFAULT 'Manual';

-- Remover unique constraint se existir (para permitir null duplicados)
ALTER TABLE public.propriedades DROP CONSTRAINT IF EXISTS propriedades_codigo_car_key;
