-- Migration 039: Isolamento de propriedades, pendencias e documentos por produtor rural

-- 1. Habilitar RLS em propriedades se ainda nao estiver habilitado
ALTER TABLE public.propriedades ENABLE ROW LEVEL SECURITY;

-- Remover politicas anteriores de propriedades
DROP POLICY IF EXISTS "Todos autenticados podem ler propriedades" ON public.propriedades;
DROP POLICY IF EXISTS "Produtores veem suas propriedades" ON public.propriedades;
DROP POLICY IF EXISTS "Acesso total a propriedades" ON public.propriedades;

-- Politica 1.1: Gestores e Tecnicos veem todas as propriedades
CREATE POLICY "Gestores e Tecnicos veem todas as propriedades"
ON public.propriedades
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.perfis
    WHERE perfis.id = auth.uid() AND perfis.role IN ('gestor', 'tecnico')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.perfis
    WHERE perfis.id = auth.uid() AND perfis.role IN ('gestor', 'tecnico')
  )
);

-- Politica 1.2: Produtores veem e gerenciam apenas suas proprias fazendas
CREATE POLICY "Produtores veem apenas suas proprias propriedades"
ON public.propriedades
FOR ALL
TO authenticated
USING (
  produtor_id = auth.uid() OR 
  produtor_id IN (
    SELECT id FROM public.perfis WHERE LOWER(email) = LOWER(auth.jwt()->>'email')
  )
)
WITH CHECK (
  produtor_id = auth.uid() OR 
  produtor_id IN (
    SELECT id FROM public.perfis WHERE LOWER(email) = LOWER(auth.jwt()->>'email')
  )
);

-- 2. Garantir politicas de pendencias para produtores
ALTER TABLE public.pendencias ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Acesso total pendencias" ON public.pendencias;

CREATE POLICY "Gestores e Tecnicos veem todas pendencias"
ON public.pendencias
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.perfis
    WHERE perfis.id = auth.uid() AND perfis.role IN ('gestor', 'tecnico')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.perfis
    WHERE perfis.id = auth.uid() AND perfis.role IN ('gestor', 'tecnico')
  )
);

CREATE POLICY "Produtores veem apenas pendencias de suas propriedades"
ON public.pendencias
FOR ALL
TO authenticated
USING (
  propriedade_id IN (
    SELECT id FROM public.propriedades
    WHERE produtor_id = auth.uid() OR produtor_id IN (
      SELECT id FROM public.perfis WHERE LOWER(email) = LOWER(auth.jwt()->>'email')
    )
  )
)
WITH CHECK (
  propriedade_id IN (
    SELECT id FROM public.propriedades
    WHERE produtor_id = auth.uid() OR produtor_id IN (
      SELECT id FROM public.perfis WHERE LOWER(email) = LOWER(auth.jwt()->>'email')
    )
  )
);

NOTIFY pgrst, 'reload schema';
