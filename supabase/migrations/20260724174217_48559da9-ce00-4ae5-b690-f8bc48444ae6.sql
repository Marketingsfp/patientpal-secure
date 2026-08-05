
-- Regrava trocar_convenio_contrato com set_config no topo
CREATE OR REPLACE FUNCTION public.trocar_convenio_contrato(_contrato_id uuid, _convenio_novo_id uuid, _observacao text DEFAULT NULL::text, _dependentes jsonb DEFAULT '[]'::jsonb, _valor_mensal numeric DEFAULT NULL::numeric, _data_inicio date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contrato public.contratos_assinatura%ROWTYPE;
  v_convenio_novo public.cb_convenios%ROWTYPE;
  v_novo_id uuid;
  v_novo_numero int;
  v_num_parcelas int;
  v_dia_venc int;
  v_data_inicio date;
  v_data_ancora date;
  v_periodo_fim date;
  v_ano int;
  v_mes int;
  v_dia int;
  v_venc date;
  v_taxa_inclusao numeric;
  v_menor_neg int;
  v_dep jsonb;
  v_valor numeric(12,2);
  v_pendentes_canceladas int;
  i int;
BEGIN
  PERFORM set_config('app.actor_source', 'trocar_convenio_contrato', true);
  SELECT * INTO v_contrato FROM public.contratos_assinatura WHERE id = _contrato_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato nao encontrado'; END IF;
  IF NOT is_member(auth.uid(), v_contrato.clinica_id) THEN RAISE EXCEPTION 'Voce nao e membro desta clinica'; END IF;
  IF v_contrato.status = 'cancelado' OR v_contrato.cancelado_em IS NOT NULL THEN RAISE EXCEPTION 'Contrato ja esta cancelado'; END IF;
  SELECT * INTO v_convenio_novo FROM public.cb_convenios WHERE id = _convenio_novo_id AND clinica_id = v_contrato.clinica_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convenio novo invalido'; END IF;
  v_num_parcelas := COALESCE(NULLIF(v_convenio_novo.num_parcelas, 0), 12);
  v_dia_venc := COALESCE(v_contrato.dia_vencimento, 10);
  v_data_inicio := COALESCE(_data_inicio, CURRENT_DATE);
  v_taxa_inclusao := COALESCE(v_convenio_novo.taxa_inclusao_dependente, 0);
  v_valor := COALESCE(_valor_mensal, v_convenio_novo.valor_mensal);
  v_novo_numero := COALESCE((SELECT MAX(numero) + 1 FROM public.contratos_assinatura WHERE clinica_id = v_contrato.clinica_id), 1);
  INSERT INTO public.contratos_assinatura (clinica_id, plano_id, paciente_id, paciente_nome, data_inicio, dia_vencimento, valor_mensal, taxa_adesao, num_parcelas, forma_pagamento, status, convenio_id, contrato_origem_id, titular_apenas_financeiro, numero, criado_por)
  VALUES (v_contrato.clinica_id, v_contrato.plano_id, v_contrato.paciente_id, v_contrato.paciente_nome, v_data_inicio, v_dia_venc, v_valor, 0, v_num_parcelas, v_contrato.forma_pagamento, 'ativo', _convenio_novo_id, _contrato_id, v_contrato.titular_apenas_financeiro, v_novo_numero, auth.uid())
  RETURNING id INTO v_novo_id;
  IF EXTRACT(DAY FROM v_data_inicio)::int <= v_dia_venc THEN
    v_ano := EXTRACT(YEAR FROM v_data_inicio)::int; v_mes := EXTRACT(MONTH FROM v_data_inicio)::int;
  ELSE
    v_ano := EXTRACT(YEAR FROM (v_data_inicio + INTERVAL '1 month'))::int; v_mes := EXTRACT(MONTH FROM (v_data_inicio + INTERVAL '1 month'))::int;
  END IF;
  v_dia := LEAST(v_dia_venc, EXTRACT(DAY FROM (date_trunc('month', make_date(v_ano, v_mes, 1)) + INTERVAL '1 month - 1 day'))::int);
  v_data_ancora := make_date(v_ano, v_mes, v_dia);
  FOR i IN 0 .. v_num_parcelas - 1 LOOP
    v_ano := EXTRACT(YEAR FROM (v_data_ancora + (i || ' month')::interval))::int;
    v_mes := EXTRACT(MONTH FROM (v_data_ancora + (i || ' month')::interval))::int;
    v_dia := LEAST(v_dia_venc, EXTRACT(DAY FROM (date_trunc('month', make_date(v_ano, v_mes, 1)) + INTERVAL '1 month - 1 day'))::int);
    v_venc := make_date(v_ano, v_mes, v_dia);
    INSERT INTO public.contrato_mensalidades (contrato_id, clinica_id, numero_parcela, vencimento, valor, status)
    VALUES (v_novo_id, v_contrato.clinica_id, i + 1, v_venc, v_valor, 'pendente');
    v_periodo_fim := v_venc;
  END LOOP;
  UPDATE public.contratos_assinatura SET data_fim = v_periodo_fim, updated_at = now() WHERE id = v_novo_id;
  IF jsonb_typeof(_dependentes) = 'array' THEN
    v_menor_neg := 0;
    FOR v_dep IN SELECT * FROM jsonb_array_elements(_dependentes) LOOP
      IF NULLIF(v_dep->>'id','') IS NULL OR COALESCE((v_dep->>'manter')::boolean, true) THEN
        INSERT INTO public.contrato_dependentes (contrato_id, paciente_id, paciente_nome, parentesco, tipo, incluido_em, ativo)
        VALUES (v_novo_id, NULLIF(v_dep->>'paciente_id','')::uuid, v_dep->>'paciente_nome', NULLIF(v_dep->>'parentesco',''), COALESCE(NULLIF(v_dep->>'tipo',''), 'dependente'), v_data_inicio, true);
        IF NULLIF(v_dep->>'id','') IS NULL AND COALESCE((v_dep->>'cobrar_taxa_inclusao')::boolean, false) AND v_taxa_inclusao > 0 THEN
          v_menor_neg := v_menor_neg - 1;
          INSERT INTO public.contrato_mensalidades (contrato_id, clinica_id, numero_parcela, vencimento, valor, status, observacoes)
          VALUES (v_novo_id, v_contrato.clinica_id, v_menor_neg, v_data_inicio, v_taxa_inclusao, 'pendente', 'Taxa de inclusao de dependente: ' || COALESCE(v_dep->>'paciente_nome',''));
        END IF;
      END IF;
    END LOOP;
  END IF;
  UPDATE public.contrato_mensalidades SET status = 'cancelado', observacoes = COALESCE(observacoes,'') || ' [cancelado por troca de convenio]'
   WHERE contrato_id = _contrato_id AND status = 'pendente' AND numero_parcela > 0;
  GET DIAGNOSTICS v_pendentes_canceladas = ROW_COUNT;
  UPDATE public.contratos_assinatura SET status = 'cancelado', cancelado_em = v_data_inicio, cancelamento_motivo = COALESCE('Troca de convenio: ' || _observacao, 'Troca de convenio'), updated_at = now()
   WHERE id = _contrato_id;
  INSERT INTO public.contrato_renovacoes (clinica_id, contrato_id, contrato_novo_id, tipo, convenio_anterior_id, convenio_novo_id, valor_anterior, valor_novo, parcelas_geradas, periodo_inicio, periodo_fim, observacao, usuario_id)
  VALUES (v_contrato.clinica_id, _contrato_id, v_novo_id, 'troca_convenio', v_contrato.convenio_id, _convenio_novo_id, COALESCE(v_contrato.valor_mensal, 0), v_valor, v_num_parcelas, v_data_inicio, v_periodo_fim, _observacao, auth.uid());
  RETURN jsonb_build_object('contrato_novo_id', v_novo_id, 'contrato_novo_numero', v_novo_numero, 'periodo_inicio', v_data_inicio, 'periodo_fim', v_periodo_fim, 'parcelas_geradas', v_num_parcelas, 'pendentes_canceladas', v_pendentes_canceladas);
END;
$function$;

-- Regrava estornar_sangria com set_config no topo
CREATE OR REPLACE FUNCTION public.estornar_sangria(_movimento_id uuid, _clinica_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mov              public.caixa_movimentos%ROWTYPE;
  v_sessao_status    text;
  v_sessao_alvo      uuid;
  v_aviso            text := NULL;
  v_user             uuid := auth.uid();
  v_novo_id          uuid;
  v_ja_estornado     boolean;
  v_desc_estorno     text;
BEGIN
  PERFORM set_config('app.actor_source', 'estornar_sangria', true);
  IF v_user IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  SELECT * INTO v_mov FROM public.caixa_movimentos WHERE id = _movimento_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrado', 'mensagem', 'Movimento de caixa não encontrado.'); END IF;
  IF _clinica_id IS NOT NULL AND v_mov.clinica_id <> _clinica_id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'clinica_divergente', 'mensagem', 'Movimento pertence a outra clínica.');
  END IF;
  IF v_mov.tipo <> 'sangria' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tipo_invalido', 'mensagem', 'Este movimento não é uma sangria.');
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.caixa_movimentos WHERE tipo = 'suprimento' AND clinica_id = v_mov.clinica_id AND descricao LIKE ('[ESTORNO DE SANGRIA #' || v_mov.id::text || ']%')) INTO v_ja_estornado;
  IF v_ja_estornado THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_estornado', 'mensagem', 'Esta sangria já foi estornada anteriormente.');
  END IF;
  SELECT status INTO v_sessao_status FROM public.caixa_sessoes WHERE id = v_mov.sessao_id;
  IF v_sessao_status = 'aberto' THEN
    v_sessao_alvo := v_mov.sessao_id;
  ELSE
    SELECT id INTO v_sessao_alvo FROM public.caixa_sessoes WHERE clinica_id = v_mov.clinica_id AND user_id = v_user AND status = 'aberto' ORDER BY aberto_em DESC LIMIT 1;
    IF v_sessao_alvo IS NULL THEN
      SELECT id INTO v_sessao_alvo FROM public.caixa_sessoes WHERE clinica_id = v_mov.clinica_id AND status = 'aberto' ORDER BY aberto_em DESC LIMIT 1;
    END IF;
    IF v_sessao_alvo IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'sem_sessao_aberta', 'mensagem', 'Sessão original fechada e não há caixa aberto para lançar a compensação. Abra um caixa e tente novamente.');
    END IF;
    v_aviso := 'lancado_em_sessao_atual';
  END IF;
  v_desc_estorno := '[ESTORNO DE SANGRIA #' || v_mov.id::text || '] ' || COALESCE(v_mov.descricao, 'Sangria');
  INSERT INTO public.caixa_movimentos (sessao_id, clinica_id, user_id, tipo, valor, descricao, forma_pagamento, destino_user_id, destino_nome)
  VALUES (v_sessao_alvo, v_mov.clinica_id, v_user, 'suprimento', v_mov.valor, v_desc_estorno, v_mov.forma_pagamento, v_mov.destino_user_id, v_mov.destino_nome)
  RETURNING id INTO v_novo_id;
  BEGIN
    INSERT INTO public.audit_log (clinica_id, user_id, action, table_name, record_id, dados_antes, dados_depois)
    VALUES (v_mov.clinica_id, v_user, 'ESTORNO_SANGRIA', 'caixa_movimentos', v_mov.id::text, to_jsonb(v_mov), jsonb_build_object('novo_movimento_id', v_novo_id, 'sessao_alvo', v_sessao_alvo));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object('ok', true, 'novo_movimento_id', v_novo_id, 'sessao_alvo', v_sessao_alvo, 'aviso', v_aviso);
END;
$function$;
