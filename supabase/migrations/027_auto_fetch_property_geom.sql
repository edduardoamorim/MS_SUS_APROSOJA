-- Trigger function to automatically fetch geometry from imoveis_car or imoveis_sigef whenever a property is inserted or updated without geom
CREATE OR REPLACE FUNCTION public.fn_auto_fetch_property_geom()
RETURNS TRIGGER AS $$
DECLARE
  v_found_geom geometry;
BEGIN
  -- Se geom já estiver preenchido, mantém
  IF NEW.geom IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- 1. Tenta buscar por CAR (exato ou por prefixo)
  IF NEW.codigo_car IS NOT NULL AND TRIM(NEW.codigo_car) <> '' THEN
    -- Busca exata em imoveis_car
    SELECT geom INTO v_found_geom 
    FROM public.imoveis_car 
    WHERE cod_imovel ILIKE NEW.codigo_car 
    LIMIT 1;

    -- Se não encontrar exato, busca pelo código base do município (ex: MS-5000203)
    IF v_found_geom IS NULL AND LENGTH(NEW.codigo_car) >= 10 THEN
      SELECT geom INTO v_found_geom 
      FROM public.imoveis_car 
      WHERE LEFT(cod_imovel, 10) = LEFT(NEW.codigo_car, 10) 
      LIMIT 1;
    END IF;
  END IF;

  -- 2. Tenta buscar por SIGEF se geom continuar nulo
  IF v_found_geom IS NULL AND NEW.codigo_sigef IS NOT NULL AND TRIM(NEW.codigo_sigef) <> '' THEN
    -- Busca exata em imoveis_sigef
    SELECT geom INTO v_found_geom 
    FROM public.imoveis_sigef 
    WHERE parcela_co ILIKE NEW.codigo_sigef OR codigo_imo ILIKE NEW.codigo_sigef 
    LIMIT 1;

    -- Se não encontrar exato, busca pelo prefixo da parcela
    IF v_found_geom IS NULL AND LENGTH(NEW.codigo_sigef) >= 6 THEN
      SELECT geom INTO v_found_geom 
      FROM public.imoveis_sigef 
      WHERE parcela_co ILIKE LEFT(NEW.codigo_sigef, 6) || '%' 
      LIMIT 1;
    END IF;
  END IF;

  -- Atribui a geometria encontrada
  IF v_found_geom IS NOT NULL THEN
    NEW.geom := v_found_geom;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar trigger para disparar antes de INSERT ou UPDATE na tabela propriedades
DROP TRIGGER IF EXISTS trg_auto_fetch_property_geom ON public.propriedades;
CREATE TRIGGER trg_auto_fetch_property_geom
BEFORE INSERT OR UPDATE ON public.propriedades
FOR EACH ROW
EXECUTE FUNCTION public.fn_auto_fetch_property_geom();

-- Atualizar imediatamente todas as propriedades existentes no banco de dados que estejam sem geom
UPDATE public.propriedades p
SET geom = c.geom
FROM public.imoveis_car c
WHERE p.geom IS NULL 
  AND p.codigo_car IS NOT NULL 
  AND (c.cod_imovel ILIKE p.codigo_car OR LEFT(c.cod_imovel, 10) = LEFT(p.codigo_car, 10));

UPDATE public.propriedades p
SET geom = s.geom
FROM public.imoveis_sigef s
WHERE p.geom IS NULL 
  AND p.codigo_sigef IS NOT NULL 
  AND (s.parcela_co ILIKE p.codigo_sigef OR s.codigo_imo ILIKE p.codigo_sigef OR LEFT(s.parcela_co, 6) = LEFT(p.codigo_sigef, 6));
