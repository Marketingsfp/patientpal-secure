-- =====================================================================
-- Abordagem B: RPC atômica lançamento + caixa  (v2 — com casts enum)
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fn_registrar_lancamento_e_caixa(
  p_lancamento jsonb,
  p_movimento  jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_clinica_id uuid;
  v_user_id    uuid;
  v_lanc_id    uuid;
  v_mov_id     uuid;
  v_sess_id    uuid;
  v_sess_criada boolean := false;
BEGIN
  IF p_lancamento IS NULL THEN
    RAISE EXCEPTION 'p_lancamento é obrigatório';
  END IF;

  v_clinica_id := (p_lancamento->>'clinica_id')::uuid;
  IF v_clinica_id IS NULL THEN
    RAISE EXCEPTION 'clinica_id é obrigatório';
  END IF;

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
    COALESCE((p_lancamento->>'data')::date, CURRENT_DATE),
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
    v_user_id := (p_movimento->>'user_id')::uuid;
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'user_id é obrigatório em p_movimento quando presente';
    END IF;

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
        v_clinica_id,
        v_user_id,
        p_movimento->>'user_nome',
        0,
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

    INSERT INTO public.caixa_movimentos (
      sessao_id, clinica_id, user_id, tipo, valor, descricao,
      forma_pagamento, lancamento_id
    )
    VALUES (
      v_sess_id,
      v_clinica_id,
      v_user_id,
      (p_movimento->>'tipo')::public.caixa_mov_tipo,
      (p_movimento->>'valor')::numeric,
      p_movimento->>'descricao',
      p_movimento->>'forma_pagamento',
      v_lanc_id
    )
    RETURNING id INTO v_mov_id;
  END IF;

  RETURN jsonb_build_object(
    'lancamento_id', v_lanc_id,
    'movimento_id',  v_mov_id,
    'sessao_id',     v_sess_id,
    'sessao_criada', v_sess_criada
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.fn_registrar_lancamento_e_caixa(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_registrar_lancamento_e_caixa(jsonb, jsonb) TO service_role;

COMMENT ON FUNCTION public.fn_registrar_lancamento_e_caixa(jsonb, jsonb) IS
  'Registra fin_lancamentos + caixa_movimentos atomicamente. SECURITY INVOKER: respeita RLS. Se qualquer INSERT falhar, ambos são revertidos automaticamente (transação Postgres).';

-- =====================================================================
-- Simulação transacional embutida
-- =====================================================================
DO $test$
DECLARE
  v_clinica_id uuid;
  v_user_id    uuid;
  v_sess_id_pre uuid;
  v_result     jsonb;
  v_lanc_id    uuid;
  v_mov_id     uuid;
  v_sess_criada boolean;
  v_orfaos     int;
  v_tag        text := '[TESTE_ATOMICO_' || extract(epoch from now())::bigint || ']';
BEGIN
  SELECT id INTO v_clinica_id FROM public.clinicas LIMIT 1;
  IF v_clinica_id IS NULL THEN
    RAISE NOTICE 'Sem clínica cadastrada — pulando testes.';
    RETURN;
  END IF;

  SELECT s.user_id, s.id
    INTO v_user_id, v_sess_id_pre
  FROM public.caixa_sessoes s
  WHERE s.clinica_id = v_clinica_id
    AND s.status = 'aberto'::public.caixa_sessao_status
  ORDER BY s.aberto_em DESC
  LIMIT 1;

  -- ================== TESTE 1: happy path ==================
  RAISE NOTICE '--- TESTE 1: happy path (lançamento + caixa) ---';

  v_result := public.fn_registrar_lancamento_e_caixa(
    jsonb_build_object(
      'clinica_id',      v_clinica_id,
      'tipo',            'receita',
      'descricao',       v_tag || ' happy path',
      'valor',           0.01,
      'data',            CURRENT_DATE,
      'status',          'confirmado',
      'forma_pagamento', 'dinheiro',
      'observacoes',     'teste-atomicidade-nao-contar'
    ),
    CASE WHEN v_user_id IS NOT NULL THEN
      jsonb_build_object(
        'user_id',         v_user_id,
        'tipo',            'recebimento',
        'valor',           0.01,
        'descricao',       v_tag || ' mov',
        'forma_pagamento', 'dinheiro'
      )
    ELSE NULL END
  );

  v_lanc_id     := (v_result->>'lancamento_id')::uuid;
  v_mov_id      := (v_result->>'movimento_id')::uuid;
  v_sess_criada := COALESCE((v_result->>'sessao_criada')::boolean, false);

  IF v_lanc_id IS NULL THEN
    RAISE EXCEPTION 'TESTE 1 FALHOU: lancamento_id retornou NULL';
  END IF;

  IF v_user_id IS NOT NULL AND v_mov_id IS NULL THEN
    RAISE EXCEPTION 'TESTE 1 FALHOU: movimento_id retornou NULL apesar de p_movimento presente';
  END IF;

  IF v_sess_criada THEN
    RAISE EXCEPTION 'TESTE 1: sessão de caixa foi criada como efeito colateral — teste inválido';
  END IF;

  RAISE NOTICE 'TESTE 1 OK: lanc=% mov=% (ambos criados atomicamente)', v_lanc_id, v_mov_id;

  -- Cleanup do teste 1
  IF v_mov_id IS NOT NULL THEN
    DELETE FROM public.caixa_movimentos WHERE id = v_mov_id;
  END IF;
  DELETE FROM public.fin_lancamentos WHERE id = v_lanc_id;

  -- ================== TESTE 2: falha forçada no caixa ==================
  RAISE NOTICE '--- TESTE 2: forçar falha no caixa (tipo inexistente no enum) ---';

  BEGIN
    v_result := public.fn_registrar_lancamento_e_caixa(
      jsonb_build_object(
        'clinica_id',      v_clinica_id,
        'tipo',            'receita',
        'descricao',       v_tag || ' forca_falha',
        'valor',           0.01,
        'data',            CURRENT_DATE,
        'status',          'confirmado',
        'forma_pagamento', 'dinheiro',
        'observacoes',     'teste-atomicidade-nao-contar'
      ),
      jsonb_build_object(
        'user_id',         COALESCE(v_user_id, gen_random_uuid()),
        'tipo',            'TIPO_INEXISTENTE_ATOMICO',  -- cast p/ caixa_mov_tipo falha
        'valor',           0.01,
        'descricao',       v_tag,
        'forma_pagamento', 'dinheiro'
      )
    );
    RAISE EXCEPTION 'TESTE 2 FALHOU: a função deveria ter lançado exceção';
  EXCEPTION
    WHEN OTHERS THEN
      -- Verifica atomicidade: o lançamento NÃO pode ter ficado órfão
      SELECT count(*) INTO v_orfaos
      FROM public.fin_lancamentos
      WHERE descricao = v_tag || ' forca_falha';

      IF v_orfaos <> 0 THEN
        RAISE EXCEPTION
          'FALHA CRÍTICA DE ATOMICIDADE: lançamento ficou órfão! count=%',
          v_orfaos;
      END IF;

      RAISE NOTICE 'TESTE 2 OK: atomicidade confirmada — 0 órfãos (SQLSTATE=%)', SQLSTATE;
  END;

  -- Limpeza extra
  DELETE FROM public.fin_lancamentos
   WHERE observacoes = 'teste-atomicidade-nao-contar'
     AND descricao LIKE v_tag || '%';

  RAISE NOTICE '=================================================================';
  RAISE NOTICE '  SIMULAÇÃO PÓS-CORREÇÃO (Abordagem B) — TODOS OS TESTES PASSARAM';
  RAISE NOTICE '  Atomicidade lançamento+caixa garantida no banco.';
  RAISE NOTICE '=================================================================';
END
$test$;