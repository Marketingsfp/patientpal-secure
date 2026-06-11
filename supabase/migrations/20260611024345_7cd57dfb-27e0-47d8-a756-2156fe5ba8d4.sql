-- ==============================================================
-- 1) Esconder colunas sensíveis de `medicos` do cliente (authenticated/anon).
--    O acesso continua via RPC `medico_dados_sensiveis(_medico_id)` que
--    valida `can_manage_clinica` ou o próprio médico.
-- ==============================================================
REVOKE SELECT (cpf, rg, data_nascimento, banco, agencia, conta, pix_chave, face_descriptor)
  ON public.medicos FROM authenticated, anon;

-- ==============================================================
-- 2) Esconder tokens do WhatsApp e segredos de integração do cliente.
--    Servidor (service_role / server fns) continua acessando.
-- ==============================================================
REVOKE SELECT (access_token, app_secret) ON public.whatsapp_configs FROM authenticated, anon;
REVOKE SELECT (valor) ON public.integration_secrets FROM authenticated, anon;

-- ==============================================================
-- 3) Revogar EXECUTE de funções SECURITY DEFINER que NÃO devem
--    ser chamadas por usuários anônimos. Mantemos só as públicas:
--      assinar_contrato_publico, checkin_agendamento, consulta_publica,
--      contrato_publico, salvar_anamnese_publica, verificar_certificado
-- ==============================================================
DO $$
DECLARE
  r record;
  public_funcs text[] := ARRAY[
    'assinar_contrato_publico','checkin_agendamento','consulta_publica',
    'contrato_publico','salvar_anamnese_publica','verificar_certificado'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig, p.proname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND NOT (p.proname = ANY(public_funcs))
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
  END LOOP;
END $$;