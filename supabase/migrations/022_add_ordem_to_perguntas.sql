-- Adiciona a coluna 'ordem' à tabela perguntas_rtrs para suportar drag and drop
ALTER TABLE public.perguntas_rtrs ADD COLUMN IF NOT EXISTS ordem INTEGER DEFAULT 0;

-- Opcional: Atualiza a ordem com base na ordem atual de criação se desejar (não estritamente necessário se assumir 0 para todos inicialmente e eles forem ordenados pelo numero_criterio no JS até sofrerem a primeira reordenação manual).
