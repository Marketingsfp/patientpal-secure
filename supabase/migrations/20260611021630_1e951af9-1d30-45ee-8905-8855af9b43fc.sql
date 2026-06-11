
ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS medico_laudador_id uuid REFERENCES public.medicos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS valor_laudo numeric(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS laudo_status text,
  ADD COLUMN IF NOT EXISTS laudo_emitido_em timestamptz,
  ADD COLUMN IF NOT EXISTS laudo_lancamento_id uuid REFERENCES public.fin_atendimentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_lanc_laudador
  ON public.fin_lancamentos(medico_laudador_id, laudo_status)
  WHERE medico_laudador_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.gerar_repasse_laudador_lanc()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_novo_id uuid;
  v_proc text;
BEGIN
  IF NEW.laudo_status IS DISTINCT FROM 'emitido' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.laudo_status = 'emitido' THEN RETURN NEW; END IF;
  IF NEW.medico_laudador_id IS NULL OR COALESCE(NEW.valor_laudo,0) <= 0 THEN RETURN NEW; END IF;
  IF NEW.laudo_lancamento_id IS NOT NULL THEN RETURN NEW; END IF;

  SELECT a.procedimento INTO v_proc
    FROM public.agendamentos a
   WHERE a.id = NEW.agendamento_id;

  INSERT INTO public.fin_atendimentos (
    clinica_id, paciente_id, medico_id, data, procedimento,
    valor_total, valor_medico, valor_clinica,
    forma_pagamento, status, observacoes
  ) VALUES (
    NEW.clinica_id, NEW.paciente_id, NEW.medico_laudador_id,
    COALESCE(NEW.laudo_emitido_em::date, CURRENT_DATE),
    '[LAUDO] ' || COALESCE(v_proc, NEW.descricao, ''),
    NEW.valor_laudo, NEW.valor_laudo, 0,
    'laudo', 'realizado',
    'Repasse de laudo do lançamento ' || NEW.id::text
  ) RETURNING id INTO v_novo_id;

  NEW.laudo_lancamento_id := v_novo_id;
  IF NEW.laudo_emitido_em IS NULL THEN NEW.laudo_emitido_em := now(); END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gerar_repasse_laudador_lanc ON public.fin_lancamentos;
CREATE TRIGGER trg_gerar_repasse_laudador_lanc
  BEFORE INSERT OR UPDATE OF laudo_status ON public.fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.gerar_repasse_laudador_lanc();
