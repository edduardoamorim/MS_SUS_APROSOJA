-- Relaxa a chave estrangeira da tabela perfis temporariamente para permitir o CRUD simulado no painel do Gestor.
ALTER TABLE public.perfis DROP CONSTRAINT perfis_id_fkey;

-- O ID não precisa mais vir do auth.users, podemos auto-gerar
ALTER TABLE public.perfis ALTER COLUMN id SET DEFAULT gen_random_uuid();
