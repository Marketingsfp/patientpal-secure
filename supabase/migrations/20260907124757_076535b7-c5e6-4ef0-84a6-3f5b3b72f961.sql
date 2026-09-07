REVOKE ALL ON FUNCTION public.nina_teste_resumo_leads(uuid, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.nina_teste_nao_lidas(uuid, uuid[]) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.nina_teste_nao_lidas(uuid, uuid[]) TO authenticated;