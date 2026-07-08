-- ============================================================================
-- AUTONOMIA DO TÉCNICO DE CAMPO: POLÍTICAS DE RLS
-- ============================================================================

-- 1. Função utilitária para checar se o usuário logado é técnico de campo
CREATE OR REPLACE FUNCTION public.is_tecnico()
RETURNS BOOLEAN AS $$
BEGIN
    RETURN (
        current_setting('request.jwt.claims', true)::json->'user_metadata'->>'role' = 'tecnico'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Concede privilégios de execução
GRANT EXECUTE ON FUNCTION public.is_tecnico() TO anon, authenticated;

-- 2. Políticas adicionais para propriedades
-- Permite que técnicos cadastrem e leiam/alterem qualquer propriedade
CREATE POLICY "Técnicos tem acesso total a propriedades" ON public.propriedades 
FOR ALL USING (
    public.is_tecnico()
);

-- 3. Políticas adicionais para pendências
-- Permite que técnicos gerenciem qualquer pendência diretamente (incluindo inserção e exclusão)
CREATE POLICY "Técnicos tem acesso total a pendencias" ON public.pendencias 
FOR ALL USING (
    public.is_tecnico()
);
