-- Migration 037: Criar RPC check_email_exists para verificacao publica de e-mail na recuperacao de senha

CREATE OR REPLACE FUNCTION public.check_email_exists(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM auth.users WHERE LOWER(email) = LOWER(p_email)
  ) OR EXISTS (
    SELECT 1 FROM public.produtores WHERE LOWER(email) = LOWER(p_email)
  ) OR EXISTS (
    SELECT 1 FROM public.tecnicos WHERE LOWER(email) = LOWER(p_email)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_email_exists(TEXT) TO anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';
