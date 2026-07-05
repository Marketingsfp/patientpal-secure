
-- =====================================================================
-- MIGRAÇÃO C — RPCs de conversão + NFS-e configurável
-- Arquitetura: todas as decisões consultam fn_regras_procedimento.
-- Zero hard-code por tipo/nome de procedimento.
-- =====================================================================

-- ---------- 1. Schema: nfse_modo_emissao + nfse.orcamento_id ----------

ALTER TABLE public.clinicas
  ADD COLUMN IF NOT EXISTS nfse_modo_emissao text NOT NULL DEFAULT 'por_item'
    CHECK (nfse_modo_emissao IN ('por_item','agrupada'));

ALTER TABLE public.nfse
  ADD COLUMN IF NOT EXISTS orcamento_id uuid NULL REFERENCES public.orcamentos(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nfse_orcamento ON public.nfse(orcamento_id) WHERE orcamento_id IS NOT NULL;

-- ---------- 2. RPC: get_orcamento_conversao ----------

CREATE OR REPLACE FUNCTION public.get_orcamento_conversao(p_orcamento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_orc record;
  v_caixa_aberto boolean;
  v_itens jsonb;
BEGIN
  SELECT * INTO v_orc FROM public.orcamentos WHERE id = p_orcamento_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ORCAMENTO_NAO_ENCONTRADO');
  END IF;

  IF NOT public.is_member(auth.uid(), v_orc.clinica_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SEM_ACESSO');
  END IF;

  SELECT EXISTS(
    SELECT 1 FROM public.caixa_sessoes
    WHERE clinica_id = v_orc.clinica_id AND user_id = auth.uid() AND status = 'aberto'
  ) INTO v_caixa_aberto;

  SELECT COALESCE(jsonb_agg(row_to_json(x) ORDER BY x.ordem), '[]'::jsonb) INTO v_itens
  FROM (
    SELECT
      i.id,
      i.ordem,
      i.descricao,
      i.procedimento_id,
      i.quantidade,
      i.valor_total,
      i.status_operacional,
      i.status_financeiro,
      i.pago_em,
      i.agendado_em,
      i.cancelado_em,
      i.motivo_nao_aplicavel,
      CASE WHEN i.procedimento_id IS NULL THEN NULL
           ELSE public.fn_regras_procedimento(i.procedimento_id, NULL)
      END AS regras,
      (i.agendamento_id IS NOT NULL) AS tem_agendamento,
      (i.fin_atendimento_id IS NOT NULL) AS tem_pagamento,
      i.agendamento_id,
      i.fin_atendimento_id,
      -- regra inválida = sem procedimento OU sem fluxo_atendimento configurado
      (i.procedimento_id IS NULL OR
        COALESCE((public.fn_regras_procedimento(i.procedimento_id, NULL)->>'fluxo_atendimento') IS NULL, true)
      ) AS regra_invalida,
      -- ações disponíveis
      (
        SELECT jsonb_agg(a) FROM (
          SELECT unnest(ARRAY[
            CASE WHEN i.status_operacional IN ('pendente','aguardando_agendamento')
                  AND i.procedimento_id IS NOT NULL
                 THEN 'agendar' END,
            CASE WHEN i.status_financeiro = 'pendente' AND (
                   COALESCE((public.fn_regras_procedimento(i.procedimento_id, NULL)->>'permite_venda_direta')::bool, false)
                   OR i.status_operacional = 'agendado'
                 )
                 THEN 'vender' END,
            CASE WHEN i.status_operacional NOT IN ('cancelado','nao_aplicavel')
                 THEN 'cancelar' END,
            CASE WHEN i.status_operacional NOT IN ('cancelado','concluido')
                 THEN 'marcar_nao_aplicavel' END
          ]) AS a
        ) t WHERE a IS NOT NULL
      ) AS acoes_disponiveis
    FROM public.orcamento_itens i
    WHERE i.orcamento_id = p_orcamento_id
  ) x;

  RETURN jsonb_build_object(
    'ok', true,
    'orcamento', jsonb_build_object(
      'id', v_orc.id, 'numero', v_orc.numero, 'status', v_orc.status,
      'clinica_id', v_orc.clinica_id, 'paciente_nome', v_orc.paciente_nome,
      'valor_total', v_orc.valor_total
    ),
    'caixa_aberto', v_caixa_aberto,
    'itens', v_itens
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_orcamento_conversao(uuid) TO authenticated;

-- ---------- 3. RPC: converter_item_venda ----------

CREATE OR REPLACE FUNCTION public.converter_item_venda(
  p_item_id uuid,
  p_caixa_sessao_id uuid,
  p_forma_pagamento text,
  p_desconto numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_orc record;
  v_regras jsonb;
  v_sessao record;
  v_valor numeric;
  v_fin_id uuid;
BEGIN
  SELECT i.*, o.clinica_id AS orc_clinica_id, o.paciente_id AS orc_paciente_id, o.medico_id AS orc_medico_id
    INTO v_item
  FROM public.orcamento_itens i
  JOIN public.orcamentos o ON o.id = i.orcamento_id
  WHERE i.id = p_item_id
  FOR UPDATE OF i;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'codigo', 'ITEM_NAO_ENCONTRADO'); END IF;
  IF NOT public.is_member(auth.uid(), v_item.orc_clinica_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SEM_ACESSO');
  END IF;

  IF v_item.status_financeiro = 'pago' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ITEM_JA_PAGO', 'fin_atendimento_id', v_item.fin_atendimento_id);
  END IF;
  IF v_item.status_operacional = 'cancelado' OR v_item.status_financeiro = 'estornado' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ITEM_INVALIDO');
  END IF;

  -- Regra: só permite venda se permite_venda_direta OU se já está agendado
  IF v_item.procedimento_id IS NOT NULL THEN
    v_regras := public.fn_regras_procedimento(v_item.procedimento_id, NULL);
    IF NOT COALESCE((v_regras->>'permite_venda_direta')::bool, false)
       AND v_item.status_operacional <> 'agendado' THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'VENDA_NAO_PERMITIDA',
        'mensagem', 'Procedimento não permite venda direta. Agende antes de cobrar.');
    END IF;
  END IF;

  -- Caixa aberto do usuário/clínica
  SELECT * INTO v_sessao FROM public.caixa_sessoes
   WHERE id = p_caixa_sessao_id AND status = 'aberto'
     AND clinica_id = v_item.orc_clinica_id AND user_id = auth.uid();
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'CAIXA_FECHADO');
  END IF;

  v_valor := GREATEST(COALESCE(v_item.valor_total,0) - COALESCE(p_desconto,0), 0);

  INSERT INTO public.fin_atendimentos(
    clinica_id, paciente_id, medico_id, data, procedimento,
    valor_total, valor_medico, valor_clinica,
    forma_pagamento, status, observacoes, orcamento_item_id
  ) VALUES (
    v_item.orc_clinica_id, v_item.orc_paciente_id, v_item.orc_medico_id, CURRENT_DATE, v_item.descricao,
    v_valor, 0, v_valor,
    p_forma_pagamento, 'realizado',
    'Venda via orçamento item ' || v_item.id::text, v_item.id
  )
  RETURNING id INTO v_fin_id;

  INSERT INTO public.caixa_movimentos(sessao_id, clinica_id, user_id, tipo, valor, descricao, forma_pagamento)
  VALUES (p_caixa_sessao_id, v_item.orc_clinica_id, auth.uid(), 'recebimento', v_valor,
          'Venda de item de orçamento ' || v_item.id::text, p_forma_pagamento);

  UPDATE public.orcamento_itens
     SET fin_atendimento_id = v_fin_id,
         status_financeiro = 'pago',
         pago_em = now(),
         status_fin_em = now()
   WHERE id = p_item_id;

  PERFORM public.log_action('orcamento_itens', p_item_id::text, 'UPDATE', v_item.orc_clinica_id,
    to_jsonb(v_item), jsonb_build_object('acao','converter_item_venda','fin_atendimento_id',v_fin_id,'valor',v_valor,'regras',v_regras));

  RETURN jsonb_build_object('ok', true, 'codigo', 'OK', 'fin_atendimento_id', v_fin_id, 'valor', v_valor);
END;
$$;

GRANT EXECUTE ON FUNCTION public.converter_item_venda(uuid, uuid, text, numeric) TO authenticated;

-- ---------- 4. RPC: converter_item_agendamento ----------

CREATE OR REPLACE FUNCTION public.converter_item_agendamento(
  p_item_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_orc record;
  v_regras jsonb;
  v_agenda_obrig boolean;
  v_medico_obrig boolean;
  v_sala_obrig boolean;
  v_equip_obrig boolean;
  v_inicio timestamptz;
  v_fim timestamptz;
  v_medico_id uuid;
  v_recurso_id uuid;
  v_sala text;
  v_agend_id uuid;
  v_tempo int;
BEGIN
  SELECT i.*, o.clinica_id AS orc_clinica_id, o.paciente_id AS orc_paciente_id, o.paciente_nome AS orc_paciente_nome
    INTO v_item
  FROM public.orcamento_itens i
  JOIN public.orcamentos o ON o.id = i.orcamento_id
  WHERE i.id = p_item_id
  FOR UPDATE OF i;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'codigo', 'ITEM_NAO_ENCONTRADO'); END IF;
  IF NOT public.is_member(auth.uid(), v_item.orc_clinica_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SEM_ACESSO');
  END IF;
  IF v_item.status_operacional = 'agendado' OR v_item.agendamento_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ITEM_JA_AGENDADO', 'agendamento_id', v_item.agendamento_id);
  END IF;
  IF v_item.status_operacional IN ('cancelado','concluido','em_atendimento') THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ITEM_INVALIDO');
  END IF;
  IF v_item.procedimento_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'REGRA_INVALIDA', 'mensagem','Item sem procedimento vinculado');
  END IF;

  v_regras := public.fn_regras_procedimento(v_item.procedimento_id, NULL);
  IF (v_regras->>'fluxo_atendimento') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'REGRA_INVALIDA',
      'mensagem','Procedimento sem fluxo_atendimento configurado. Ajuste em Regras do procedimento.');
  END IF;

  v_agenda_obrig := COALESCE((v_regras->>'agenda_obrigatoria')::bool, true);
  v_medico_obrig := COALESCE((v_regras->>'medico_obrigatorio')::bool, false);
  v_sala_obrig   := COALESCE((v_regras->>'sala_obrigatoria')::bool, false);
  v_equip_obrig  := COALESCE((v_regras->>'equipamento_obrigatorio')::bool, false);
  v_tempo        := COALESCE((v_regras->>'tempo_padrao_min')::int, 30);

  -- Sem agenda real: só marca aguardando_agendamento (fila)
  IF NOT v_agenda_obrig THEN
    UPDATE public.orcamento_itens
       SET status_operacional = 'aguardando_agendamento',
           agendado_em = now(),
           status_op_em = now()
     WHERE id = p_item_id;

    PERFORM public.log_action('orcamento_itens', p_item_id::text, 'UPDATE', v_item.orc_clinica_id,
      to_jsonb(v_item), jsonb_build_object('acao','converter_item_sem_agenda','regras',v_regras));

    RETURN jsonb_build_object('ok', true, 'codigo', 'OK', 'sem_agendamento_real', true,
      'fluxo_atendimento', v_regras->>'fluxo_atendimento');
  END IF;

  -- Com agenda real
  v_inicio    := (p_payload->>'inicio')::timestamptz;
  v_fim       := COALESCE((p_payload->>'fim')::timestamptz, v_inicio + make_interval(mins => v_tempo));
  v_medico_id := NULLIF(p_payload->>'medico_id','')::uuid;
  v_recurso_id:= NULLIF(p_payload->>'enfermagem_recurso_id','')::uuid;
  v_sala      := NULLIF(p_payload->>'sala','');

  IF v_inicio IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'INICIO_OBRIGATORIO');
  END IF;
  IF v_medico_obrig AND v_medico_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'MEDICO_OBRIGATORIO');
  END IF;
  IF v_equip_obrig AND v_recurso_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'EQUIPAMENTO_OBRIGATORIO');
  END IF;
  IF v_sala_obrig AND v_sala IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SALA_OBRIGATORIA');
  END IF;
  IF v_medico_id IS NULL AND v_recurso_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'RECURSO_INCOMPATIVEL',
      'mensagem','Informe médico ou recurso de enfermagem');
  END IF;

  INSERT INTO public.agendamentos(
    clinica_id, paciente_id, paciente_nome, medico_id, enfermagem_recurso_id,
    inicio, fim, procedimento, status, tipo_atendimento,
    observacoes, orcamento_id, orcamento_item_id, criado_por
  ) VALUES (
    v_item.orc_clinica_id, v_item.orc_paciente_id, v_item.orc_paciente_nome,
    v_medico_id, v_recurso_id,
    v_inicio, v_fim, v_item.descricao, 'agendado',
    COALESCE(NULLIF(p_payload->>'tipo_atendimento',''), 'particular'),
    COALESCE(p_payload->>'observacoes','') || CASE WHEN v_sala IS NOT NULL THEN E'\nSala: '||v_sala ELSE '' END,
    v_item.orcamento_id, p_item_id, auth.uid()
  ) RETURNING id INTO v_agend_id;

  UPDATE public.orcamento_itens
     SET agendamento_id = v_agend_id,
         status_operacional = 'agendado',
         agendado_em = now(),
         status_op_em = now()
   WHERE id = p_item_id;

  PERFORM public.log_action('orcamento_itens', p_item_id::text, 'UPDATE', v_item.orc_clinica_id,
    to_jsonb(v_item), jsonb_build_object('acao','converter_item_agendamento','agendamento_id',v_agend_id,'regras',v_regras));

  RETURN jsonb_build_object('ok', true, 'codigo', 'OK', 'agendamento_id', v_agend_id,
    'sem_agendamento_real', false, 'fluxo_atendimento', v_regras->>'fluxo_atendimento');
