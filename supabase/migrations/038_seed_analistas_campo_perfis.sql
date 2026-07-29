-- Migration 038: Garantir cadastros dos tecnicos de campo na tabela perfis

INSERT INTO public.perfis (nome, email, role, regiao, status)
SELECT 'Patrícia Vilela Soares', 'analistacampo1@aprosojams.org.br', 'tecnico', 'Maracaju', 'Ativo'
WHERE NOT EXISTS (SELECT 1 FROM public.perfis WHERE LOWER(email) = 'analistacampo1@aprosojams.org.br');

INSERT INTO public.perfis (nome, email, role, regiao, status)
SELECT 'Alexandre Santos Soares', 'analistacampo2@aprosojams.org.br', 'tecnico', 'Chapadão do Sul', 'Ativo'
WHERE NOT EXISTS (SELECT 1 FROM public.perfis WHERE LOWER(email) = 'analistacampo2@aprosojams.org.br');

NOTIFY pgrst, 'reload schema';
