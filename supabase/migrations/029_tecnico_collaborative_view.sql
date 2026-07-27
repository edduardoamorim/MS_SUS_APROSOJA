-- Allow technicians to SEE all auditorias (for the collaborative map view)
-- They can still only MODIFY their own auditorias via the existing policy
DROP POLICY IF EXISTS "Técnicos veem todas auditorias" ON public.auditorias;
CREATE POLICY "Técnicos veem todas auditorias" ON public.auditorias
FOR SELECT
USING (is_tecnico());
