-- Migração 042: Adicionar coluna etapa nas tabelas auditorias e propriedades e notificar PostgREST

-- 1. Coluna etapa na tabela auditorias
ALTER TABLE auditorias 
ADD COLUMN IF NOT EXISTS etapa text DEFAULT 'Prospecção';

-- 2. Coluna etapa na tabela propriedades
ALTER TABLE propriedades 
ADD COLUMN IF NOT EXISTS etapa text DEFAULT 'Prospecção';

-- 3. Constraints de validação
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'auditorias_etapa_check'
  ) THEN
    ALTER TABLE auditorias ADD CONSTRAINT auditorias_etapa_check CHECK (etapa IN ('Prospecção', 'Auditoria Prévia', 'Auditoria Oficial'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'propriedades_etapa_check'
  ) THEN
    ALTER TABLE propriedades ADD CONSTRAINT propriedades_etapa_check CHECK (etapa IN ('Prospecção', 'Auditoria Prévia', 'Auditoria Oficial'));
  END IF;
END $$;

-- 4. Atualização retrocompatível dos registros existentes (fazendo cast ::text para evitar erros de enum)
UPDATE auditorias SET etapa = 'Auditoria Prévia' WHERE status::text = 'Autoavaliação';
UPDATE auditorias SET etapa = 'Auditoria Oficial' WHERE status::text IN ('Visita de Campo', 'Em Análise', 'Certificada', 'Acompanhamento');
UPDATE auditorias SET etapa = 'Prospecção' WHERE status IS NULL OR status::text NOT IN ('Autoavaliação', 'Visita de Campo', 'Em Análise', 'Certificada', 'Acompanhamento');

UPDATE propriedades p 
SET etapa = COALESCE(a.etapa, 'Prospecção')
FROM (
  SELECT DISTINCT ON (propriedade_id) propriedade_id, etapa
  FROM auditorias
  ORDER BY propriedade_id, created_at DESC
) a
WHERE p.id = a.propriedade_id;

-- 5. Recarregar cache do schema PostgREST
NOTIFY pgrst, 'reload schema';
