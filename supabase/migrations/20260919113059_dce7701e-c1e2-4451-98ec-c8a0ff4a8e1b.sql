REVOKE ALL ON FUNCTION public.coach_expirar_treinos() FROM anon, authenticated, PUBLIC;
GRANT EXECUTE ON FUNCTION public.coach_expirar_treinos() TO service_role;