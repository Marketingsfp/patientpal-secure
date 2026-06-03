REVOKE EXECUTE ON FUNCTION public.cubo_bi_financeiro_agregado(uuid, date, date, text, text, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cubo_bi_financeiro_agregado(uuid, date, date, text, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.cubo_bi_financeiro_agregado(uuid, date, date, text, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cubo_bi_financeiro_agregado(uuid, date, date, text, text, text, text, text, text) TO service_role;