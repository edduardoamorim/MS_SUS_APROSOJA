-- Migration 043: Definir 'Prospecção' como a etapa padrão absoluta para todas as propriedades e auditorias existentes e futuras.

-- 1. Definir valor default 'Prospecção' na tabela de propriedades
ALTER TABLE public.propriedades 
ALTER COLUMN etapa SET DEFAULT 'Prospecção';

-- 2. Definir valor default 'Prospecção' na tabela de auditorias
ALTER TABLE public.auditorias 
ALTER COLUMN etapa SET DEFAULT 'Prospecção';

-- 3. Atualizar todas as propriedades e auditorias para a etapa 'Prospecção'
UPDATE public.propriedades 
SET etapa = 'Prospecção';

UPDATE public.auditorias 
SET etapa = 'Prospecção';

-- 4. Notificar PostgREST para recarregar o cache de schema
NOTIFY pgrst, 'reload schema';
