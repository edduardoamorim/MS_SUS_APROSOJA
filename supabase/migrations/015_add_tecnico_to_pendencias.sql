-- ============================================================================
-- ADICIONA TÉCNICO RESPONSÁVEL ÀS PENDÊNCIAS
-- ============================================================================

ALTER TABLE public.pendencias 
ADD COLUMN IF NOT EXISTS tecnico_responsavel_id UUID REFERENCES public.perfis(id) ON DELETE SET NULL;
