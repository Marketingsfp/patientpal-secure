ALTER FUNCTION public.fn_orc_itens_sync_status_legacy() SET search_path = public, pg_temp;

ALTER VIEW public.v_pacientes_duplicados_suspeitos SET (security_invoker = true);