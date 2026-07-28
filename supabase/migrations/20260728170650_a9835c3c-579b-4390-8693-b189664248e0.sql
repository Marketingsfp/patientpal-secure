-- 1) Coluna estruturada (aditiva, nullable, sem backfill)
ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS composicao_pagamento jsonb;

COMMENT ON COLUMN public.fin_lancamentos.composicao_pagamento IS
  'Composição estruturada do pagamento: {"versao":1,"origem":"lancamento_dialog","troco":0,"partes":[{"forma":"dinheiro","valor":180.00}]}. Fonte de verdade para decompor "misto". NULL = legado (usar parse da observação como fallback).';

-- 2) Helper: extrai partes da composição estruturada
CREATE OR REPLACE FUNCTION public._composicao_partes(p_comp jsonb)
RETURNS TABLE(forma text, valor numeric)
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT lower(trim(e->>'forma'))::text, (e->>'valor')::numeric
  FROM jsonb_array_elements(COALESCE(p_comp->'partes', '[]'::jsonb)) e
  WHERE COALESCE((e->>'valor')::numeric, 0) > 0
    AND COALESCE(trim(e->>'forma'), '') <> ''
$$;

-- 3) RPC: persiste composicao_pagamento quando enviada
CREATE OR REPLACE FUNCTION public.fn_registrar_lancamento_e_caixa(p_lancamento jsonb, p_movimento jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_clinica_id   uuid;
  v_user_id      uuid;
  v_user_nome    text;
  v_lanc_id      uuid;
  v_mov_id       uuid;
  v_sess_id      uuid;
  v_sess_criada  boolean := false;
  v_data_lanc    date;
  v_hoje         date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_retroativo   boolean := false;
  v_valor_mov    numeric;
  v_ts_mov       timestamptz;
  v_forcar_hoje  boolean := true;
BEGIN
  IF p_lancamento IS NULL THEN
    RAISE EXCEPTION 'p_lancamento é obrigatório';
  END IF;

  v_clinica_id := (p_lancamento->>'clinica_id')::uuid;
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'clinica_id é obrigatório';
  END IF;

  v_data_lanc := COALESCE((p_lancamento->>'data')::date, v_hoje);
  v_retroativo := v_data_lanc < v_hoje;

  INSERT INTO public.fin_lancamentos (
    clinica_id, tipo, descricao, valor, data, status,
    categoria_id, conta_id, forma_pagamento, bandeira_cartao, parcelas,
    emitir_nfse, observacoes, agendamento_id, medico_id, paciente_id, criado_por,
    composicao_pagamento
  )
  VALUES (
    v_clinica_id,
    (p_lancamento->>'tipo')::public.fin_tipo_lancamento,
    p_lancamento->>'descricao',
    (p_lancamento->>'valor')::numeric,
    v_data_lanc,
    COALESCE(p_lancamento->>'status', 'confirmado')::public.fin_status_lancamento,
    NULLIF(p_lancamento->>'categoria_id','')::uuid,
    NULLIF(p_lancamento->>'conta_id','')::uuid,
    p_lancamento->>'forma_pagamento',
    p_lancamento->>'bandeira_cartao',
    NULLIF(p_lancamento->>'parcelas','')::int,
    COALESCE((p_lancamento->>'emitir_nfse')::boolean, false),
    p_lancamento->>'observacoes',
    NULLIF(p_lancamento->>'agendamento_id','')::uuid,
    NULLIF(p_lancamento->>'medico_id','')::uuid,
    NULLIF(p_lancamento->>'paciente_id','')::uuid,
    NULLIF(p_lancamento->>'criado_por','')::uuid,
    CASE WHEN jsonb_typeof(p_lancamento->'composicao_pagamento') = 'object'
      THEN p_lancamento->'composicao_pagamento' ELSE NULL END
  )
  RETURNING id INTO v_lanc_id;

  IF p_movimento IS NOT NULL AND p_movimento::text <> 'null' THEN
    v_user_id   := (p_movimento->>'user_id')::uuid;
    v_user_nome := p_movimento->>'user_nome';
    v_valor_mov := (p_movimento->>'valor')::numeric;
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'user_id é obrigatório em p_movimento quando presente';
    END IF;

    IF (p_movimento ? 'forcar_sessao_hoje') THEN
      v_forcar_hoje := COALESCE((p_movimento->>'forcar_sessao_hoje')::boolean, true);
    END IF;

    IF (NOT v_retroativo) OR v_forcar_hoje THEN
      SELECT id INTO v_sess_id
      FROM public.caixa_sessoes
      WHERE clinica_id = v_clinica_id
        AND user_id    = v_user_id
        AND status     = 'aberto'::public.caixa_sessao_status
        AND (aberto_em AT TIME ZONE 'America/Sao_Paulo')::date = v_hoje
      ORDER BY aberto_em DESC
      LIMIT 1;

      IF v_sess_id IS NULL THEN
        INSERT INTO public.caixa_sessoes (
          clinica_id, user_id, user_nome, valor_abertura, status, observacoes
        )
        VALUES (
          v_clinica_id, v_user_id, v_user_nome, 0,
          'aberto'::public.caixa_sessao_status,
          'Aberto automaticamente pelo sistema'
        )
        RETURNING id INTO v_sess_id;

        v_sess_criada := true;

        INSERT INTO public.caixa_movimentos (
          sessao_id, clinica_id, user_id, tipo, valor, descricao
        )
        VALUES (
          v_sess_id, v_clinica_id, v_user_id,
          'abertura'::public.caixa_mov_tipo, 0, 'Abertura automática'
        );
      END IF;

      v_ts_mov := now();
    ELSE
      DECLARE
        v_sess_status  public.caixa_sessao_status;
        v_sess_infor   numeric;
        v_sess_calc    numeric;
        v_sess_obs     text;
      BEGIN
        SELECT id, status, valor_fechamento_informado, valor_fechamento_calculado, observacoes
          INTO v_sess_id, v_sess_status, v_sess_infor, v_sess_calc, v_sess_obs
        FROM public.caixa_sessoes
        WHERE clinica_id = v_clinica_id
          AND user_id    = v_user_id
          AND ((aberto_em AT TIME ZONE 'America/Sao_Paulo')::date <= v_data_lanc AND
                (fechado_em IS NULL OR (fechado_em AT TIME ZONE 'America/Sao_Paulo')::date >= v_data_lanc))
        ORDER BY aberto_em DESC
        LIMIT 1;

        v_ts_mov := (v_data_lanc::text || ' 12:00:00-03')::timestamptz;

        IF v_sess_id IS NULL THEN
          INSERT INTO public.caixa_sessoes (
            clinica_id, user_id, user_nome, aberto_em, valor_abertura,
            status, fechado_em, valor_fechamento_informado,
            valor_fechamento_calculado, diferenca, observacoes
          )
          VALUES (
            v_clinica_id, v_user_id, v_user_nome, v_ts_mov, 0,
            'fechado'::public.caixa_sessao_status, v_ts_mov,
            v_valor_mov, v_valor_mov, 0,
            format('[Sessão retroativa gerada em %s por lançamento com data %s: +R$ %s]',
              to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
              to_char(v_data_lanc, 'DD/MM/YYYY'),
              to_char(v_valor_mov, 'FM999G999G990D00'))
          )
          RETURNING id INTO v_sess_id;
          v_sess_criada := true;
        ELSIF v_sess_status = 'fechado'::public.caixa_sessao_status THEN
          UPDATE public.caixa_sessoes
          SET valor_fechamento_calculado = COALESCE(v_sess_calc, 0) + v_valor_mov,
              diferenca = COALESCE(v_sess_infor, 0) - (COALESCE(v_sess_calc, 0) + v_valor_mov),
              observacoes = COALESCE(v_sess_obs || ' | ', '') || format(
                '[Retroativo lançado em %s por %s: +R$ %s]',
                to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
                COALESCE(v_user_nome, v_user_id::text),
                to_char(v_valor_mov, 'FM999G999G990D00')),
              updated_at = now()
          WHERE id = v_sess_id;
        END IF;
      END;
    END IF;

    INSERT INTO public.caixa_movimentos (
      sessao_id, clinica_id, user_id, tipo, valor, descricao,
      forma_pagamento, lancamento_id, created_at
    )
    VALUES (
      v_sess_id, v_clinica_id, v_user_id,
      (p_movimento->>'tipo')::public.caixa_mov_tipo,
      v_valor_mov,
      CASE WHEN v_retroativo
        THEN (p_movimento->>'descricao') || format(' [Data retroativa: %s]', to_char(v_data_lanc, 'DD/MM/YYYY'))
        ELSE p_movimento->>'descricao'
      END,
      p_movimento->>'forma_pagamento',
      v_lanc_id,
      v_ts_mov
    )
    RETURNING id INTO v_mov_id;
  END IF;

  RETURN jsonb_build_object(
    'lancamento_id', v_lanc_id,
    'movimento_id',  v_mov_id,
    'sessao_id',     v_sess_id,
    'sessao_criada', v_sess_criada,
    'retroativo',    v_retroativo
  );
END;
$function$;

-- 4) Trigger de split: prioriza composição estruturada; texto vira fallback
CREATE OR REPLACE FUNCTION public.fn_split_misto_caixa_mov()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_obs      text;
  v_comp     jsonb;
  v_partes   record;
  v_total    numeric := 0;
  v_soma     numeric := 0;
  v_qtd      int := 0;
  v_ajuste   numeric;
  v_desc     text;
  v_usa_comp boolean := false;
