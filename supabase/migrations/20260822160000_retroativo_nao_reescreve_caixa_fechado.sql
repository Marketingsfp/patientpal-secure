-- ---------------------------------------------------------------------------
-- Lançamento retroativo não reescreve mais caixa fechado
--
-- Problema corrigido: quando um pagamento era registrado com data de um dia
-- anterior, o movimento de caixa era jogado no caixa DAQUELE dia — mesmo já
-- fechado e conferido — e a função ainda reescrevia o fechamento:
--
--     valor_fechamento_calculado = calculado + valor
--     valor_fechamento_informado = informado + valor
--
-- Somar ao `informado` é o ponto grave: esse campo é o dinheiro que a
-- atendente CONTOU na gaveta e digitou, e é o número impresso no cupom de
-- fechamento. Alterá-lo depois faz o cupom daquele dia deixar de bater com o
-- sistema, e a conferência do caixa nesta clínica se valida no cupom impresso.
-- Havia 34 caixas fechados já alterados assim, 9 deles em agosto/2026 (15
-- lançamentos entre 19 e 20/08, R$ 1.453,97).
--
-- Quando não existia sessão nenhuma para a data retroativa, a função chegava a
-- CRIAR uma sessão já nascida fechada, com informado = calculado = o valor do
-- próprio lançamento. Um caixa que nunca existiu, com uma conferência que
-- ninguém fez.
--
-- Regra nova, a mesma que estornar_lancamento_receita e estornar_sangria já
-- aplicam:
--   * sessão daquele dia ainda ABERTA -> lança nela (nada foi conferido nem
--                                        impresso ainda, nenhum cupom é
--                                        violado);
--   * sessão fechada, ou inexistente  -> lança no caixa de HOJE do próprio
--                                        operador, criando-o se ainda não
--                                        houver, como já acontece no fluxo
--                                        normal.
--
-- Um dia já fechado passa a ser intocável. A data contábil continua sendo a
-- retroativa em fin_lancamentos.data — o que muda é só em qual gaveta o
-- dinheiro entra. A descrição do movimento segue marcada com
-- "[Data retroativa: DD/MM/YYYY]", então a origem continua rastreável.
--
-- Consequência operacional a conhecer: se o dinheiro de um dia já fechado for
-- registrado hoje, ele aparece no caixa de hoje. Quando for espécie que não
-- está na gaveta de hoje, o fechamento vai acusar a diferença — o que é o
-- comportamento correto: a divergência fica visível no dia em que foi criada,
-- em vez de ser escondida reescrevendo um fechamento antigo.
--
-- `forcar_sessao_hoje` continua aceito e continua significando "ignore a data
-- retroativa, use o caixa de hoje". Ele deixa de ser a única defesa.
-- ---------------------------------------------------------------------------

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

  IF auth.uid() IS NULL OR NOT public.is_member(auth.uid(), v_clinica_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

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

    -- 1) Lançamento retroativo cujo caixa daquele dia AINDA ESTÁ ABERTO: pode
    --    entrar nele. Nada foi conferido nem impresso, então não há cupom a
    --    contradizer, e o dinheiro fica no dia a que pertence.
    IF v_retroativo AND NOT v_forcar_hoje THEN
      SELECT id INTO v_sess_id
      FROM public.caixa_sessoes
      WHERE clinica_id = v_clinica_id
        AND user_id    = v_user_id
        AND status     = 'aberto'::public.caixa_sessao_status
        AND (aberto_em AT TIME ZONE 'America/Sao_Paulo')::date = v_data_lanc
      ORDER BY aberto_em DESC
      LIMIT 1;

      IF v_sess_id IS NOT NULL THEN
        v_ts_mov := (v_data_lanc::text || ' 12:00:00-03')::timestamptz;
      END IF;
    END IF;

    -- 2) Caso normal e também o retroativo de um dia já FECHADO: o movimento
    --    entra no caixa de hoje. Um fechamento já conferido nunca é reescrito.
    IF v_sess_id IS NULL THEN
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

GRANT EXECUTE ON FUNCTION public.fn_registrar_lancamento_e_caixa(jsonb, jsonb) TO authenticated, service_role;
