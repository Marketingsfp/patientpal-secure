
-- 1) Coluna para histórico dos dependentes na renovação
ALTER TABLE public.contrato_renovacoes
  ADD COLUMN IF NOT EXISTS dependentes_incluidos jsonb;

-- 2) Remover overloads antigos das RPCs
DROP FUNCTION IF EXISTS public.renovar_contrato_extensao(uuid, text);
DROP FUNCTION IF EXISTS public.renovar_contrato_troca_plano(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.renovar_contrato_troca_plano(uuid, uuid, text, uuid[], boolean);

-- 3) Extensão: aceita lista final de dependentes (edições + novos)
CREATE OR REPLACE FUNCTION public.renovar_contrato_extensao(
  _contrato_id uuid,
  _observacao text DEFAULT NULL,
  _dependentes jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_data_base date;
  v_periodo_inicio date;
  v_periodo_fim date;
  i int;
  v_venc date;
  v_ano int; v_mes int; v_dia int;
  v_dep jsonb;
  v_dep_id uuid;
  v_taxa_inclusao numeric;
  v_menor_neg int;
BEGIN
  SELECT * INTO v_contrato FROM public.contratos_assinatura WHERE id = _contrato_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Contrato nao encontrado'; END IF;

  IF NOT can_manage_clinica(auth.uid(), v_contrato.clinica_id) THEN
    RAISE EXCEPTION 'Sem permissao para renovar contratos desta clinica';
  END IF;

  IF v_contrato.status <> 'ativo' OR v_contrato.cancelado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Contrato nao esta ativo';
  END IF;

  IF v_contrato.convenio_id IS NULL THEN
    RAISE EXCEPTION 'Contrato sem convenio vinculado';
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE status = 'pago'),
    COUNT(*)
  INTO v_pagas, v_max
  FROM public.contrato_mensalidades
  WHERE contrato_id = _contrato_id AND numero_parcela > 0;

  IF v_max = 0 OR v_pagas < v_max THEN
    RAISE EXCEPTION 'So e possivel renovar quando todas as mensalidades estiverem pagas (pagas: % de %)', v_pagas, v_max;
  END IF;

  SELECT * INTO v_convenio FROM public.cb_convenios WHERE id = v_contrato.convenio_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convenio do contrato nao encontrado'; END IF;

  v_novo_valor := v_convenio.valor_mensal;
  v_num_parcelas := COALESCE(NULLIF(v_convenio.num_parcelas, 0), 12);
  v_taxa_inclusao := COALESCE(v_convenio.taxa_inclusao_dependente, 0);

  SELECT MAX(numero_parcela), MAX(vencimento)
  INTO v_prox, v_data_base
  FROM public.contrato_mensalidades
  WHERE contrato_id = _contrato_id AND numero_parcela > 0;

  v_prox := COALESCE(v_prox, 0) + 1;
  v_dia_venc := COALESCE(v_contrato.dia_vencimento, EXTRACT(DAY FROM v_data_base)::int, 10);
  v_periodo_inicio := (v_data_base + INTERVAL '1 month')::date;

  -- Gera novas parcelas (13..24 etc.)
  FOR i IN 0 .. v_num_parcelas - 1 LOOP
    v_ano := EXTRACT(YEAR FROM (v_data_base + ((i + 1) || ' month')::interval))::int;
    v_mes := EXTRACT(MONTH FROM (v_data_base + ((i + 1) || ' month')::interval))::int;
    v_dia := LEAST(v_dia_venc, EXTRACT(DAY FROM (date_trunc('month', make_date(v_ano, v_mes, 1)) + INTERVAL '1 month - 1 day'))::int);
    v_venc := make_date(v_ano, v_mes, v_dia);

    INSERT INTO public.contrato_mensalidades (
      contrato_id, clinica_id, numero_parcela, vencimento, valor, status
    ) VALUES (
      _contrato_id, v_contrato.clinica_id, v_prox + i, v_venc, v_novo_valor, 'pendente'
    );
    v_periodo_fim := v_venc;
  END LOOP;

  -- Aplica edições e inclusões de dependentes conforme _dependentes
  IF jsonb_typeof(_dependentes) = 'array' THEN
    -- Menor numero_parcela negativo atual (para gerar próximos slots de taxa)
    SELECT COALESCE(MIN(numero_parcela), 0) INTO v_menor_neg
    FROM public.contrato_mensalidades
    WHERE contrato_id = _contrato_id AND numero_parcela < 0;

    FOR v_dep IN SELECT * FROM jsonb_array_elements(_dependentes) LOOP
      v_dep_id := NULLIF(v_dep->>'id','')::uuid;

      IF v_dep_id IS NOT NULL THEN
        -- Existente: manter/atualizar ou desativar
        IF COALESCE((v_dep->>'manter')::boolean, true) THEN
          UPDATE public.contrato_dependentes
             SET paciente_id  = COALESCE(NULLIF(v_dep->>'paciente_id','')::uuid, paciente_id),
                 paciente_nome = COALESCE(NULLIF(v_dep->>'paciente_nome',''), paciente_nome),
                 parentesco    = NULLIF(v_dep->>'parentesco',''),
                 tipo          = COALESCE(NULLIF(v_dep->>'tipo',''), tipo)
           WHERE id = v_dep_id AND contrato_id = _contrato_id;
        ELSE
          UPDATE public.contrato_dependentes
             SET ativo = false, excluido_em = CURRENT_DATE
           WHERE id = v_dep_id AND contrato_id = _contrato_id;
        END IF;
      ELSE
        -- Novo: insere no contrato atual
        INSERT INTO public.contrato_dependentes (
          contrato_id, clinica_id, paciente_id, paciente_nome, parentesco, tipo, incluido_em, ativo
        ) VALUES (
          _contrato_id,
          v_contrato.clinica_id,
          NULLIF(v_dep->>'paciente_id','')::uuid,
          v_dep->>'paciente_nome',
          NULLIF(v_dep->>'parentesco',''),
          COALESCE(NULLIF(v_dep->>'tipo',''), 'dependente'),
          CURRENT_DATE,
          true
        );

        -- Taxa de inclusão (opcional)
        IF COALESCE((v_dep->>'cobrar_taxa_inclusao')::boolean, false) AND v_taxa_inclusao > 0 THEN
          v_menor_neg := v_menor_neg - 1;
          INSERT INTO public.contrato_mensalidades (
            contrato_id, clinica_id, numero_parcela, vencimento, valor, status, observacoes, descricao
          ) VALUES (
            _contrato_id,
            v_contrato.clinica_id,
            v_menor_neg,
            CURRENT_DATE,
            v_taxa_inclusao,
            'pendente',
            'Taxa de inclusão de dependente — ' || COALESCE(v_dep->>'paciente_nome',''),
            'Taxa de inclusão de dependente'
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.contratos_assinatura
     SET data_fim = v_periodo_fim,
         valor_mensal = v_novo_valor,
         numero_renovacoes = COALESCE(numero_renovacoes, 0) + 1,
         renovado_em = now(),
         updated_at = now()
   WHERE id = _contrato_id;

  INSERT INTO public.contrato_renovacoes (
    clinica_id, contrato_id, contrato_novo_id, tipo,
    convenio_anterior_id, convenio_novo_id, valor_anterior, valor_novo,
    parcelas_geradas, periodo_inicio, periodo_fim, usuario_id, observacao,
    dependentes_incluidos
  ) VALUES (
    v_contrato.clinica_id, _contrato_id, NULL, 'extensao',
    v_contrato.convenio_id, v_contrato.convenio_id,
    v_contrato.valor_mensal, v_novo_valor,
    v_num_parcelas, v_periodo_inicio, v_periodo_fim, auth.uid(), _observacao,
    _dependentes
  );

  RETURN jsonb_build_object(
    'ok', true,
    'parcelas_geradas', v_num_parcelas,
    'valor_novo', v_novo_valor,
    'periodo_inicio', v_periodo_inicio,
    'periodo_fim', v_periodo_fim
  );
END;
$function$;

-- 4) Troca de plano: aceita lista final de dependentes (edições + novos)
CREATE OR REPLACE FUNCTION public.renovar_contrato_troca_plano(
  _contrato_id uuid,
  _convenio_novo_id uuid,
  _observacao text DEFAULT NULL,
  _cobrar_taxa_adesao boolean DEFAULT true,
  _dependentes jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_taxa_inclusao numeric;
  v_menor_neg int;
  v_dep jsonb;
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

  SELECT * INTO v_convenio_novo FROM public.cb_convenios
   WHERE id = _convenio_novo_id AND clinica_id = v_contrato.clinica_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Convenio novo invalido'; END IF;

  v_num_parcelas := COALESCE(NULLIF(v_convenio_novo.num_parcelas, 0), 12);
  v_dia_venc := COALESCE(v_contrato.dia_vencimento, 10);
  v_data_inicio := CURRENT_DATE;
  v_taxa := COALESCE(v_convenio_novo.taxa_adesao, 0);
  v_taxa_inclusao := COALESCE(v_convenio_novo.taxa_inclusao_dependente, 0);

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

  -- Parcelas do contrato novo
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

  UPDATE public.contratos_assinatura SET data_fim = v_periodo_fim WHERE id = v_novo_id;

  -- Taxa de adesão (numero_parcela = 0)
  IF _cobrar_taxa_adesao AND v_taxa > 0 THEN
    INSERT INTO public.contrato_mensalidades (
      contrato_id, clinica_id, numero_parcela, vencimento, valor, status, descricao
    ) VALUES (
      v_novo_id, v_contrato.clinica_id, 0, v_data_inicio, v_taxa, 'pendente', 'Taxa de adesão'
    );
  END IF;

  -- Dependentes: se o payload vier vazio, replica os ativos do contrato antigo (compat).
  IF jsonb_typeof(_dependentes) <> 'array' OR jsonb_array_length(_dependentes) = 0 THEN
    INSERT INTO public.contrato_dependentes (
      contrato_id, clinica_id, paciente_id, paciente_nome, parentesco, tipo, incluido_em, ativo
    )
    SELECT v_novo_id, clinica_id, paciente_id, paciente_nome, parentesco, tipo, CURRENT_DATE, true
      FROM public.contrato_dependentes
     WHERE contrato_id = _contrato_id AND ativo = true;
  ELSE
    v_menor_neg := 0;
    FOR v_dep IN SELECT * FROM jsonb_array_elements(_dependentes) LOOP
      -- Só entra no contrato novo se "manter" for verdadeiro ou for novo (sem id)
      IF NOT COALESCE((v_dep->>'manter')::boolean, true) THEN
        CONTINUE;
      END IF;
      IF NULLIF(v_dep->>'paciente_id','') IS NULL THEN
        CONTINUE;
      END IF;

      INSERT INTO public.contrato_dependentes (
        contrato_id, clinica_id, paciente_id, paciente_nome, parentesco, tipo, incluido_em, ativo
      ) VALUES (
        v_novo_id,
        v_contrato.clinica_id,
        (v_dep->>'paciente_id')::uuid,
        v_dep->>'paciente_nome',
        NULLIF(v_dep->>'parentesco',''),
        COALESCE(NULLIF(v_dep->>'tipo',''), 'dependente'),
        CURRENT_DATE,
        true
      );

      -- Taxa de inclusão apenas para dependentes NOVOS marcados
      IF NULLIF(v_dep->>'id','') IS NULL
         AND COALESCE((v_dep->>'cobrar_taxa_inclusao')::boolean, false)
         AND v_taxa_inclusao > 0 THEN
        v_menor_neg := v_menor_neg - 1;
        INSERT INTO public.contrato_mensalidades (
          contrato_id, clinica_id, numero_parcela, vencimento, valor, status, observacoes, descricao
        ) VALUES (
          v_novo_id,
          v_contrato.clinica_id,
          v_menor_neg,
          v_data_inicio,
          v_taxa_inclusao,
          'pendente',
          'Taxa de inclusão de dependente — ' || COALESCE(v_dep->>'paciente_nome',''),
          'Taxa de inclusão de dependente'
        );
      END IF;
    END LOOP;
  END IF;

  -- Encerra o contrato antigo como renovado
  UPDATE public.contratos_assinatura
     SET renovado_em = now(),
         numero_renovacoes = COALESCE(numero_renovacoes, 0) + 1,
         status = 'renovado',
         updated_at = now()
   WHERE id = _contrato_id;

  INSERT INTO public.contrato_renovacoes (
    clinica_id, contrato_id, contrato_novo_id, tipo,
    convenio_anterior_id, convenio_novo_id, valor_anterior, valor_novo,
    parcelas_geradas, periodo_inicio, periodo_fim, usuario_id, observacao,
    dependentes_incluidos
  ) VALUES (
    v_contrato.clinica_id, _contrato_id, v_novo_id, 'troca_plano',
    v_contrato.convenio_id, _convenio_novo_id,
    v_contrato.valor_mensal, v_convenio_novo.valor_mensal,
    v_num_parcelas, v_data_inicio, v_periodo_fim, auth.uid(), _observacao,
    _dependentes
  );

  RETURN jsonb_build_object(
    'contrato_novo_id', v_novo_id,
    'parcelas_geradas', v_num_parcelas,
    'taxa_adesao', CASE WHEN _cobrar_taxa_adesao THEN v_taxa ELSE 0 END
  );
END;
$function$;
