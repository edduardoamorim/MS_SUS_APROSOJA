-- Migration 041: Garantir colunas na tabela pendencias e recarregar o cache do schema no PostgREST

ALTER TABLE public.pendencias 
ADD COLUMN IF NOT EXISTS tecnico_responsavel_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS criado_por UUID REFERENCES public.perfis(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS motivo_rejeicao TEXT,
ADD COLUMN IF NOT EXISTS gravidade VARCHAR(20) DEFAULT 'Média';

NOTIFY pgrst, 'reload schema';
