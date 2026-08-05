
-- 1. Permitir tipo "troca_convenio" na tabela de renovações
ALTER TABLE public.contrato_renovacoes DROP CONSTRAINT IF EXISTS contrato_renovacoes_tipo_check;
ALTER TABLE public.contrato_renovacoes ADD CONSTRAINT contrato_renovacoes_tipo_check
  CHECK (tipo = ANY (ARRAY['extensao'::text, 'troca_plano'::text, 'troca_convenio'::text]));

-- 2. RPC para trocar convênio (cancela contrato antigo + cria novo sem taxa/carência)
CREATE OR REPLACE FUNCTION public.trocar_convenio_contrato(
  _contrato_id uuid,
  _convenio_novo_id uuid,
  _observacao text DEFAULT NULL,
  _dependentes jsonb DEFAULT '[]'::jsonb,
  _valor_mensal numeric DEFAULT NULL,
  _data_inicio date DEFAULT NULL
) RETURNS jsonb
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

  -- Cria novo contrato (sem taxa, contrato_origem_id isenta carencia na UI)
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

  -- Gera parcelas do novo contrato
  FOR i IN 1 .. v_num_parcelas LOOP
    v_ano := EXTRACT(YEAR FROM (v_data_inicio + (i || ' month')::interval))::int;
    v_mes := EXTRACT(MONTH FROM (v_data_inicio + (i || ' month')::interval))::int;
    v_dia := LEAST(v_dia_venc, EXTRACT(DAY FROM (date_trunc('month', make_date(v_ano, v_mes, 1)) + INTERVAL '1 month - 1 day'))::int);
    v_venc := make_date(v_ano, v_mes, v_dia);

    INSERT INTO public.contrato_mensalidades (contrato_id, clinica_id, numero_parcela, vencimento, valor, status)
    VALUES (v_novo_id, v_contrato.clinica_id, i, v_venc, v_valor, 'pendente');
    v_periodo_fim := v_venc;
  END LOOP;

  UPDATE public.contratos_assinatura
     SET data_fim = v_periodo_fim,
         updated_at = now()
   WHERE id = v_novo_id;

  -- Dependentes do novo contrato + taxas de inclusao (opcional)
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

  -- Cancela mensalidades pendentes do contrato antigo (mantem as pagas)
  UPDATE public.contrato_mensalidades
     SET status = 'cancelada',
         observacoes = COALESCE(observacoes || ' | ', '')
                       || 'Cancelada por troca de convênio (contrato #' || v_novo_numero::text || ')'
   WHERE contrato_id = _contrato_id
     AND status <> 'pago';
  GET DIAGNOSTICS v_pendentes_canceladas = ROW_COUNT;

  -- Cancela contrato antigo
  UPDATE public.contratos_assinatura
     SET status = 'cancelado',
         cancelado_em = now(),
         cancelamento_motivo = 'Troca de convênio → #' || v_novo_numero::text
                               || COALESCE(' — ' || _observacao, ''),
         updated_at = now()
   WHERE id = _contrato_id;

  -- Registra evento na tabela de renovacoes com tipo troca_convenio
  INSERT INTO public.contrato_renovacoes (
    clinica_id, contrato_id, contrato_novo_id, tipo,
    convenio_anterior_id, convenio_novo_id, valor_anterior, valor_novo,
    parcelas_geradas, periodo_inicio, periodo_fim, usuario_id, observacao,
    dependentes_incluidos
  ) VALUES (
    v_contrato.clinica_id,
    _contrato_id,
    v_novo_id,
    'troca_convenio',
    v_contrato.convenio_id,
    _convenio_novo_id,
    v_contrato.valor_mensal,
    v_valor,
    v_num_parcelas,
    v_data_inicio,
    v_periodo_fim,
    auth.uid(),
    _observacao,
    _dependentes
  );

  RETURN jsonb_build_object(
    'contrato_novo_id', v_novo_id,
    'contrato_novo_numero', v_novo_numero,
    'parcelas_geradas', v_num_parcelas,
    'mensalidades_canceladas', v_pendentes_canceladas,
    'data_inicio', v_data_inicio
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.trocar_convenio_contrato(uuid, uuid, text, jsonb, numeric, date) TO authenticated;
