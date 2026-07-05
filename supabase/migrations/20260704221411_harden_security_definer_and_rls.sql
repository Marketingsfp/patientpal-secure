-- Security hardening for objects exposed through the Supabase Data API.
--
-- 1. These RPCs only need the caller's existing RLS privileges. Running them
--    as SECURITY INVOKER prevents them from bypassing tenant isolation.
ALTER FUNCTION public.buscar_paciente_contato(uuid, text, text, text)
  SECURITY INVOKER;
ALTER FUNCTION public.fin_atendimentos_matriz(uuid)
  SECURITY INVOKER;
ALTER FUNCTION public.top_procedimentos_agendamento(uuid, integer, integer, uuid, text)
  SECURITY INVOKER;
ALTER FUNCTION public.paciente_pendencias_cadastro(uuid)
  SECURITY INVOKER;

-- 2. Views are security-definer by default. Make this patient-data view obey
--    the RLS policies of its underlying tables for the calling role.
ALTER VIEW public.v_pacientes_duplicados_suspeitos
  SET (security_invoker = true);

REVOKE ALL ON public.v_pacientes_duplicados_suspeitos FROM PUBLIC, anon;
GRANT SELECT ON public.v_pacientes_duplicados_suspeitos TO authenticated, service_role;

-- 3. PostgreSQL grants EXECUTE to PUBLIC on newly-created functions unless
--    explicitly revoked. Remove that implicit access from every privileged
--    function except the intentionally token-based public endpoints.
DO $$
DECLARE
  r record;
  public_funcs text[] := ARRAY[
    'assinar_contrato_publico',
    'checkin_agendamento',
    'consulta_publica',
    'contrato_publico',
    'salvar_anamnese_publica',
    'verificar_certificado'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS signature
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT (p.proname = ANY(public_funcs))
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon',
      r.signature
    );
  END LOOP;
END
$$;

-- The four RPCs above are now invoker functions, so include them explicitly
-- because the loop intentionally targets SECURITY DEFINER functions only.
REVOKE EXECUTE ON FUNCTION public.buscar_paciente_contato(uuid, text, text, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.fin_atendimentos_matriz(uuid)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.top_procedimentos_agendamento(uuid, integer, integer, uuid, text)
  FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.paciente_pendencias_cadastro(uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.buscar_paciente_contato(uuid, text, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fin_atendimentos_matriz(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.top_procedimentos_agendamento(uuid, integer, integer, uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.paciente_pendencias_cadastro(uuid)
  TO authenticated, service_role;

-- 4. Make future functions private-by-default. Public/token endpoints must opt
--    in with an explicit GRANT in the same migration that creates them.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated, service_role;
