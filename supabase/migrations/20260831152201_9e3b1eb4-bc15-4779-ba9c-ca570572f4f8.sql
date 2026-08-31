REVOKE EXECUTE ON FUNCTION public.seed_clinica_padrao(uuid) FROM authenticated, anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.seed_clinica_padrao(uuid) TO service_role;