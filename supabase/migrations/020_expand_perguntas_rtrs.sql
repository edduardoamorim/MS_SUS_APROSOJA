-- Altera a tabela public.perguntas_rtrs para suportar a estrutura completa do Excel RTRS
ALTER TABLE public.perguntas_rtrs ADD COLUMN IF NOT EXISTS ponderacao VARCHAR(255);
ALTER TABLE public.perguntas_rtrs ADD COLUMN IF NOT EXISTS orientacao TEXT;
ALTER TABLE public.perguntas_rtrs ADD COLUMN IF NOT EXISTS criterio TEXT;

-- Garante que o RLS e permissões continuem funcionando para as novas colunas
GRANT SELECT, INSERT, UPDATE, DELETE ON public.perguntas_rtrs TO anon, authenticated;
