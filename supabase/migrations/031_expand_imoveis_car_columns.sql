-- ============================================================================
-- EXPANDIR TABELA imoveis_car PARA NOVO SHAPEFILE CAR-SHP-2026
-- ============================================================================
-- O novo shapefile possui colunas enriquecidas: município, nome da fazenda,
-- proprietário, área total, status cadastral, coordenadas, etc.

-- 1. Adicionar novas colunas
ALTER TABLE public.imoveis_car ADD COLUMN IF NOT EXISTS numerocar VARCHAR(50);
ALTER TABLE public.imoveis_car ADD COLUMN IF NOT EXISTS municipio VARCHAR(255);
ALTER TABLE public.imoveis_car ADD COLUMN IF NOT EXISTS nome_imovel TEXT;
ALTER TABLE public.imoveis_car ADD COLUMN IF NOT EXISTS nome_proprietario TEXT;
ALTER TABLE public.imoveis_car ADD COLUMN IF NOT EXISTS cpf_cnpj_proprietario VARCHAR(30);
ALTER TABLE public.imoveis_car ADD COLUMN IF NOT EXISTS situacao_cadastral VARCHAR(50);
ALTER TABLE public.imoveis_car ADD COLUMN IF NOT EXISTS area_total_ha NUMERIC(15,4);
ALTER TABLE public.imoveis_car ADD COLUMN IF NOT EXISTS coordenadas_texto TEXT;
ALTER TABLE public.imoveis_car ADD COLUMN IF NOT EXISTS data_criacao TEXT;
ALTER TABLE public.imoveis_car ADD COLUMN IF NOT EXISTS data_sicar TEXT;
ALTER TABLE public.imoveis_car ADD COLUMN IF NOT EXISTS ativo INTEGER DEFAULT 1;
ALTER TABLE public.imoveis_car ADD COLUMN IF NOT EXISTS responsavel_cpf_cnpj VARCHAR(30);
ALTER TABLE public.imoveis_car ADD COLUMN IF NOT EXISTS responsavel_nome TEXT;
ALTER TABLE public.imoveis_car ADD COLUMN IF NOT EXISTS responsavel_papel VARCHAR(100);

-- 2. Índices para pesquisa rápida nos novos campos
CREATE INDEX IF NOT EXISTS idx_imoveis_car_numerocar ON public.imoveis_car (numerocar);
CREATE INDEX IF NOT EXISTS idx_imoveis_car_municipio ON public.imoveis_car (municipio);
CREATE INDEX IF NOT EXISTS idx_imoveis_car_nome_imovel ON public.imoveis_car USING GIN (to_tsvector('portuguese', COALESCE(nome_imovel, '')));
CREATE INDEX IF NOT EXISTS idx_imoveis_car_situacao ON public.imoveis_car (situacao_cadastral);

-- 3. Índice composto para autocomplete rápido (cod_imovel + nome_imovel)
CREATE INDEX IF NOT EXISTS idx_imoveis_car_cod_imovel_trgm ON public.imoveis_car USING GIN (cod_imovel gin_trgm_ops);
-- Nota: precisa da extensão pg_trgm. Se não existir, ignorar erro gracefully.
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 4. Manter RLS e permissões existentes (já definidos em 016)
-- Sem mudanças necessárias.
