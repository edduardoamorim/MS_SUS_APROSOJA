-- Migration 048: Adiciona suporte a Interpretações Nacionais na Matriz RTRS
ALTER TABLE public.perguntas_rtrs ADD COLUMN IF NOT EXISTS interpretacao_nacional TEXT;

-- Concede permissões para anon e authenticated
GRANT SELECT, INSERT, UPDATE, DELETE ON public.perguntas_rtrs TO anon, authenticated;
