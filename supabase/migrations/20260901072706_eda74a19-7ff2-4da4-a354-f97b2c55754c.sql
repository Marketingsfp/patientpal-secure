ALTER TABLE public.agendamentos ADD COLUMN IF NOT EXISTS solicitacao_pendente boolean NOT NULL DEFAULT false;
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS origem text;

CREATE INDEX IF NOT EXISTS idx_agendamentos_solicitacao_pendente
  ON public.agendamentos (clinica_id, inicio)
  WHERE solicitacao_pendente;

CREATE UNIQUE INDEX IF NOT EXISTS uq_agendamentos_origem_id_externo
  ON public.agendamentos (clinica_id, origem_integracao, id_externo)
  WHERE origem_integracao IS NOT NULL AND id_externo IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.intake_rate_limit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chave text NOT NULL,
  janela text NOT NULL,
  janela_inicio timestamptz NOT NULL DEFAULT now(),
  contador integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (chave, janela)
);

GRANT ALL ON public.intake_rate_limit TO service_role;
ALTER TABLE public.intake_rate_limit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "intake_rate_limit sem acesso direto"
  ON public.intake_rate_limit FOR SELECT TO authenticated USING (false);

CREATE OR REPLACE FUNCTION public.intake_consumir_rate_limit(
  _chave text, _janela text, _limite integer, _segundos integer
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_contador integer;
BEGIN
  INSERT INTO public.intake_rate_limit (chave, janela, janela_inicio, contador)
  VALUES (_chave, _janela, now(), 1)
  ON CONFLICT (chave, janela) DO UPDATE
    SET contador = CASE
          WHEN public.intake_rate_limit.janela_inicio < now() - make_interval(secs => _segundos) THEN 1
          ELSE public.intake_rate_limit.contador + 1 END,
        janela_inicio = CASE
          WHEN public.intake_rate_limit.janela_inicio < now() - make_interval(secs => _segundos) THEN now()
          ELSE public.intake_rate_limit.janela_inicio END,
        updated_at = now()
  RETURNING contador INTO v_contador;
  RETURN v_contador <= _limite;
END; $$;

REVOKE ALL ON FUNCTION public.intake_consumir_rate_limit(text, text, integer, integer) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.intake_consumir_rate_limit(text, text, integer, integer) TO service_role;

-- Solicitação do site: NÃO passa pelo núcleo da agenda de propósito.
-- Não escolhe slot, não ocupa agenda_id e nasce marcada como pendente de
-- confirmação da recepção. Quem confirma usa a Agenda normal.
CREATE OR REPLACE FUNCTION public.criar_solicitacao_site(
  _clinica_id uuid,
  _paciente_id uuid,
  _paciente_nome text,
  _inicio timestamptz,
  _fim timestamptz,
  _procedimento text,
  _especialidade_id uuid,
  _medico_id uuid,
  _observacoes text,
  _id_externo text
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.agendamentos
   WHERE clinica_id = _clinica_id
     AND origem_integracao = 'site_publico'
     AND id_externo = _id_externo
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.agendamentos (
    clinica_id, paciente_id, paciente_nome, medico_id, especialidade_id,
    inicio, fim, procedimento, status, observacoes, tipo_atendimento,
    solicitacao_pendente, origem_integracao, id_externo
  ) VALUES (
    _clinica_id, _paciente_id, _paciente_nome, _medico_id, _especialidade_id,
    _inicio, _fim, _procedimento, 'agendado'::agendamento_status, _observacoes,
    'particular', true, 'site_publico', _id_externo
  ) RETURNING id INTO v_id;

  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.criar_solicitacao_site(uuid, uuid, text, timestamptz, timestamptz, text, uuid, uuid, text, text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.criar_solicitacao_site(uuid, uuid, text, timestamptz, timestamptz, text, uuid, uuid, text, text) TO service_role;