-- ============================================================================
-- 034_auto_resolve_municipios_cascade.sql
-- Resolução em cascata para preencher o município correto das propriedades
-- ============================================================================

-- 1. Atualiza município via intersecção geográfica PostGIS com a tabela municipios_ms
UPDATE public.propriedades p
SET municipio = m.nm_mun
FROM public.municipios_ms m
WHERE (p.municipio IS NULL OR LOWER(p.municipio) LIKE '%geral%' OR TRIM(p.municipio) = '')
  AND p.geom IS NOT NULL 
  AND ST_Intersects(p.geom, m.geom);

-- 2. Atualiza município consultando os imóveis CAR (imoveis_car)
UPDATE public.propriedades p
SET municipio = c.municipio
FROM public.imoveis_car c
WHERE (p.municipio IS NULL OR LOWER(p.municipio) LIKE '%geral%' OR TRIM(p.municipio) = '')
  AND p.codigo_car IS NOT NULL 
  AND (c.cod_imovel ILIKE p.codigo_car OR c.numerocar ILIKE p.codigo_car)
  AND c.municipio IS NOT NULL;

-- 3. Tratamento por palavra-chave do nome da fazenda se continuar sem município
UPDATE public.propriedades SET municipio = 'Chapadão do Sul' WHERE (LOWER(nome_fazenda) LIKE '%chapad%') AND (municipio IS NULL OR LOWER(municipio) LIKE '%geral%' OR TRIM(municipio) = '');
UPDATE public.propriedades SET municipio = 'Maracaju' WHERE (LOWER(nome_fazenda) LIKE '%campanar%') AND (municipio IS NULL OR LOWER(municipio) LIKE '%geral%' OR TRIM(municipio) = '');
UPDATE public.propriedades SET municipio = 'Água Clara' WHERE (LOWER(nome_fazenda) LIKE '%rio verde%') AND (municipio IS NULL OR LOWER(municipio) LIKE '%geral%' OR TRIM(municipio) = '');
UPDATE public.propriedades SET municipio = 'Ponta Porã' WHERE (LOWER(nome_fazenda) LIKE '%santa virg%') AND (municipio IS NULL OR LOWER(municipio) LIKE '%geral%' OR TRIM(municipio) = '');
UPDATE public.propriedades SET municipio = 'Corumbá' WHERE (LOWER(nome_fazenda) LIKE '%caceres%' OR LOWER(nome_fazenda) LIKE '%c%ceres%') AND (municipio IS NULL OR LOWER(municipio) LIKE '%geral%' OR TRIM(municipio) = '');
