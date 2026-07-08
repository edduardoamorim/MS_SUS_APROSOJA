-- Adiciona a coluna 'ativo' à tabela perguntas_rtrs
ALTER TABLE public.perguntas_rtrs ADD COLUMN IF NOT EXISTS ativo BOOLEAN DEFAULT TRUE;

-- Garante que as roles do Supabase (anon e authenticated) tenham acesso aos objetos do schema public.
-- O controle fino de acesso continua sendo feito através de políticas de RLS.
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated;

-- Além disso, garante que novos objetos criados no futuro também herdem esses privilégios.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated;
