-- ATENDIMENTO "SEM FATURAMENTO" PASSA A APARECER NO FINANCEIRO
--
-- A marcação existia só na agenda. Ela não gerava registro financeiro nenhum,
-- então o atendimento não aparecia em Financeiro → Atendimentos e o setor de
-- repasse não tinha como pagar o profissional — embora a guia impressa (GR)
-- mostrasse o valor dele. Em 10/09/2026 isso deixou cinco atendimentos da
-- Carolina Ledig e do José Rodrigues fora do repasse.
--
-- Regra (a mesma da GR, ver src/lib/print-gr.ts): no sem faturamento quem abre
-- mão da parte é a CLÍNICA; o profissional atendeu e recebe o repasse
-- calculado sobre o valor de tabela do procedimento.
--
-- Mecanismo — o mesmo do atendimento externo: uma linha em fin_atendimentos
-- ligada ao agendamento, com valor_total = 0 e valor_clinica = 0 (nada entrou
-- no caixa, então receita e faturamento não mudam) e forma_pagamento
-- 'sem_faturamento'. O repasse do médico é calculado pela tela do Financeiro
-- com a tabela do procedimento e gravado em valor_medico na baixa/pagamento.
--
-- 1) A trava "Pagamento não identificado" deixa de barrar o Realizado da ficha
--    sem faturamento. A tela da Agenda já liberava; o banco recusava, e por
--    isso nenhuma ficha sem faturamento jamais ficou como realizada.
-- 2) Um gatilho mantém a linha do Financeiro em dia com a ficha: cria quando a
--    marcação é ligada, acompanha troca de médico/data/serviço, e remove quando
--    a marcação sai, a ficha é cancelada, vira falta ou o paciente sai (inclui
--    o reagendamento). Com repasse já pago, recusa a mudança.
-- 3) Cria a linha para as fichas já marcadas desde 01/08/2026.

CREATE OR REPLACE FUNCTION public.fn_agendamento_exige_pagamento()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  -- Sem faturamento: não existe pagamento a esperar — a clínica não cobra
  -- este atendimento. A marcação já exige motivo e autorização de supervisor.
  IF COALESCE(NEW.sem_faturamento, false) THEN
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
$function$;


CREATE OR REPLACE FUNCTION public.fn_sem_faturamento_sync_financeiro()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_deve boolean;
  v_data date;
  v_fin public.fin_atendimentos%rowtype;
  v_reagendando boolean :=
    COALESCE(current_setting('app.reagendamento_em_curso', true), '') = 'on';
