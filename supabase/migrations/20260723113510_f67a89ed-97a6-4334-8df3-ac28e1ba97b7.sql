CREATE OR REPLACE FUNCTION public.renovar_contrato_extensao(_contrato_id uuid, _observacao text DEFAULT NULL::text, _dependentes jsonb DEFAULT '[]'::jsonb, _valor_mensal numeric DEFAULT NULL::numeric, _data_renovacao date DEFAULT NULL::date)
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
    clinica_id, contrato_id, contrato_novo_id, tipo,
    convenio_anterior_id, convenio_novo_id,
    valor_anterior, valor_novo,
    parcelas_geradas, periodo_inicio, periodo_fim,
    usuario_id, observacao, dependentes_incluidos
  ) VALUES (
    v_contrato.clinica_id, _contrato_id, _contrato_id, 'extensao',
    v_contrato.convenio_id, v_contrato.convenio_id,
    v_contrato.valor_mensal, v_novo_valor,
    v_num_parcelas, v_periodo_inicio, v_periodo_fim,
    auth.uid(), _observacao, COALESCE(_dependentes, '[]'::jsonb)
  );

  RETURN jsonb_build_object(
    'contrato_id', _contrato_id,
    'periodo_inicio', v_periodo_inicio,
    'periodo_fim', v_periodo_fim,
    'parcelas_geradas', v_num_parcelas
  );
END;
$function$;