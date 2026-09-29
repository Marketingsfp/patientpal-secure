-- ---------------------------------------------------------------------------
-- REPASSE TRIPLO — pagar a parte do TERCEIRO (dono do equipamento) sozinha
--
-- Até aqui a parte do terceiro só saía junto com o repasse do médico
-- executante (pagar_repasse_medico_com_terceiros). Filtrando a tela
-- Financeiro → Atendimentos pelo próprio terceiro (ex.: DU PREVENTIVO) a lista
-- vinha vazia e não havia como pagá-lo — e, se o executante já tivesse sido
-- pago antes de a regra do terceiro existir, a parte dele ficava presa.
--
-- Esta função paga SÓ a parte do terceiro, num lançamento de despesa próprio,
-- sem tocar no repasse do executante. As travas são as mesmas do pagamento do
-- executante: o dia do atendimento já chegou, a ficha não está cancelada nem
-- como falta, e o índice único de fin_repasse_terceiro impede pagar o mesmo
-- terceiro duas vezes pelo mesmo atendimento (erro 23505 desfaz tudo).
--
-- _itens: [{ origem:'agenda'|'manual', id, valor, percentual, data }]
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.pagar_repasse_terceiro(
  _clinica_id uuid,
  _terceiro_id uuid,
  _terceiro_nome text,
  _itens jsonb,
  _total numeric,
  _data date,
  _forma_pagamento text,
  _conta_id uuid,
  _criado_por uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public'
AS $$
DECLARE
  v_item jsonb;
  v_origem text;
  v_ref uuid;
  v_valor numeric;
  v_soma numeric := 0;
  v_qtd integer := 0;
  v_total numeric := round(COALESCE(_total, 0), 2);
  v_nome text := COALESCE(NULLIF(btrim(_terceiro_nome), ''), 'Terceiro');
  v_executante uuid;
  v_ok boolean;
  v_lanc uuid;
  v_categoria_id uuid;
BEGIN
  IF NOT public.is_member(auth.uid(), _clinica_id) THEN
    RAISE EXCEPTION 'Sem permissão nesta clínica.' USING errcode = '42501';
  END IF;
  IF _terceiro_id IS NULL THEN
    RAISE EXCEPTION 'Repasse de terceiro sem médico informado.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM medicos m WHERE m.id = _terceiro_id AND m.clinica_id = _clinica_id
  ) THEN
    RAISE EXCEPTION 'O médico terceiro informado não pertence a esta clínica.'
      USING errcode = '42501';
  END IF;
  IF v_total <= 0 THEN
    RAISE EXCEPTION 'Valor do repasse deve ser maior que zero.';
  END IF;

  -- 1) Confere cada atendimento antes de gravar qualquer coisa.
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(_itens, '[]'::jsonb))
  LOOP
    v_origem := v_item->>'origem';
    v_ref := NULLIF(v_item->>'id','')::uuid;
    v_valor := round(COALESCE((v_item->>'valor')::numeric, 0), 2);
    CONTINUE WHEN v_valor <= 0;
    IF v_ref IS NULL THEN
      RAISE EXCEPTION 'Repasse de terceiro com atendimento sem identificação.';
    END IF;

    IF v_origem = 'agenda' THEN
      SELECT COALESCE(fl.medico_id, ag.medico_id),
             fl.clinica_id = _clinica_id
             AND fl.tipo = 'receita'
             AND fl.status = 'confirmado'
             AND ag.id IS NOT NULL
             AND ag.status NOT IN ('cancelado'::agendamento_status, 'faltou'::agendamento_status)
             AND ag.inicio::date <= current_date
             AND ag.inicio::date <= _data
        INTO v_executante, v_ok
        FROM fin_lancamentos fl
        LEFT JOIN agendamentos ag ON ag.id = fl.agendamento_id
       WHERE fl.id = v_ref;
    ELSIF v_origem = 'manual' THEN
      SELECT fa.medico_id,
             fa.clinica_id = _clinica_id
             AND fa.status <> 'cancelado'
             AND fa.data <= current_date
             AND fa.data <= _data
        INTO v_executante, v_ok
        FROM fin_atendimentos fa
       WHERE fa.id = v_ref;
    ELSE
      RAISE EXCEPTION 'Origem inválida no repasse de terceiro: %', COALESCE(v_origem,'(nula)');
    END IF;

    IF NOT FOUND OR NOT COALESCE(v_ok, false) THEN
      RAISE EXCEPTION 'Um ou mais atendimentos ainda não estão liberados para repasse. O repasse só pode ser pago no dia marcado do atendimento ou depois, e a ficha não pode estar cancelada nem como falta.'
        USING errcode = '23514';
    END IF;
    IF v_executante = _terceiro_id THEN
      RAISE EXCEPTION 'O terceiro não pode ser o próprio médico executante.'
        USING errcode = '23514';
    END IF;

    v_soma := v_soma + v_valor;
    v_qtd := v_qtd + 1;
  END LOOP;

  IF v_qtd = 0 THEN
    RAISE EXCEPTION 'Nenhum atendimento informado para pagamento de repasse.';
  END IF;
  IF abs(v_soma - v_total) > 0.05 THEN
    RAISE EXCEPTION 'Soma dos repasses de terceiro (R$ %) não confere com o total informado (R$ %).',
      v_soma, v_total USING errcode = '23514';
  END IF;

  -- 2) Despesa própria do terceiro, na mesma categoria do repasse médico.
  SELECT c.id
    INTO v_categoria_id
    FROM fin_categorias c
   WHERE c.clinica_id = _clinica_id
     AND c.tipo::text = 'despesa'
     AND c.ativo = true
     AND upper(public.strip_accents(c.nome)) = 'REPASSE MEDICO'
   ORDER BY c.created_at
   LIMIT 1;

  INSERT INTO fin_lancamentos (
    clinica_id, tipo, descricao, valor, data, data_vencimento,
    status, medico_id, conta_id, forma_pagamento, criado_por, categoria_id
  ) VALUES (
    _clinica_id, 'despesa',
    'Repasse terceiro — ' || v_nome || ' (' || v_qtd || ' atend.)',
    v_total, _data, _data,
    'confirmado', _terceiro_id, _conta_id, _forma_pagamento, _criado_por, v_categoria_id
  )
  RETURNING id INTO v_lanc;

  -- 3) Livro-caixa do terceiro. O índice único trava o pagamento em dobro.
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(_itens, '[]'::jsonb))
  LOOP
    v_origem := v_item->>'origem';
    v_ref := NULLIF(v_item->>'id','')::uuid;
    v_valor := round(COALESCE((v_item->>'valor')::numeric, 0), 2);
    CONTINUE WHEN v_valor <= 0;

    IF v_origem = 'agenda' THEN
      SELECT COALESCE(fl.medico_id, ag.medico_id) INTO v_executante
        FROM fin_lancamentos fl
        LEFT JOIN agendamentos ag ON ag.id = fl.agendamento_id
       WHERE fl.id = v_ref;
    ELSE
      SELECT fa.medico_id INTO v_executante FROM fin_atendimentos fa WHERE fa.id = v_ref;
    END IF;

    INSERT INTO fin_repasse_terceiro (
      clinica_id, origem,
      lancamento_id, atendimento_id,
      executante_medico_id, terceiro_medico_id,
      percentual, valor, data,
      repasse_pago, repasse_pago_em, repasse_pago_at,
      repasse_forma_pagamento, repasse_conta_id, repasse_pago_por,
      repasse_lancamento_id
    ) VALUES (
      _clinica_id, v_origem,
      CASE WHEN v_origem = 'agenda' THEN v_ref END,
      CASE WHEN v_origem = 'manual' THEN v_ref END,
      v_executante, _terceiro_id,
      NULLIF(v_item->>'percentual','')::numeric, v_valor,
      COALESCE(NULLIF(v_item->>'data','')::date, _data),
      true, _data, now(),
      _forma_pagamento, _conta_id, _criado_por,
      v_lanc
    );
  END LOOP;

  RETURN jsonb_build_object('lancamento_id', v_lanc, 'total', v_total, 'qtd', v_qtd);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.pagar_repasse_terceiro(uuid,uuid,text,jsonb,numeric,date,text,uuid,uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.pagar_repasse_terceiro(uuid,uuid,text,jsonb,numeric,date,text,uuid,uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.pagar_repasse_terceiro(uuid,uuid,text,jsonb,numeric,date,text,uuid,uuid) TO authenticated;