END;
$$;

GRANT EXECUTE ON FUNCTION public.converter_item_agendamento(uuid, jsonb) TO authenticated;

-- ---------- 5. RPC: marcar_item_nao_aplicavel ----------

CREATE OR REPLACE FUNCTION public.marcar_item_nao_aplicavel(
  p_item_id uuid,
  p_motivo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_clinica uuid;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'MOTIVO_OBRIGATORIO');
  END IF;

  SELECT i.*, o.clinica_id AS orc_clinica_id INTO v_item
  FROM public.orcamento_itens i
  JOIN public.orcamentos o ON o.id = i.orcamento_id
  WHERE i.id = p_item_id FOR UPDATE OF i;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'codigo', 'ITEM_NAO_ENCONTRADO'); END IF;
  v_clinica := v_item.orc_clinica_id;

  IF NOT (public.has_role(auth.uid(), v_clinica, 'admin'::app_role)
          OR public.has_role(auth.uid(), v_clinica, 'gestor'::app_role)) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SEM_PERMISSAO');
  END IF;

  UPDATE public.orcamento_itens
     SET status_operacional = 'nao_aplicavel',
         status_financeiro  = CASE WHEN status_financeiro = 'pago' THEN status_financeiro ELSE 'nao_aplicavel' END,
         motivo_nao_aplicavel = p_motivo,
         status_op_em = now(), status_fin_em = now()
   WHERE id = p_item_id;

  PERFORM public.log_action('orcamento_itens', p_item_id::text, 'UPDATE', v_clinica,
    to_jsonb(v_item), jsonb_build_object('acao','marcar_nao_aplicavel','motivo',p_motivo));

  RETURN jsonb_build_object('ok', true, 'codigo', 'OK');
