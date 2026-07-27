-- Add motivo_rejeicao column to pendencias table
ALTER TABLE public.pendencias ADD COLUMN IF NOT EXISTS motivo_rejeicao text;
