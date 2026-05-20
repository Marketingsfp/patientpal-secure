
CREATE TABLE IF NOT EXISTS public.integration_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  chave text NOT NULL,
  valor text NOT NULL,
  descricao text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, chave)
);

ALTER TABLE public.integration_secrets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins gerenciam secrets da clinica"
  ON public.integration_secrets
  FOR ALL
  USING (public.has_role(auth.uid(), clinica_id, 'admin'))
  WITH CHECK (public.has_role(auth.uid(), clinica_id, 'admin'));

CREATE OR REPLACE FUNCTION public.tg_integration_secrets_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER update_integration_secrets_updated_at
  BEFORE UPDATE ON public.integration_secrets
  FOR EACH ROW EXECUTE FUNCTION public.tg_integration_secrets_updated_at();

CREATE OR REPLACE FUNCTION public.checkin_agendamento(_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_ag record;
BEGIN
  SELECT id, clinica_id, paciente_nome, inicio, procedimento, status, fluxo_etapa
    INTO v_ag FROM public.agendamentos
   WHERE token_publico = _token LIMIT 1;
  IF v_ag IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'erro', 'Token invalido');
  END IF;
  UPDATE public.agendamentos
     SET fluxo_etapa = 'recepcao', fluxo_atualizado_em = now()
   WHERE id = v_ag.id;
  RETURN jsonb_build_object('ok', true, 'paciente', v_ag.paciente_nome,
                            'inicio', v_ag.inicio, 'procedimento', v_ag.procedimento);
END; $$;

GRANT EXECUTE ON FUNCTION public.checkin_agendamento(text) TO anon, authenticated;
