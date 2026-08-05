
CREATE OR REPLACE FUNCTION public.renovar_contrato_extensao(
  _contrato_id uuid,
  _observacao text DEFAULT NULL::text,
  _dependentes jsonb DEFAULT '[]'::jsonb,
  _valor_mensal numeric DEFAULT NULL::numeric,
  _data_renovacao date DEFAULT NULL::date
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_contrato public.contratos_assinatura%ROWTYPE;
  v_convenio public.cb_convenios%ROWTYPE;
  v_pagas int;
  v_max int;
  v_novo_valor numeric(12,2);
  v_num_parcelas int;
  v_prox int;
  v_dia_venc int;
  v_data_ancora date;
  v_periodo_inicio date;
  v_periodo_fim date;
  i int;
  v_venc date;
  v_ano int;
  v_mes int;
  v_dia int;
  v_dep jsonb;
  v_dep_id uuid;
  v_taxa_inclusao numeric;
  v_menor_neg int;
  v_data_ren date;
BEGIN
  SELECT * INTO v_contrato FROM public.contratos_assinatura WHERE id = _contrato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato nao encontrado';
  END IF;

  IF NOT is_member(auth.uid(), v_contrato.clinica_id) THEN
    RAISE EXCEPTION 'Voce nao e membro desta clinica';
  END IF;

  IF v_contrato.cancelado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Contrato cancelado nao pode ser renovado';
  END IF;

  IF v_contrato.convenio_id IS NULL THEN
    RAISE EXCEPTION 'Contrato sem convenio vinculado';
  END IF;

  SELECT COUNT(*) FILTER (WHERE status = 'pago'), COUNT(*)
    INTO v_pagas, v_max
    FROM public.contrato_mensalidades
   WHERE contrato_id = _contrato_id
     AND numero_parcela > 0;

  IF v_max = 0 OR v_pagas < v_max THEN
    RAISE EXCEPTION 'So e possivel renovar quando todas as mensalidades estiverem pagas (pagas: % de %)', v_pagas, v_max;
  END IF;

  SELECT * INTO v_convenio FROM public.cb_convenios WHERE id = v_contrato.convenio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convenio do contrato nao encontrado';
  END IF;

  v_novo_valor := COALESCE(_valor_mensal, v_convenio.valor_mensal);
  v_num_parcelas := COALESCE(NULLIF(v_convenio.num_parcelas, 0), 12);
  v_taxa_inclusao := COALESCE(v_convenio.taxa_inclusao_dependente, 0);
  v_data_ren := COALESCE(_data_renovacao, CURRENT_DATE);

  SELECT MAX(numero_parcela)
    INTO v_prox
    FROM public.contrato_mensalidades
   WHERE contrato_id = _contrato_id
     AND numero_parcela > 0;

  v_prox := COALESCE(v_prox, 0) + 1;
  v_dia_venc := COALESCE(v_contrato.dia_vencimento, EXTRACT(DAY FROM v_data_ren)::int, 10);
  v_periodo_inicio := v_data_ren;

  -- Ancora = 1o vencimento apos v_data_ren.
  -- Se o dia do venc no mes de v_data_ren ainda nao passou, ancora fica nesse mes.
  -- Senao, avanca para o mes seguinte.
  IF EXTRACT(DAY FROM v_data_ren)::int <= v_dia_venc THEN
    v_ano := EXTRACT(YEAR FROM v_data_ren)::int;
    v_mes := EXTRACT(MONTH FROM v_data_ren)::int;
  ELSE
    v_ano := EXTRACT(YEAR FROM (v_data_ren + INTERVAL '1 month'))::int;
    v_mes := EXTRACT(MONTH FROM (v_data_ren + INTERVAL '1 month'))::int;
  END IF;
  v_dia := LEAST(v_dia_venc, EXTRACT(DAY FROM (date_trunc('month', make_date(v_ano, v_mes, 1)) + INTERVAL '1 month - 1 day'))::int);
  v_data_ancora := make_date(v_ano, v_mes, v_dia);

  FOR i IN 0 .. v_num_parcelas - 1 LOOP
    v_ano := EXTRACT(YEAR FROM (v_data_ancora + (i || ' month')::interval))::int;
    v_mes := EXTRACT(MONTH FROM (v_data_ancora + (i || ' month')::interval))::int;
    v_dia := LEAST(v_dia_venc, EXTRACT(DAY FROM (date_trunc('month', make_date(v_ano, v_mes, 1)) + INTERVAL '1 month - 1 day'))::int);
    v_venc := make_date(v_ano, v_mes, v_dia);

    INSERT INTO public.contrato_mensalidades (contrato_id, clinica_id, numero_parcela, vencimento, valor, status)
    VALUES (_contrato_id, v_contrato.clinica_id, v_prox + i, v_venc, v_novo_valor, 'pendente');
    v_periodo_fim := v_venc;
  END LOOP;

  IF jsonb_typeof(_dependentes) = 'array' THEN
    SELECT COALESCE(MIN(numero_parcela), 0)
      INTO v_menor_neg
      FROM public.contrato_mensalidades
     WHERE contrato_id = _contrato_id
       AND numero_parcela < 0;

    FOR v_dep IN SELECT * FROM jsonb_array_elements(_dependentes) LOOP
      v_dep_id := NULLIF(v_dep->>'id','')::uuid;

      IF v_dep_id IS NOT NULL THEN
        IF COALESCE((v_dep->>'manter')::boolean, true) THEN
          UPDATE public.contrato_dependentes
             SET paciente_id = COALESCE(NULLIF(v_dep->>'paciente_id','')::uuid, paciente_id),
                 paciente_nome = COALESCE(NULLIF(v_dep->>'paciente_nome',''), paciente_nome),
                 parentesco = NULLIF(v_dep->>'parentesco',''),
                 tipo = COALESCE(NULLIF(v_dep->>'tipo',''), tipo)
           WHERE id = v_dep_id
             AND contrato_id = _contrato_id;
        ELSE
          UPDATE public.contrato_dependentes
             SET ativo = false,
                 excluido_em = v_data_ren
           WHERE id = v_dep_id
             AND contrato_id = _contrato_id;
        END IF;
      ELSE
        INSERT INTO public.contrato_dependentes (
          contrato_id, paciente_id, paciente_nome, parentesco, tipo, incluido_em, ativo
        ) VALUES (
          _contrato_id,
          NULLIF(v_dep->>'paciente_id','')::uuid,
          v_dep->>'paciente_nome',
          NULLIF(v_dep->>'parentesco',''),
          COALESCE(NULLIF(v_dep->>'tipo',''), 'dependente'),
          v_data_ren,
          true
        );

        IF COALESCE((v_dep->>'cobrar_taxa_inclusao')::boolean, false) AND v_taxa_inclusao > 0 THEN
          v_menor_neg := v_menor_neg - 1;
          INSERT INTO public.contrato_mensalidades (
            contrato_id, clinica_id, numero_parcela, vencimento, valor, status, observacoes
          ) VALUES (
            _contrato_id, v_contrato.clinica_id, v_menor_neg, v_data_ren, v_taxa_inclusao, 'pendente',
            'Taxa de inclusao de dependente: ' || COALESCE(v_dep->>'paciente_nome','')
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.contratos_assinatura
     SET data_fim = v_periodo_fim,
         numero_renovacoes = COALESCE(numero_renovacoes, 0) + 1,
         updated_at = now()
   WHERE id = _contrato_id;

  INSERT INTO public.contrato_renovacoes (
    contrato_original_id, contrato_novo_id, tipo, periodo_inicio, periodo_fim,
    valor_mensal, num_parcelas, observacao, criado_por
  ) VALUES (
    _contrato_id, _contrato_id, 'extensao', v_periodo_inicio, v_periodo_fim,
    v_novo_valor, v_num_parcelas, _observacao, auth.uid()
  );

  RETURN jsonb_build_object(
    'contrato_id', _contrato_id,
    'periodo_inicio', v_periodo_inicio,
    'periodo_fim', v_periodo_fim,
    'parcelas_geradas', v_num_parcelas
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.trocar_convenio_contrato(
  _contrato_id uuid,
  _convenio_novo_id uuid,
  _observacao text DEFAULT NULL::text,
  _dependentes jsonb DEFAULT '[]'::jsonb,
  _valor_mensal numeric DEFAULT NULL::numeric,
  _data_inicio date DEFAULT NULL::date
)
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
  SELECT * INTO v_contrato FROM public.contratos_assinatura WHERE id = _contrato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato nao encontrado';
  END IF;

  IF NOT is_member(auth.uid(), v_contrato.clinica_id) THEN
    RAISE EXCEPTION 'Voce nao e membro desta clinica';
  END IF;

  IF v_contrato.status = 'cancelado' OR v_contrato.cancelado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Contrato ja esta cancelado';
  END IF;

  SELECT * INTO v_convenio_novo
    FROM public.cb_convenios
   WHERE id = _convenio_novo_id
     AND clinica_id = v_contrato.clinica_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convenio novo invalido';
  END IF;

  v_num_parcelas := COALESCE(NULLIF(v_convenio_novo.num_parcelas, 0), 12);
  v_dia_venc := COALESCE(v_contrato.dia_vencimento, 10);
  v_data_inicio := COALESCE(_data_inicio, CURRENT_DATE);
  v_taxa_inclusao := COALESCE(v_convenio_novo.taxa_inclusao_dependente, 0);
  v_valor := COALESCE(_valor_mensal, v_convenio_novo.valor_mensal);

  v_novo_numero := COALESCE(
    (SELECT MAX(numero) + 1 FROM public.contratos_assinatura WHERE clinica_id = v_contrato.clinica_id),
    1
  );

  INSERT INTO public.contratos_assinatura (
    clinica_id, plano_id, paciente_id, paciente_nome,
    data_inicio, dia_vencimento, valor_mensal, taxa_adesao,
    num_parcelas, forma_pagamento, status, convenio_id,
    contrato_origem_id, titular_apenas_financeiro,
    numero, criado_por
  ) VALUES (
    v_contrato.clinica_id,
    v_contrato.plano_id,
    v_contrato.paciente_id,
    v_contrato.paciente_nome,
    v_data_inicio,
    v_dia_venc,
    v_valor,
    0,
    v_num_parcelas,
    v_contrato.forma_pagamento,
    'ativo',
    _convenio_novo_id,
    _contrato_id,
    v_contrato.titular_apenas_financeiro,
    v_novo_numero,
    auth.uid()
  ) RETURNING id INTO v_novo_id;

  -- Ancora = 1o vencimento apos v_data_inicio (mesma regra da renovacao)
  IF EXTRACT(DAY FROM v_data_inicio)::int <= v_dia_venc THEN
    v_ano := EXTRACT(YEAR FROM v_data_inicio)::int;
    v_mes := EXTRACT(MONTH FROM v_data_inicio)::int;
  ELSE
    v_ano := EXTRACT(YEAR FROM (v_data_inicio + INTERVAL '1 month'))::int;
    v_mes := EXTRACT(MONTH FROM (v_data_inicio + INTERVAL '1 month'))::int;
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

  UPDATE public.contratos_assinatura
     SET data_fim = v_periodo_fim,
         updated_at = now()
   WHERE id = v_novo_id;

  IF jsonb_typeof(_dependentes) = 'array' THEN
    v_menor_neg := 0;
    FOR v_dep IN SELECT * FROM jsonb_array_elements(_dependentes) LOOP
      IF NULLIF(v_dep->>'id','') IS NULL OR COALESCE((v_dep->>'manter')::boolean, true) THEN
        INSERT INTO public.contrato_dependentes (
          contrato_id, paciente_id, paciente_nome, parentesco, tipo, incluido_em, ativo
        ) VALUES (
          v_novo_id,
          NULLIF(v_dep->>'paciente_id','')::uuid,
          v_dep->>'paciente_nome',
          NULLIF(v_dep->>'parentesco',''),
          COALESCE(NULLIF(v_dep->>'tipo',''), 'dependente'),
          v_data_inicio,
          true
        );

        IF NULLIF(v_dep->>'id','') IS NULL
           AND COALESCE((v_dep->>'cobrar_taxa_inclusao')::boolean, false)
           AND v_taxa_inclusao > 0 THEN
          v_menor_neg := v_menor_neg - 1;
          INSERT INTO public.contrato_mensalidades (
            contrato_id, clinica_id, numero_parcela, vencimento, valor, status, observacoes
          ) VALUES (
            v_novo_id, v_contrato.clinica_id, v_menor_neg, v_data_inicio, v_taxa_inclusao, 'pendente',
            'Taxa de inclusao de dependente: ' || COALESCE(v_dep->>'paciente_nome','')
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Cancela pendentes do contrato antigo e encerra
  UPDATE public.contrato_mensalidades
     SET status = 'cancelado',
         observacoes = COALESCE(observacoes,'') || ' [cancelado por troca de convenio]'
   WHERE contrato_id = _contrato_id
     AND status = 'pendente'
     AND numero_parcela > 0;
  GET DIAGNOSTICS v_pendentes_canceladas = ROW_COUNT;

  UPDATE public.contratos_assinatura
     SET status = 'cancelado',
         cancelado_em = v_data_inicio,
         cancelamento_motivo = COALESCE('Troca de convenio: ' || _observacao, 'Troca de convenio'),
         updated_at = now()
   WHERE id = _contrato_id;

  INSERT INTO public.contrato_renovacoes (
    contrato_original_id, contrato_novo_id, tipo, periodo_inicio, periodo_fim,
    valor_mensal, num_parcelas, observacao, criado_por
  ) VALUES (
    _contrato_id, v_novo_id, 'troca_convenio', v_data_inicio, v_periodo_fim,
    v_valor, v_num_parcelas, _observacao, auth.uid()
  );

  RETURN jsonb_build_object(
    'contrato_novo_id', v_novo_id,
    'contrato_novo_numero', v_novo_numero,
    'periodo_inicio', v_data_inicio,
    'periodo_fim', v_periodo_fim,
    'parcelas_geradas', v_num_parcelas,
    'pendentes_canceladas', v_pendentes_canceladas
  );
END;
$function$;