BEGIN
  IF lower(coalesce(NEW.forma_pagamento,'')) <> 'misto' THEN
    RETURN NEW;
  END IF;

  IF NEW.lancamento_id IS NOT NULL THEN
    SELECT observacoes, composicao_pagamento INTO v_obs, v_comp
      FROM public.fin_lancamentos WHERE id = NEW.lancamento_id;
  END IF;

  -- Preferência 1: dado estruturado
  IF v_comp IS NOT NULL AND jsonb_typeof(v_comp->'partes') = 'array' THEN
    SELECT COALESCE(SUM(valor),0), COUNT(*) INTO v_soma, v_qtd
      FROM public._composicao_partes(v_comp);
    IF v_qtd > 0 AND v_soma > 0 THEN
      v_usa_comp := true;
    END IF;
  END IF;

  -- Preferência 2 (fallback legado): texto da observação
  IF NOT v_usa_comp THEN
    IF v_obs IS NULL OR position(lower('misto:') in lower(v_obs)) = 0 THEN
      RETURN NEW;  -- sem fonte confiável: mantém "misto" (nunca vira dinheiro)
    END IF;
    SELECT COALESCE(SUM(valor),0), COUNT(*) INTO v_soma, v_qtd
      FROM public._parse_misto_obs(v_obs);
    IF v_qtd = 0 OR v_soma = 0 THEN
      RETURN NEW;
    END IF;
  END IF;

  v_total  := NEW.valor;
  v_ajuste := v_total - v_soma;
  v_desc   := COALESCE(NEW.descricao,'');

  FOR v_partes IN
    SELECT row_number() OVER () AS rn, forma, valor
    FROM (
      SELECT forma, valor FROM public._composicao_partes(v_comp) WHERE v_usa_comp
      UNION ALL
      SELECT forma, valor FROM public._parse_misto_obs(v_obs) WHERE NOT v_usa_comp
    ) s
  LOOP
    INSERT INTO public.caixa_movimentos (
      sessao_id, clinica_id, user_id, tipo, valor, descricao,
      forma_pagamento, lancamento_id, created_at,
      destino_user_id, destino_nome
    )
    VALUES (
      NEW.sessao_id, NEW.clinica_id, NEW.user_id, NEW.tipo,
      CASE WHEN v_partes.rn = v_qtd THEN v_partes.valor + v_ajuste ELSE v_partes.valor END,
      v_desc,
      v_partes.forma, NEW.lancamento_id, COALESCE(NEW.created_at, now()),
      NEW.destino_user_id, NEW.destino_nome
    );
  END LOOP;

  RETURN NULL;
END;
$function$;