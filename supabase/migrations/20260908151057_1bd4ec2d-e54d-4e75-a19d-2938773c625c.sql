CREATE TABLE public.integracao_verificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  api_key_id uuid NOT NULL REFERENCES public.integracao_api_keys(id) ON DELETE CASCADE,
  codigo text NOT NULL,
  codigo_normalizado text NOT NULL,
  status text NOT NULL DEFAULT 'aguardando',
  paciente_id uuid NULL,
  token_hash text NULL,
  token_expira_em timestamptz NULL,
  consumido_em timestamptz NULL,
  expira_em timestamptz NOT NULL,
  ip text NULL,
  wa_message_id text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT integracao_verificacoes_status_chk
    CHECK (status IN ('aguardando','verificado','nao_localizado','expirado'))
);

GRANT ALL ON public.integracao_verificacoes TO service_role;

ALTER TABLE public.integracao_verificacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "integracao_verificacoes_sem_acesso"
  ON public.integracao_verificacoes
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE UNIQUE INDEX integracao_verificacoes_codigo_aguardando
  ON public.integracao_verificacoes (clinica_id, codigo_normalizado)
  WHERE status = 'aguardando';

CREATE INDEX integracao_verificacoes_expira_em
  ON public.integracao_verificacoes (expira_em);

CREATE INDEX integracao_verificacoes_clinica_status
  ON public.integracao_verificacoes (clinica_id, status);

CREATE TRIGGER integracao_verificacoes_touch
  BEFORE UPDATE ON public.integracao_verificacoes
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();

CREATE OR REPLACE FUNCTION public.integracao_verificacoes_limpar()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_removidos integer;
BEGIN
  DELETE FROM public.integracao_verificacoes
   WHERE expira_em < now() - interval '24 hours';
  GET DIAGNOSTICS v_removidos = ROW_COUNT;
  RETURN v_removidos;
END;
$$;

REVOKE ALL ON FUNCTION public.integracao_verificacoes_limpar() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integracao_verificacoes_limpar() TO service_role;