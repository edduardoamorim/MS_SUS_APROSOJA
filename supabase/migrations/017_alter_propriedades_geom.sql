-- Alterar o tipo da coluna geom para geometry genérico (aceitando Polygon e MultiPolygon)
ALTER TABLE public.propriedades ALTER COLUMN geom TYPE geometry(geometry, 4326);
