-- Fix RLS policies for imoveis_car and imoveis_sigef tables
ALTER TABLE public.imoveis_car ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura publica imoveis_car" ON public.imoveis_car;
CREATE POLICY "Leitura publica imoveis_car" ON public.imoveis_car FOR SELECT USING (true);
GRANT SELECT ON public.imoveis_car TO anon, authenticated;

ALTER TABLE public.imoveis_sigef ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Leitura publica imoveis_sigef" ON public.imoveis_sigef;
CREATE POLICY "Leitura publica imoveis_sigef" ON public.imoveis_sigef FOR SELECT USING (true);
GRANT SELECT ON public.imoveis_sigef TO anon, authenticated;
