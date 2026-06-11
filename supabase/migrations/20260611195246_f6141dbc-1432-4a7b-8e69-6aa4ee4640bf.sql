
CREATE OR REPLACE FUNCTION public.paciente_cartao_inadimplente(_paciente_id uuid, _clinica_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _mens jsonb;
  _total numeric;
BEGIN
  IF _paciente_id IS NULL THEN
    RETURN jsonb_build_object('bloqueado', false);
  END IF;

  WITH mens AS (
    SELECT m.id, m.numero_parcela, m.vencimento, m.valor, m.status,
           c.numero AS contrato_numero, c.id AS contrato_id,
           cv.nome AS convenio_nome,
           GREATEST(0, _hoje - m.vencimento) AS dias_atraso
    FROM public.contrato_mensalidades m
    JOIN public.contratos_assinatura c ON c.id = m.contrato_id
    LEFT JOIN public.cb_convenios cv ON cv.id = c.convenio_id
    WHERE m.status IN ('pendente','aberto','atrasado','vencida','vencido')
      AND m.vencimento < _hoje
      AND c.status = 'ativo'
      AND (_clinica_id IS NULL OR c.clinica_id = _clinica_id)
      AND (
        c.paciente_id = _paciente_id
        OR EXISTS (
          SELECT 1 FROM public.contrato_dependentes d
          WHERE d.contrato_id = c.id AND d.paciente_id = _paciente_id AND d.ativo
        )
      )
  )
  SELECT
    COALESCE(jsonb_agg(to_jsonb(m) ORDER BY m.vencimento), '[]'::jsonb),
    COALESCE(SUM(valor), 0)
  INTO _mens, _total
  FROM mens m;

  RETURN jsonb_build_object(
    'bloqueado', jsonb_array_length(_mens) > 0,
    'total_aberto', _total,
    'mensalidades', _mens
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.paciente_cartao_inadimplente(uuid, uuid) TO authenticated, anon;

DO $$
DECLARE
  v_clinica uuid := '7570ddde-8c1c-4b55-ba72-cf12b2a6c940';
  v_conv_terap uuid;
  v_conv_consulta uuid;
  v_conv_segs uuid;
  v_esp record;
BEGIN
  SELECT id INTO v_conv_terap FROM public.cb_convenios WHERE clinica_id = v_clinica AND nome = 'CARTÃO TERAPÊUTICO' LIMIT 1;
  SELECT id INTO v_conv_consulta FROM public.cb_convenios WHERE clinica_id = v_clinica AND nome = 'CARTÃO CONSULTA' LIMIT 1;
  SELECT id INTO v_conv_segs FROM public.cb_convenios WHERE clinica_id = v_clinica AND nome = 'CARTÃO CONSULTA + SEGUROS' LIMIT 1;

  IF v_conv_terap IS NOT NULL THEN
    FOR v_esp IN
      SELECT id FROM public.especialidades
      WHERE ativo = true
        AND upper(public.strip_accents(nome)) IN (
          'PEDIATRIA','NEUROLOGIA','ORTOPEDIA','NUTRICAO','NEUROPEDIATRIA','ORTOPEDIA E TRAUMATOLOGIA'
        )
    LOOP
      INSERT INTO public.cb_convenio_regras
        (clinica_id, convenio_id, especialidade_id, tipo, modo, percentual, prioridade, ativo)
      SELECT v_clinica, v_conv_terap, v_esp.id, 'consulta', 'percentual_desconto', 40.00, 5, true
      WHERE NOT EXISTS (
        SELECT 1 FROM public.cb_convenio_regras
        WHERE convenio_id = v_conv_terap AND especialidade_id = v_esp.id AND tipo = 'consulta'
      );
    END LOOP;
    INSERT INTO public.cb_convenio_regras
      (clinica_id, convenio_id, especialidade_id, tipo, modo, percentual, prioridade, ativo)
    SELECT v_clinica, v_conv_terap, NULL, 'exame', 'percentual_desconto', 10.00, 1, true
    WHERE NOT EXISTS (
      SELECT 1 FROM public.cb_convenio_regras
      WHERE convenio_id = v_conv_terap AND especialidade_id IS NULL AND tipo = 'exame'
    );
  END IF;

  IF v_conv_consulta IS NOT NULL AND v_conv_segs IS NOT NULL THEN
    INSERT INTO public.cb_convenio_regras
      (clinica_id, convenio_id, especialidade_id, tipo, nome_padrao, modo, valor, percentual, prioridade, ativo)
    SELECT v_clinica, v_conv_consulta, especialidade_id, tipo, nome_padrao, modo, valor, percentual, prioridade, ativo
    FROM public.cb_convenio_regras
    WHERE convenio_id = v_conv_segs
      AND NOT EXISTS (
        SELECT 1 FROM public.cb_convenio_regras r2
        WHERE r2.convenio_id = v_conv_consulta
          AND COALESCE(r2.especialidade_id::text,'') = COALESCE(cb_convenio_regras.especialidade_id::text,'')
          AND COALESCE(r2.tipo,'') = COALESCE(cb_convenio_regras.tipo,'')
      );
  END IF;
END $$;
