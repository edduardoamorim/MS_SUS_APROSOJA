-- ============================================================================
-- SINCRONIZAÇÃO AUTOMÁTICA DE PERFIS (auth.users -> public.perfis)
-- ============================================================================

-- Função que espelha os metadados do Auth User na tabela de perfis pública
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.perfis (id, nome, email, role, status)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'full_name', 'Usuário'),
        new.email,
        COALESCE(new.raw_user_meta_data->>'role', 'produtor'),
        'Ativo'
    )
    ON CONFLICT (id) DO UPDATE
    SET 
        nome = EXCLUDED.nome,
        email = EXCLUDED.email,
        role = EXCLUDED.role;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger que dispara após um novo registro na tabela de autenticação
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill para usuários que já existem no Auth, mas não têm perfil público
INSERT INTO public.perfis (id, nome, email, role, status)
SELECT 
    id, 
    COALESCE(raw_user_meta_data->>'full_name', 'Usuário'), 
    email, 
    COALESCE(raw_user_meta_data->>'role', 'produtor'), 
    'Ativo'
FROM auth.users
ON CONFLICT (id) DO NOTHING;
