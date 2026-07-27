-- Garante permissões RLS para permitir leitura pública e gestão total de perguntas_rtrs
ALTER TABLE public.perguntas_rtrs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir leitura publica de perguntas_rtrs" ON public.perguntas_rtrs;
CREATE POLICY "Permitir leitura publica de perguntas_rtrs" ON public.perguntas_rtrs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir gestao total para gestores de perguntas_rtrs" ON public.perguntas_rtrs;
CREATE POLICY "Permitir gestao total para gestores de perguntas_rtrs" ON public.perguntas_rtrs FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.perguntas_rtrs TO anon, authenticated;
