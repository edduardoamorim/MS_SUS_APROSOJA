-- Habilita a extensão PostGIS para funções espaciais (ST_Intersects, ST_Contains, etc.)
CREATE EXTENSION IF NOT EXISTS postgis;

-- Tabela de Municípios (Dados vindos do Shapefile do IBGE/Imasul)
CREATE TABLE public.municipios_ms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nm_mun VARCHAR(255) NOT NULL, -- Nome do Município
    cd_mun VARCHAR(20), -- Código IBGE do município
    sigla_uf VARCHAR(2),
    area_km2 DECIMAL(10,2),
    geom geometry(MultiPolygon, 4326), -- Geometria real no sistema WGS84
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Adiciona coluna espacial à tabela de propriedades (assumindo Point inicialmente para facilitar,
-- mas poderia ser Polygon se o produtor submeter o perímetro KML/SHP da fazenda).
ALTER TABLE public.propriedades ADD COLUMN IF NOT EXISTS geom geometry(Point, 4326);

-- Criação de Índices Espaciais (GIST) - Crucial para performance de cruzamento de mapas
CREATE INDEX IF NOT EXISTS idx_municipios_geom ON public.municipios_ms USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_propriedades_geom ON public.propriedades USING GIST (geom);

-- Habilitar RLS na nova tabela
ALTER TABLE public.municipios_ms ENABLE ROW LEVEL SECURITY;

-- Políticas (Todos autenticados podem ver os municípios para o painel)
CREATE POLICY "Permitir leitura de municipios_ms para usuarios autenticados" 
ON public.municipios_ms FOR SELECT USING (auth.role() = 'authenticated');

-- Gestores podem inserir e atualizar
CREATE POLICY "Permitir insercao em municipios_ms para gestores" 
ON public.municipios_ms FOR INSERT WITH CHECK (is_gestor());

CREATE POLICY "Permitir alteracao em municipios_ms para gestores" 
ON public.municipios_ms FOR UPDATE USING (is_gestor());
