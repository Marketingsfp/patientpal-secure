REVOKE EXECUTE ON FUNCTION public.paciente_cartao_inadimplente(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.paciente_cartao_inadimplente(uuid, uuid) TO authenticated;