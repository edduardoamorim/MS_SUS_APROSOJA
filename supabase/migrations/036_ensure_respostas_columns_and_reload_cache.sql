-- Migration 036: Garantir integridade total das colunas observacoes e observacao em respostas_auditoria

ALTER TABLE public.respostas_auditoria ADD COLUMN IF NOT EXISTS observacao TEXT;
ALTER TABLE public.respostas_auditoria ADD COLUMN IF NOT EXISTS observacoes TEXT;

-- Sincronizar dados entre as duas colunas
UPDATE public.respostas_auditoria SET observacoes = observacao WHERE observacoes IS NULL AND observacao IS NOT NULL;
UPDATE public.respostas_auditoria SET observacao = observacoes WHERE observacao IS NULL AND observacoes IS NOT NULL;

-- Notificar o PostgREST para atualizar o cache do schema imediatamente
NOTIFY pgrst, 'reload schema';
