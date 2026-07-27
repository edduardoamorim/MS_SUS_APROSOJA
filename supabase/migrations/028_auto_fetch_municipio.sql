-- Add municipio column to public.propriedades if not exists
ALTER TABLE public.propriedades ADD COLUMN IF NOT EXISTS municipio character varying(255);

-- Update trigger function to auto-populate municipio via spatial intersection with municipios_ms
CREATE OR REPLACE FUNCTION public.fn_auto_fetch_property_geom()
RETURNS TRIGGER AS $$
DECLARE
  v_found_geom geometry;
  v_found_mun text;
BEGIN
  -- 1. Se geom não estiver preenchido, tenta buscar por CAR (exato ou prefixo)
  IF NEW.geom IS NULL THEN
    IF NEW.codigo_car IS NOT NULL AND TRIM(NEW.codigo_car) <> '' THEN
      SELECT geom INTO v_found_geom 
      FROM public.imoveis_car 
      WHERE cod_imovel ILIKE NEW.codigo_car 
      LIMIT 1;

      IF v_found_geom IS NULL AND LENGTH(NEW.codigo_car) >= 10 THEN
        SELECT geom INTO v_found_geom 
        FROM public.imoveis_car 
        WHERE LEFT(cod_imovel, 10) = LEFT(NEW.codigo_car, 10) 
        LIMIT 1;
      END IF;
    END IF;

    -- 2. Tenta buscar por SIGEF se geom continuar nulo
    IF v_found_geom IS NULL AND NEW.codigo_sigef IS NOT NULL AND TRIM(NEW.codigo_sigef) <> '' THEN
      SELECT geom INTO v_found_geom 
      FROM public.imoveis_sigef 
      WHERE parcela_co ILIKE NEW.codigo_sigef OR codigo_imo ILIKE NEW.codigo_sigef 
      LIMIT 1;

      IF v_found_geom IS NULL AND LENGTH(NEW.codigo_sigef) >= 6 THEN
        SELECT geom INTO v_found_geom 
        FROM public.imoveis_sigef 
        WHERE parcela_co ILIKE LEFT(NEW.codigo_sigef, 6) || '%' 
        LIMIT 1;
      END IF;
    END IF;

    IF v_found_geom IS NOT NULL THEN
      NEW.geom := v_found_geom;
    END IF;
  END IF;

  -- 3. Auto-preencher município via intersecção espacial PostGIS com municipios_ms
  IF NEW.geom IS NOT NULL AND (NEW.municipio IS NULL OR TRIM(NEW.municipio) = '') THEN
    SELECT nm_mun INTO v_found_mun
    FROM public.municipios_ms
    WHERE ST_Intersects(NEW.geom, geom)
    LIMIT 1;

    IF v_found_mun IS NOT NULL THEN
      NEW.municipio := v_found_mun;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atualizar imediatamente todas as propriedades existentes no banco para preencher municipio e geom
UPDATE public.propriedades p
SET municipio = m.nm_mun
FROM public.municipios_ms m
WHERE p.geom IS NOT NULL AND ST_Intersects(p.geom, m.geom);

-- Garantir RLS no municipios_ms para leitura pública
ALTER TABLE public.municipios_ms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura publica municipios_ms" ON public.municipios_ms;
CREATE POLICY "Leitura publica municipios_ms" ON public.municipios_ms FOR SELECT USING (true);
GRANT SELECT ON public.municipios_ms TO anon, authenticated;
