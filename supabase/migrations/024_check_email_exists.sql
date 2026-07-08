CREATE OR REPLACE FUNCTION public.check_email_exists(p_email text)
RETURNS boolean AS $$
DECLARE
  v_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.perfis WHERE email = p_email) INTO v_exists;
  RETURN v_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.check_email_exists(text) TO anon, authenticated;
