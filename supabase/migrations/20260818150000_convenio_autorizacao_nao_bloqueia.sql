-- Convênio: a autorização deixa de ser trava rígida.
--
-- Antes, um atendimento de convênio sem `convenio_autorizado = true` não podia
-- ser marcado como realizado — o que travava o botão "Baixar" do Financeiro.
-- A clínica não trabalha assim: a conferência da autorização é acompanhada na
-- recepção, e o financeiro precisa poder dar baixa e liberar o repasse mesmo
-- quando o campo ainda não foi marcado.
--
-- A regra de pagamento do atendimento PARTICULAR continua valendo igual.

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

  -- Convênio: sem trava. A autorização vira apenas informação de tela.
  IF v_tipo = 'convenio' THEN
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

COMMENT ON COLUMN public.agendamentos.convenio_autorizado IS
  'Autorização/conferência do convênio confirmada na recepção. Informativo — não bloqueia a baixa do atendimento.';
