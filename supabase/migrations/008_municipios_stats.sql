-- ============================================================================
-- FUNÇÃO DE CRUZAMENTO ESPACIAL (POSTGIS): ESTATÍSTICAS DE MUNICÍPIOS E FAZENDAS
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_municipios_stats()
RETURNS TABLE (
    nm_mun VARCHAR,
    cd_mun VARCHAR,
    area_km2 DECIMAL,
    farm_count BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        m.nm_mun, 
        m.cd_mun, 
        m.area_km2,
        COUNT(p.id) AS farm_count
    FROM public.municipios_ms m
    LEFT JOIN public.propriedades p ON ST_Contains(m.geom, p.geom)
    GROUP BY m.nm_mun, m.cd_mun, m.area_km2
    ORDER BY farm_count DESC, m.nm_mun ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Concede permissão de execução
GRANT EXECUTE ON FUNCTION public.get_municipios_stats() TO anon, authenticated;
