CREATE OR REPLACE FUNCTION public.renovar_contrato_troca_plano(_contrato_id uuid, _convenio_novo_id uuid, _observacao text DEFAULT NULL::text, _cobrar_taxa_adesao boolean DEFAULT false, _dependentes jsonb DEFAULT '[]'::jsonb, _valor_mensal numeric DEFAULT NULL::numeric, _data_renovacao date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contrato public.contratos_assinatura%ROWTYPE;
  v_convenio_novo public.cb_convenios%ROWTYPE;
  v_pagas int;
  v_max int;
  v_novo_id uuid;
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
  i int;
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

  SELECT COUNT(*) FILTER (WHERE status = 'pago'), COUNT(*)
    INTO v_pagas, v_max
    FROM public.contrato_mensalidades
   WHERE contrato_id = _contrato_id
     AND numero_parcela > 0;

  IF v_max = 0 OR v_pagas < v_max THEN
    RAISE EXCEPTION 'So e possivel renovar quando todas as mensalidades estiverem pagas (pagas: % de %)', v_pagas, v_max;
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
  v_data_inicio := COALESCE(_data_renovacao, CURRENT_DATE);
  v_taxa_inclusao := COALESCE(v_convenio_novo.taxa_inclusao_dependente, 0);
  v_valor := COALESCE(_valor_mensal, v_convenio_novo.valor_mensal);

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
    COALESCE((SELECT MAX(numero) + 1 FROM public.contratos_assinatura WHERE clinica_id = v_contrato.clinica_id), 1),
    auth.uid()
  ) RETURNING id INTO v_novo_id;

  -- Ancora = 1o vencimento apos v_data_inicio.
  -- Se o dia do venc no mes de v_data_inicio ainda nao passou, ancora fica nesse mes.
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
            v_novo_id,
            v_contrato.clinica_id,
            v_menor_neg,
            v_data_inicio,
            v_taxa_inclusao,
            'pendente',
            'Taxa de inclusão de dependente — ' || COALESCE(v_dep->>'paciente_nome','')
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.contratos_assinatura
     SET status = 'renovado',
         renovado_em = v_data_inicio::timestamptz,
         numero_renovacoes = COALESCE(numero_renovacoes, 0) + 1,
         updated_at = now()
   WHERE id = _contrato_id;

  INSERT INTO public.contrato_renovacoes (
    clinica_id, contrato_id, contrato_novo_id, tipo,
    convenio_anterior_id, convenio_novo_id, valor_anterior, valor_novo,
    parcelas_geradas, periodo_inicio, periodo_fim, usuario_id, observacao,
    dependentes_incluidos
  ) VALUES (
    v_contrato.clinica_id,
    _contrato_id,
    v_novo_id,
    'troca_plano',
    v_contrato.convenio_id,
    _convenio_novo_id,
    v_contrato.valor_mensal,
    v_valor,
    v_num_parcelas,
    v_data_inicio,
    v_periodo_fim,
    auth.uid(),
    CASE WHEN _data_renovacao IS NOT NULL AND _data_renovacao <> CURRENT_DATE
         THEN COALESCE(_observacao || E'\n', '') || '[Renovação registrada com data informada: ' || to_char(v_data_inicio, 'DD/MM/YYYY') || ']'
         ELSE _observacao END,
    _dependentes
  );

  RETURN jsonb_build_object(
    'contrato_novo_id', v_novo_id,
    'parcelas_geradas', v_num_parcelas,
    'taxa_adesao', 0,
    'data_renovacao', v_data_inicio
  );
END;
$function$;