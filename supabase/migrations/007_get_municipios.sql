-- ============================================================================
-- CRIAÇÃO DA FUNÇÃO PARA RETORNAR MUNICÍPIOS COMO GEOJSON
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_municipios()
RETURNS TABLE (
    id UUID,
    nm_mun VARCHAR,
    cd_mun VARCHAR,
    area_km2 DECIMAL,
    geom_json TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        municipios_ms.id, 
        municipios_ms.nm_mun, 
        municipios_ms.cd_mun, 
        municipios_ms.area_km2, 
        ST_AsGeoJSON(municipios_ms.geom) AS geom_json
    FROM public.municipios_ms;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Concede permissões para as roles autenticadas e anônimas
GRANT EXECUTE ON FUNCTION public.get_municipios() TO anon, authenticated;
