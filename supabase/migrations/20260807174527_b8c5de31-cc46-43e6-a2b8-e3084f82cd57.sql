-- 1) Campos de autorização de convênio
ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS convenio_autorizado boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS convenio_autorizado_em timestamptz,
  ADD COLUMN IF NOT EXISTS convenio_autorizado_por uuid;

COMMENT ON COLUMN public.agendamentos.convenio_autorizado IS
  'Autorização/conferência do convênio confirmada na recepção. Exigida para realizar o atendimento.';

-- 2) Regra global: sem pagamento (ou sem autorização de convênio) não realiza
CREATE OR REPLACE FUNCTION public.fn_agendamento_exige_pagamento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_avanca boolean := false;
  v_pago boolean := false;
  v_tipo text := lower(coalesce(NEW.tipo_atendimento, 'particular'));
BEGIN
  -- Conclusão do atendimento
  IF NEW.status = 'realizado'::agendamento_status
     AND OLD.status IS DISTINCT FROM 'realizado'::agendamento_status THEN
    v_avanca := true;
  END IF;

  -- Avanço para etapas de execução
  IF NEW.fluxo_etapa IS DISTINCT FROM OLD.fluxo_etapa
     AND NEW.fluxo_etapa IN ('atendimento'::fluxo_etapa, 'exame'::fluxo_etapa, 'finalizado'::fluxo_etapa) THEN
    v_avanca := true;
  END IF;

  IF NOT v_avanca THEN
    RETURN NEW;
  END IF;

  IF v_tipo = 'convenio' THEN
    IF NOT coalesce(NEW.convenio_autorizado, false) THEN
      RAISE EXCEPTION 'Convênio sem autorização confirmada. Confirme a autorização na recepção antes de realizar o atendimento.'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  v_pago := NEW.data_pagamento IS NOT NULL
    OR EXISTS (
      SELECT 1 FROM public.fin_lancamentos fl
      WHERE fl.agendamento_id = NEW.id
        AND fl.tipo = 'receita'::fin_tipo_lancamento
        AND fl.status = 'confirmado'::fin_status_lancamento
    )
    OR EXISTS (
      SELECT 1
      FROM public.caixa_movimentos cm
      JOIN public.fin_lancamentos fl2 ON fl2.id = cm.lancamento_id
      WHERE fl2.agendamento_id = NEW.id
        AND cm.tipo = 'recebimento'::caixa_mov_tipo
    );

  IF NOT v_pago THEN
    RAISE EXCEPTION 'Pagamento não identificado. O paciente deve pagar na chegada — registre o recebimento no caixa antes de realizar o atendimento.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_agendamento_exige_pagamento ON public.agendamentos;
CREATE TRIGGER trg_agendamento_exige_pagamento
  BEFORE UPDATE ON public.agendamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_agendamento_exige_pagamento();