END;
$$;

GRANT EXECUTE ON FUNCTION public.marcar_item_nao_aplicavel(uuid, text) TO authenticated;

-- ---------- 6. RPC: cancelar_item (cascata segura) ----------

CREATE OR REPLACE FUNCTION public.cancelar_item(
  p_item_id uuid,
  p_motivo text,
  p_confirmar_cascata boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_item record;
  v_clinica uuid;
  v_agend record;
  v_tem_pag boolean;
  v_is_admin boolean;
BEGIN
  IF p_motivo IS NULL OR btrim(p_motivo) = '' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'MOTIVO_OBRIGATORIO');
  END IF;

  SELECT i.*, o.clinica_id AS orc_clinica_id INTO v_item
  FROM public.orcamento_itens i
  JOIN public.orcamentos o ON o.id = i.orcamento_id
  WHERE i.id = p_item_id FOR UPDATE OF i;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'codigo', 'ITEM_NAO_ENCONTRADO'); END IF;
  v_clinica := v_item.orc_clinica_id;
  IF NOT public.is_member(auth.uid(), v_clinica) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SEM_ACESSO');
  END IF;

  IF v_item.status_operacional = 'cancelado' THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'ITEM_JA_CANCELADO');
  END IF;

  v_is_admin := public.has_role(auth.uid(), v_clinica, 'admin'::app_role)
             OR public.has_role(auth.uid(), v_clinica, 'gestor'::app_role);
  v_tem_pag  := v_item.fin_atendimento_id IS NOT NULL;

  IF v_item.agendamento_id IS NOT NULL THEN
    SELECT * INTO v_agend FROM public.agendamentos WHERE id = v_item.agendamento_id;
    IF v_agend.status IN ('realizado','confirmado') AND v_agend.executado_em IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'AGENDAMENTO_JA_REALIZADO',
        'mensagem','Agendamento já foi executado; cancelamento bloqueado.');
    END IF;
    IF NOT v_is_admin THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'SEM_PERMISSAO',
        'mensagem','Cancelamento com agendamento vinculado exige admin/gestor.');
    END IF;
    IF NOT p_confirmar_cascata THEN
      RETURN jsonb_build_object('ok', true, 'requer_confirmacao', true,
        'tem_agendamento', true, 'tem_pagamento', v_tem_pag,
        'agendamento_id', v_item.agendamento_id, 'fin_atendimento_id', v_item.fin_atendimento_id);
    END IF;
    UPDATE public.agendamentos SET status = 'cancelado' WHERE id = v_item.agendamento_id;
  ELSIF v_tem_pag AND NOT v_is_admin THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SEM_PERMISSAO',
      'mensagem','Item com pagamento — cancelamento exige admin/gestor.');
  ELSIF v_tem_pag AND NOT p_confirmar_cascata THEN
    RETURN jsonb_build_object('ok', true, 'requer_confirmacao', true,
      'tem_agendamento', false, 'tem_pagamento', true,
      'fin_atendimento_id', v_item.fin_atendimento_id);
  END IF;

  UPDATE public.orcamento_itens
     SET status_operacional = 'cancelado',
         cancelado_em = now(), status_op_em = now(),
         motivo_nao_aplicavel = p_motivo
   WHERE id = p_item_id;

  PERFORM public.log_action('orcamento_itens', p_item_id::text, 'UPDATE', v_clinica,
    to_jsonb(v_item), jsonb_build_object(
      'acao','cancelar_item','motivo',p_motivo,
      'agendamento_cancelado', v_item.agendamento_id,
      'aviso_pagamento', v_tem_pag));

  RETURN jsonb_build_object('ok', true, 'codigo', 'OK',
    'aviso_pagamento', v_tem_pag,
    'fin_atendimento_id', v_item.fin_atendimento_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cancelar_item(uuid, text, boolean) TO authenticated;

-- ---------- 7. RPC: emitir_nfse_orcamento ----------

CREATE OR REPLACE FUNCTION public.emitir_nfse_orcamento(p_orcamento_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_orc record;
  v_modo text;
  v_valor numeric := 0;
  v_desc text := '';
  v_itens_ids uuid[];
  v_pendentes int;
  v_ja_emitidos int;
  v_nfse_id uuid;
  v_itens_json jsonb;
BEGIN
  SELECT * INTO v_orc FROM public.orcamentos WHERE id = p_orcamento_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'codigo', 'ORCAMENTO_NAO_ENCONTRADO'); END IF;
  IF NOT public.is_member(auth.uid(), v_orc.clinica_id) THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'SEM_ACESSO');
  END IF;

  SELECT nfse_modo_emissao INTO v_modo FROM public.clinicas WHERE id = v_orc.clinica_id;

  -- Universo: fin_atendimentos vinculados a itens deste orçamento
  SELECT COALESCE(array_agg(fa.id ORDER BY fa.created_at), '{}')::uuid[],
         COALESCE(SUM(fa.valor_total),0),
         string_agg(fa.procedimento, E'\n' ORDER BY fa.created_at),
         COUNT(*) FILTER (WHERE fa.nfse_id IS NOT NULL)
    INTO v_itens_ids, v_valor, v_desc, v_ja_emitidos
  FROM public.fin_atendimentos fa
  JOIN public.orcamento_itens oi ON oi.id = fa.orcamento_item_id
  WHERE oi.orcamento_id = p_orcamento_id;

  IF v_itens_ids IS NULL OR array_length(v_itens_ids,1) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'NFSE_SEM_ATENDIMENTOS');
  END IF;
  IF v_ja_emitidos > 0 THEN
    RETURN jsonb_build_object('ok', false, 'codigo', 'NFSE_JA_EMITIDA',
      'mensagem','Já existe NFS-e vinculada a atendimentos deste orçamento.');
  END IF;

  -- Itens em aberto (sem fin_atendimento_id e não cancelados/N/A) impedem agrupada
  IF v_modo = 'agrupada' THEN
    SELECT COUNT(*) INTO v_pendentes FROM public.orcamento_itens
     WHERE orcamento_id = p_orcamento_id
       AND status_financeiro NOT IN ('pago','nao_aplicavel','isento')
       AND status_operacional <> 'cancelado';
    IF v_pendentes > 0 THEN
      RETURN jsonb_build_object('ok', false, 'codigo', 'NFSE_ITENS_PENDENTES',
        'mensagem','Existem itens sem pagamento — não é possível emitir NFS-e agrupada.');
    END IF;

    SELECT jsonb_agg(jsonb_build_object(
             'fin_atendimento_id', fa.id,
             'descricao', fa.procedimento,
             'valor', fa.valor_total)
           ORDER BY fa.created_at)
      INTO v_itens_json
    FROM public.fin_atendimentos fa
    WHERE fa.id = ANY(v_itens_ids);

    INSERT INTO public.nfse(
      clinica_id, paciente_id, medico_id, data_emissao,
      valor_servicos, descricao_servicos, status,
      observacoes, orcamento_id, payload_envio, emitida_por
    ) VALUES (
      v_orc.clinica_id, v_orc.paciente_id, v_orc.medico_id, CURRENT_DATE,
      v_valor, v_desc, 'rascunho',
      'NFS-e agrupada — orçamento #'||v_orc.numero, p_orcamento_id,
      jsonb_build_object('modo','agrupada','itens',v_itens_json),
      auth.uid()
    ) RETURNING id INTO v_nfse_id;

    UPDATE public.fin_atendimentos SET nfse_id = v_nfse_id WHERE id = ANY(v_itens_ids);

    PERFORM public.log_action('nfse', v_nfse_id::text, 'INSERT', v_orc.clinica_id, NULL,
      jsonb_build_object('acao','emitir_nfse_orcamento_agrupada','orcamento_id',p_orcamento_id,
                         'valor',v_valor,'fin_ids',to_jsonb(v_itens_ids)));

    RETURN jsonb_build_object('ok', true, 'codigo', 'OK', 'modo', 'agrupada',
      'nfse_id', v_nfse_id, 'fin_atendimentos', to_jsonb(v_itens_ids));

  ELSE
    -- por_item: cria 1 rascunho de NFS-e por atendimento
    v_itens_json := '[]'::jsonb;
    FOR v_nfse_id IN
      WITH inserted AS (
        INSERT INTO public.nfse(
          clinica_id, paciente_id, medico_id, data_emissao,
          valor_servicos, descricao_servicos, status,
          observacoes, orcamento_id, emitida_por
        )
        SELECT fa.clinica_id, fa.paciente_id, fa.medico_id, CURRENT_DATE,
               fa.valor_total, fa.procedimento, 'rascunho',
               'NFS-e por item — orçamento #'||v_orc.numero, p_orcamento_id, auth.uid()
        FROM public.fin_atendimentos fa
        WHERE fa.id = ANY(v_itens_ids)
        RETURNING id, (SELECT fa2.id FROM public.fin_atendimentos fa2
                       WHERE fa2.clinica_id = nfse.clinica_id
                         AND fa2.orcamento_item_id IN (SELECT id FROM public.orcamento_itens WHERE orcamento_id = p_orcamento_id)
                         AND fa2.nfse_id IS NULL LIMIT 1) AS fin_id
      )
      SELECT id FROM inserted
    LOOP
      NULL;
    END LOOP;

    -- Vincular cada nfse ao seu fin_atendimento correspondente
    UPDATE public.fin_atendimentos fa
       SET nfse_id = n.id
      FROM public.nfse n
     WHERE n.orcamento_id = p_orcamento_id
       AND fa.id = ANY(v_itens_ids)
       AND fa.nfse_id IS NULL
       AND n.valor_servicos = fa.valor_total
       AND n.descricao_servicos = fa.procedimento;

    PERFORM public.log_action('nfse', p_orcamento_id::text, 'INSERT', v_orc.clinica_id, NULL,
      jsonb_build_object('acao','emitir_nfse_orcamento_por_item','orcamento_id',p_orcamento_id,
                         'qtd',array_length(v_itens_ids,1)));

    RETURN jsonb_build_object('ok', true, 'codigo', 'OK', 'modo', 'por_item',
      'quantidade', array_length(v_itens_ids,1));
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.emitir_nfse_orcamento(uuid) TO authenticated;

-- =====================================================================
-- Fim da Migração C
-- =====================================================================
