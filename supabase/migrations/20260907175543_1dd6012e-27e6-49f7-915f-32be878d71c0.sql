CREATE TABLE public.nina_confianca_propostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  tipo text NOT NULL,
  alvo text NOT NULL,
  valor_atual text,
  valor_sugerido text,
  justificativa text NOT NULL,
  evidencia jsonb NOT NULL DEFAULT '{}'::jsonb,
  origem text NOT NULL DEFAULT 'calibracao_automatica',
  periodo_inicio timestamptz,
  periodo_fim timestamptz,
  status text NOT NULL DEFAULT 'pendente',
  decidido_por uuid,
  decidido_em timestamptz,
  motivo_decisao text,
  aplicado_por uuid,
  aplicado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT nina_confianca_propostas_status_chk
    CHECK (status IN ('pendente','aprovada','rejeitada','aplicada','revertida')),
  CONSTRAINT nina_confianca_propostas_tipo_chk
    CHECK (tipo IN ('AJUSTAR_PESO','AJUSTAR_LIMITE','REVISAR_VALIDADOR','NOVO_BLOQUEADOR'))
);

CREATE INDEX idx_nina_confianca_propostas_clinica_status
  ON public.nina_confianca_propostas (clinica_id, status, created_at DESC);

GRANT SELECT, INSERT, UPDATE ON public.nina_confianca_propostas TO authenticated;
GRANT ALL ON public.nina_confianca_propostas TO service_role;

ALTER TABLE public.nina_confianca_propostas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "propostas_select_clinica" ON public.nina_confianca_propostas
  FOR SELECT TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()));

CREATE POLICY "propostas_insert_clinica" ON public.nina_confianca_propostas
  FOR INSERT TO authenticated
  WITH CHECK (clinica_id = ANY (public.clinicas_do_usuario()) AND status = 'pendente');

CREATE POLICY "propostas_update_clinica" ON public.nina_confianca_propostas
  FOR UPDATE TO authenticated
  USING (clinica_id = ANY (public.clinicas_do_usuario()))
  WITH CHECK (clinica_id = ANY (public.clinicas_do_usuario()));

CREATE OR REPLACE FUNCTION public.nina_confianca_propostas_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  IF NEW.status IN ('aprovada','rejeitada') AND NEW.decidido_por IS NULL THEN
    RAISE EXCEPTION 'Decisao de proposta exige responsavel humano (decidido_por).';
  END IF;
  IF NEW.status = 'aplicada' THEN
    IF OLD.status <> 'aprovada' AND OLD.status <> 'aplicada' THEN
      RAISE EXCEPTION 'Proposta so pode ser aplicada apos aprovacao.';
    END IF;
    IF NEW.aplicado_por IS NULL THEN
      RAISE EXCEPTION 'Aplicacao de proposta exige responsavel humano (aplicado_por).';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_nina_confianca_propostas_guard
  BEFORE INSERT OR UPDATE ON public.nina_confianca_propostas
  FOR EACH ROW EXECUTE FUNCTION public.nina_confianca_propostas_guard();