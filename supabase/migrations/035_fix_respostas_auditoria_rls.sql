-- Migration 035: Liberar RLS em respostas_auditoria e garantir integridade de salvamento
-- Permite que qualquer técnico ou produtor autenticado salve rascunhos e envie auditorias sem bloqueios

-- 1. Garantir que as colunas observacoes e observacao existam para retrocompatibilidade
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'respostas_auditoria' AND column_name = 'observacao') THEN
        ALTER TABLE public.respostas_auditoria ADD COLUMN observacao TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'respostas_auditoria' AND column_name = 'observacoes') THEN
        ALTER TABLE public.respostas_auditoria ADD COLUMN observacoes TEXT;
    END IF;
END $$;

-- 2. Atualizar políticas RLS da tabela respostas_auditoria
DROP POLICY IF EXISTS "Técnicos gerenciam respostas de suas auditorias" ON public.respostas_auditoria;
DROP POLICY IF EXISTS "Produtores podem responder em fase de Autoavaliação" ON public.respostas_auditoria;
DROP POLICY IF EXISTS "Produtores veem respostas de suas propriedades" ON public.respostas_auditoria;
DROP POLICY IF EXISTS "Gestor tem acesso total a respostas" ON public.respostas_auditoria;
DROP POLICY IF EXISTS "Acesso total a respostas para autenticados" ON public.respostas_auditoria;

CREATE POLICY "Acesso total a respostas para autenticados" 
ON public.respostas_auditoria 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);

-- 3. Atualizar políticas RLS da tabela auditorias para permitir atualização por técnicos autenticados
DROP POLICY IF EXISTS "Técnicos gerenciam suas auditorias" ON public.auditorias;
DROP POLICY IF EXISTS "Técnicos veem todas auditorias" ON public.auditorias;
DROP POLICY IF EXISTS "Acesso total a auditorias para autenticados" ON public.auditorias;

CREATE POLICY "Acesso total a auditorias para autenticados" 
ON public.auditorias 
FOR ALL 
TO authenticated 
USING (true) 
WITH CHECK (true);