BEGIN
  -- Só interessa ficha que está, ou estava, marcada.
  IF NOT COALESCE(NEW.sem_faturamento, false)
     AND (TG_OP = 'INSERT' OR NOT COALESCE(OLD.sem_faturamento, false)) THEN
    RETURN NULL;
  END IF;

  -- A linha do Financeiro existe enquanto houver um paciente de verdade num
  -- atendimento que não foi cancelado nem virou falta.
  v_deve := COALESCE(NEW.sem_faturamento, false)
            AND NEW.paciente_id IS NOT NULL
            AND NEW.status NOT IN ('cancelado'::agendamento_status, 'faltou'::agendamento_status);
  v_data := (NEW.inicio AT TIME ZONE 'America/Sao_Paulo')::date;

  SELECT * INTO v_fin
    FROM public.fin_atendimentos
   WHERE agendamento_id = NEW.id
     AND forma_pagamento = 'sem_faturamento'
   ORDER BY created_at
   LIMIT 1;

  IF v_deve THEN
    IF v_fin.id IS NULL THEN
      INSERT INTO public.fin_atendimentos (
        clinica_id, paciente_id, medico_id, data, procedimento,
        valor_total, valor_medico, valor_clinica,
        forma_pagamento, status, agendamento_id, observacoes
      ) VALUES (
        NEW.clinica_id, NEW.paciente_id, NEW.medico_id, v_data, NEW.procedimento,
        0, 0, 0,
        'sem_faturamento',
        CASE WHEN NEW.status = 'realizado'::agendamento_status THEN 'realizado' ELSE 'confirmado' END,
        NEW.id,
        'SEM FATURAMENTO' || COALESCE(' — ' || NULLIF(btrim(NEW.sem_faturamento_motivo), ''), '')
      );
    ELSIF NOT v_fin.repasse_pago THEN
      -- Acompanha a ficha. A baixa dada no Financeiro nunca é desfeita daqui:
      -- a ficha só consegue PROMOVER a linha a realizado.
      UPDATE public.fin_atendimentos SET
        paciente_id = NEW.paciente_id,
        medico_id = NEW.medico_id,
        data = v_data,
        procedimento = NEW.procedimento,
        -- Trocou o profissional ou o serviço: o repasse gravado era de outra
        -- regra e volta a ser calculado pela tela.
        valor_medico = CASE
          WHEN medico_id IS DISTINCT FROM NEW.medico_id
            OR procedimento IS DISTINCT FROM NEW.procedimento THEN 0
          ELSE valor_medico END,
        status = CASE WHEN NEW.status = 'realizado'::agendamento_status THEN 'realizado' ELSE status END
      WHERE id = v_fin.id
        AND (paciente_id IS DISTINCT FROM NEW.paciente_id
          OR medico_id IS DISTINCT FROM NEW.medico_id
          OR data IS DISTINCT FROM v_data
          OR procedimento IS DISTINCT FROM NEW.procedimento
          OR (NEW.status = 'realizado'::agendamento_status AND status <> 'realizado'));
    END IF;
  ELSIF v_fin.id IS NOT NULL THEN
    IF v_fin.repasse_pago THEN
      -- No reagendamento a linha paga acompanha o paciente para a ficha nova
      -- (passo 5 de reagendar_atendimento).
      IF v_reagendando THEN
        RETURN NULL;
      END IF;
      RAISE EXCEPTION
        'O repasse deste atendimento sem faturamento já foi pago ao profissional. Estorne o repasse em Financeiro → Atendimentos antes de remover a marcação, cancelar, dar falta ou trocar o paciente.';
    END IF;
    DELETE FROM public.fin_atendimentos
     WHERE agendamento_id = NEW.id
       AND forma_pagamento = 'sem_faturamento'
       AND NOT repasse_pago;
  END IF;

  RETURN NULL;
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_sem_faturamento_sync_financeiro() FROM public;
REVOKE ALL ON FUNCTION public.fn_sem_faturamento_sync_financeiro() FROM anon;

DROP TRIGGER IF EXISTS trg_sem_faturamento_sync_financeiro ON public.agendamentos;
CREATE TRIGGER trg_sem_faturamento_sync_financeiro
  AFTER INSERT OR UPDATE ON public.agendamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_sem_faturamento_sync_financeiro();


-- Vaga livre que ficou com a marcação de um paciente que saiu dela. Sem
-- limpar, o próximo paciente agendado ali nasceria "sem faturamento".
UPDATE public.agendamentos
   SET sem_faturamento = false,
       sem_faturamento_em = NULL,
       sem_faturamento_por = NULL,
       sem_faturamento_por_nome = NULL,
       sem_faturamento_motivo = NULL,
       sem_faturamento_autorizado_por = NULL,
       sem_faturamento_autorizado_por_nome = NULL
 WHERE sem_faturamento
   AND paciente_id IS NULL;


-- Fichas já marcadas. Desde 01/08/2026: a de 02/07 é um teste do
-- administrador, anterior à existência da função.
INSERT INTO public.fin_atendimentos (
  clinica_id, paciente_id, medico_id, data, procedimento,
  valor_total, valor_medico, valor_clinica,
  forma_pagamento, status, agendamento_id, observacoes
)
SELECT a.clinica_id, a.paciente_id, a.medico_id,
       (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date, a.procedimento,
       0, 0, 0,
       'sem_faturamento',
       CASE WHEN a.status = 'realizado'::agendamento_status THEN 'realizado' ELSE 'confirmado' END,
       a.id,
       'SEM FATURAMENTO' || COALESCE(' — ' || NULLIF(btrim(a.sem_faturamento_motivo), ''), '')
  FROM public.agendamentos a
 WHERE a.sem_faturamento
   AND a.paciente_id IS NOT NULL
   AND a.status NOT IN ('cancelado'::agendamento_status, 'faltou'::agendamento_status)
   AND a.inicio >= '2026-08-01'
   AND NOT EXISTS (
     SELECT 1 FROM public.fin_atendimentos f
      WHERE f.agendamento_id = a.id AND f.forma_pagamento = 'sem_faturamento'
   );
