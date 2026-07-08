-- ============================================================================
-- APERFEIÇOAMENTO DE POLÍTICAS DE RLS PARA PERFIS (AUTONOMIA DO TÉCNICO)
-- ============================================================================

-- Remover políticas se existirem para evitar conflitos
DROP POLICY IF EXISTS "Todos autenticados podem ver perfis" ON public.perfis;
DROP POLICY IF EXISTS "Técnicos podem cadastrar produtores" ON public.perfis;

-- Política 1: Permitir que qualquer usuário autenticado (técnicos, gestores, etc) possa ler os perfis de outros usuários.
-- Isso é essencial para carregar a lista de produtores no dropdown do técnico.
CREATE POLICY "Todos autenticados podem ver perfis" 
ON public.perfis 
FOR SELECT 
TO authenticated 
USING (true);

-- Política 2: Permitir que usuários autenticados (técnicos de campo) possam registrar novos produtores
-- na fase de prospecção. Limitamos a inserção apenas para perfis com a role 'produtor'.
CREATE POLICY "Técnicos podem cadastrar produtores" 
ON public.perfis 
FOR INSERT 
TO authenticated 
WITH CHECK (role = 'produtor');
