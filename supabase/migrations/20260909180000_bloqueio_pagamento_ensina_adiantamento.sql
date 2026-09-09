-- A trava de "particular paga na chegada" passa a ensinar as saídas de quem
-- já pagou antes.
--
-- A regra em si NÃO muda: um atendimento particular continua exigindo um
-- recebimento registrado antes de avançar para presença, execução ou
-- "realizado". O que muda é só o texto do erro.
--
-- Motivo: dinheiro que entrou antes não vira lançamento sozinho. Acontece em
-- dois casos, e a recepção esbarrava nesta mensagem sem nenhuma indicação do
-- que fazer — a ficha ficava presa e o atendimento não chegava ao Financeiro:
--
--   * pagamento feito na Clínica Total, antes da virada de sistema. O caminho
--     é a forma de pagamento "Pago no sistema anterior";
--   * valor deixado adiantado neste sistema em outro dia (sinal, sinalização
--     prévia). O caminho é marcar, na cobrança da ficha, "O paciente já pagou
--     este valor adiantado, em outro dia".
--
-- Os dois gravam o recebimento com o rastro do pagamento antigo (data e/ou
-- recibo), quitam a ficha e apuram o repasse do prestador normalmente, sem
-- somar um centavo na gaveta de hoje.

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
    RAISE EXCEPTION 'Pagamento não identificado. O paciente deve pagar na chegada — registre o recebimento no caixa antes de realizar o atendimento. Se ele JÁ PAGOU antes, abra a cobrança desta ficha e registre assim: pagamento feito na Clínica Total, use a forma "Pago no sistema anterior"; valor deixado adiantado neste sistema, marque "O paciente já pagou este valor adiantado". Nos dois casos informe a data ou o nº do recibo, e o valor não entra no caixa de hoje.'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;
