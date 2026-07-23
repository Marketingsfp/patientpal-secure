
CREATE OR REPLACE FUNCTION public.renovar_contrato_troca_plano(
  _contrato_id uuid,
  _convenio_novo_id uuid,
  _observacao text DEFAULT NULL,
  _dependentes_manter uuid[] DEFAULT NULL,
  _cobrar_taxa_adesao boolean DEFAULT true
)
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
  v_periodo_fim date;
  v_ano int; v_mes int; v_dia int; v_venc date;
  v_taxa numeric;
  i int;
BEGIN
  SELECT * INTO v_contrato FROM public.contratos_assinatura WHERE id = _contrato_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato nao encontrado'; END IF;

  IF NOT can_manage_clinica(auth.uid(), v_contrato.clinica_id) THEN
    RAISE EXCEPTION 'Sem permissao para renovar contratos desta clinica';
  END IF;

  IF v_contrato.status <> 'ativo' OR v_contrato.cancelado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Contrato nao esta ativo';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE status = 'pago'),
    COUNT(*)
  INTO v_pagas, v_max
  FROM public.contrato_mensalidades
  WHERE contrato_id = _contrato_id AND numero_parcela > 0;

  IF v_max = 0 OR v_pagas < v_max THEN
    RAISE EXCEPTION 'So e possivel renovar quando todas as mensalidades estiverem pagas';
  END IF;

  SELECT * INTO v_convenio_novo FROM public.cb_convenios WHERE id = _convenio_novo_id AND clinica_id = v_contrato.clinica_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convenio novo invalido'; END IF;

  v_num_parcelas := COALESCE(NULLIF(v_convenio_novo.num_parcelas, 0), 12);
  v_dia_venc := COALESCE(v_contrato.dia_vencimento, 10);
  v_data_inicio := CURRENT_DATE;
  v_taxa := COALESCE(v_convenio_novo.taxa_adesao, 0);

  INSERT INTO public.contratos_assinatura (
    clinica_id, plano_id, paciente_id, paciente_nome,
    data_inicio, dia_vencimento, valor_mensal, taxa_adesao,
    num_parcelas, forma_pagamento, status, convenio_id,
    contrato_origem_id, titular_apenas_financeiro,
    numero, criado_por
  ) VALUES (
    v_contrato.clinica_id, v_contrato.plano_id, v_contrato.paciente_id, v_contrato.paciente_nome,
    v_data_inicio, v_dia_venc, v_convenio_novo.valor_mensal,
    CASE WHEN _cobrar_taxa_adesao THEN v_taxa ELSE 0 END,
    v_num_parcelas, v_contrato.forma_pagamento, 'ativo', _convenio_novo_id,
    _contrato_id, v_contrato.titular_apenas_financeiro,
    COALESCE((SELECT MAX(numero) + 1 FROM public.contratos_assinatura WHERE clinica_id = v_contrato.clinica_id), 1),
    auth.uid()
  )
  RETURNING id INTO v_novo_id;

  FOR i IN 1 .. v_num_parcelas LOOP
    v_ano := EXTRACT(YEAR FROM (v_data_inicio + (i || ' month')::interval))::int;
    v_mes := EXTRACT(MONTH FROM (v_data_inicio + (i || ' month')::interval))::int;
    v_dia := LEAST(v_dia_venc, EXTRACT(DAY FROM (date_trunc('month', make_date(v_ano, v_mes, 1)) + INTERVAL '1 month - 1 day'))::int);
    v_venc := make_date(v_ano, v_mes, v_dia);

    INSERT INTO public.contrato_mensalidades (
      contrato_id, clinica_id, numero_parcela, vencimento, valor, status
    ) VALUES (
      v_novo_id, v_contrato.clinica_id, i, v_venc, v_convenio_novo.valor_mensal, 'pendente'
    );
    v_periodo_fim := v_venc;
  END LOOP;

  UPDATE public.contratos_assinatura
  SET data_fim = v_periodo_fim
  WHERE id = v_novo_id;

  -- Taxa de adesao como encargo (numero_parcela = 0), padrao venda de contrato
  IF _cobrar_taxa_adesao AND v_taxa > 0 THEN
    INSERT INTO public.contrato_mensalidades (
      contrato_id, clinica_id, numero_parcela, vencimento, valor, status, descricao
    ) VALUES (
      v_novo_id, v_contrato.clinica_id, 0, v_data_inicio, v_taxa, 'pendente', 'Taxa de adesão'
    );
  END IF;

  -- Replicar apenas os dependentes selecionados (ativos)
  INSERT INTO public.contrato_dependentes (
    contrato_id, clinica_id, paciente_id, paciente_nome, parentesco, tipo, incluido_em, ativo
  )
  SELECT v_novo_id, clinica_id, paciente_id, paciente_nome, parentesco, tipo, CURRENT_DATE, true
  FROM public.contrato_dependentes
  WHERE contrato_id = _contrato_id
    AND ativo = true
    AND (
      _dependentes_manter IS NULL
      OR id = ANY(_dependentes_manter)
    );

  UPDATE public.contratos_assinatura
  SET renovado_em = now(),
      numero_renovacoes = COALESCE(numero_renovacoes, 0) + 1,
      status = 'renovado',
      updated_at = now()
  WHERE id = _contrato_id;

  INSERT INTO public.contrato_renovacoes (
    clinica_id, contrato_id, contrato_novo_id, tipo,
    convenio_anterior_id, convenio_novo_id, valor_anterior, valor_novo,
    parcelas_geradas, periodo_inicio, periodo_fim, usuario_id, observacao
  ) VALUES (
    v_contrato.clinica_id, _contrato_id, v_novo_id, 'troca_plano',
    v_contrato.convenio_id, _convenio_novo_id,
    v_contrato.valor_mensal, v_convenio_novo.valor_mensal,
    v_num_parcelas, v_data_inicio, v_periodo_fim, auth.uid(), _observacao
  );

  RETURN jsonb_build_object(
    'contrato_novo_id', v_novo_id,
    'parcelas_geradas', v_num_parcelas,
    'taxa_adesao', CASE WHEN _cobrar_taxa_adesao THEN v_taxa ELSE 0 END
  );
END;
$function$;
