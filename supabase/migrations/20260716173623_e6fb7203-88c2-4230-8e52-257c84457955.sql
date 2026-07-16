
CREATE OR REPLACE FUNCTION public.fn_registrar_lancamento_e_caixa(
  p_lancamento jsonb,
  p_movimento  jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinica_id   uuid;
  v_user_id      uuid;
  v_user_nome    text;
  v_lanc_id      uuid;
  v_mov_id       uuid;
  v_sess_id      uuid;
  v_sess_criada  boolean := false;
  v_data_lanc    date;
  v_hoje         date := CURRENT_DATE;
  v_retroativo   boolean := false;
  v_valor_mov    numeric;
  v_sess_status  public.caixa_sessao_status;
  v_sess_infor   numeric;
  v_sess_calc    numeric;
  v_sess_obs     text;
  v_ts_mov       timestamptz;
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

  -- 1) INSERT do lançamento financeiro
  INSERT INTO public.fin_lancamentos (
    clinica_id, tipo, descricao, valor, data, status,
    categoria_id, conta_id, forma_pagamento, bandeira_cartao, parcelas,
    emitir_nfse, observacoes, agendamento_id, medico_id, paciente_id, criado_por
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
    NULLIF(p_lancamento->>'criado_por','')::uuid
  )
  RETURNING id INTO v_lanc_id;

  -- 2) INSERT do movimento de caixa (opcional)
  IF p_movimento IS NOT NULL AND p_movimento::text <> 'null' THEN
    v_user_id   := (p_movimento->>'user_id')::uuid;
    v_user_nome := p_movimento->>'user_nome';
    v_valor_mov := (p_movimento->>'valor')::numeric;
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'user_id é obrigatório em p_movimento quando presente';
    END IF;

    IF NOT v_retroativo THEN
      -- Fluxo padrão: sessão aberta do usuário (cria se não houver)
      SELECT id INTO v_sess_id
      FROM public.caixa_sessoes
      WHERE clinica_id = v_clinica_id
        AND user_id    = v_user_id
        AND status     = 'aberto'::public.caixa_sessao_status
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
      -- Retroativo: procura sessão do usuário que cubra o dia do lançamento
      SELECT id, status, valor_fechamento_informado, valor_fechamento_calculado, observacoes
        INTO v_sess_id, v_sess_status, v_sess_infor, v_sess_calc, v_sess_obs
      FROM public.caixa_sessoes
      WHERE clinica_id = v_clinica_id
        AND user_id    = v_user_id
        AND (
          (aberto_em::date <= v_data_lanc AND
            (fechado_em IS NULL OR fechado_em::date >= v_data_lanc))
        )
      ORDER BY aberto_em DESC
      LIMIT 1;

      -- ts do movimento retroativo = data 12:00 UTC (meio-dia)
      v_ts_mov := (v_data_lanc::text || ' 12:00:00+00')::timestamptz;

      IF v_sess_id IS NULL THEN
        -- Não existe sessão do usuário naquele dia -> cria sessão retroativa já fechada
        INSERT INTO public.caixa_sessoes (
          clinica_id, user_id, user_nome,
          aberto_em, valor_abertura,
          status, fechado_em,
          valor_fechamento_informado, valor_fechamento_calculado, diferenca,
          observacoes
        )
        VALUES (
          v_clinica_id, v_user_id, v_user_nome,
          v_ts_mov, 0,
          'fechado'::public.caixa_sessao_status, v_ts_mov,
          v_valor_mov, v_valor_mov, 0,
          format(
            '[Sessão retroativa gerada em %s por lançamento com data %s: +R$ %s]',
            to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
            to_char(v_data_lanc, 'DD/MM/YYYY'),
            to_char(v_valor_mov, 'FM999G999G990D00')
          )
        )
        RETURNING id INTO v_sess_id;

        v_sess_criada := true;
      ELSIF v_sess_status = 'fechado'::public.caixa_sessao_status THEN
        -- Anexa em sessão já fechada, recalcula calculado/diferença e anota auditoria
        UPDATE public.caixa_sessoes
        SET valor_fechamento_calculado = COALESCE(v_sess_calc, 0) + v_valor_mov,
            diferenca = COALESCE(v_sess_infor, 0) - (COALESCE(v_sess_calc, 0) + v_valor_mov),
            observacoes = COALESCE(v_sess_obs || ' | ', '') || format(
              '[Retroativo lançado em %s por %s: +R$ %s]',
              to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI'),
              COALESCE(v_user_nome, v_user_id::text),
              to_char(v_valor_mov, 'FM999G999G990D00')
            ),
            updated_at = now()
        WHERE id = v_sess_id;
      END IF;
      -- Se sessão aberta cobre o dia, apenas insere (sem alterar totais)
    END IF;

    INSERT INTO public.caixa_movimentos (
      sessao_id, clinica_id, user_id, tipo, valor, descricao,
      forma_pagamento, lancamento_id, created_at
    )
    VALUES (
      v_sess_id,
      v_clinica_id,
      v_user_id,
      (p_movimento->>'tipo')::public.caixa_mov_tipo,
      v_valor_mov,
      p_movimento->>'descricao',
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
$$;
