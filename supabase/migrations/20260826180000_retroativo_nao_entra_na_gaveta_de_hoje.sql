-- ---------------------------------------------------------------------------
-- Lançamento retroativo não entra na gaveta de hoje
--
-- Regra de negócio da recepção, definida pelo dono da clínica:
--
--   1. A GR retroativa lançada hoje com data passada é contabilizada NA DATA
--      ESCOLHIDA (competência). Isso já acontecia: `fin_lancamentos.data`
--      recebe o dia do atendimento.
--   2. Ela NUNCA soma no Movimento de Caixa de HOJE. O caixa de hoje só pode
--      conter o que pertence ao dia de hoje.
--   3. Se a data retroativa cair num caixa JÁ FECHADO, o lançamento histórico
--      é permitido na competência dele sem empurrar nenhum centavo para o dia
--      atual.
--
-- O que mudava antes desta migration: quando o caixa do dia do atendimento já
-- estava fechado, a função lançava um `recebimento` de valor cheio no caixa de
-- HOJE. O dinheiro tinha entrado noutro dia, mas inflava o fechamento de hoje,
-- e a atendente ficava com uma sobra que não conseguia conferir contra o cupom.
-- Era esse o incômodo relatado pela recepção.
--
-- O que muda agora: nesse caso o movimento passa a ser gravado com tipo
-- `registro`, que pesa ZERO em `SINAL_NO_SALDO` (@/lib/caixa/fechamento.ts).
-- A linha continua aparecendo no extrato e no cupom do dia da digitação — a
-- atendente precisa conseguir provar que emitiu a guia, e sumir do extrato
-- também é errado — mas vale R$ 0,00 no dinheiro esperado da gaveta.
--
-- O que NÃO muda, de propósito:
--
--   * Caixa fechado continua intocável. Nada é escrito dentro da sessão antiga
--     e nenhum `valor_fechamento_informado` é alterado: seria reescrever um
--     cupom já impresso e conferido. A competência do lançamento é que carrega
--     a data histórica, e é dela que vivem o Painel Executivo e os relatórios
--     por competência.
--   * Caixa do dia do atendimento ainda ABERTO continua recebendo o movimento
--     normalmente, com valor cheio. Nada foi conferido nem impresso ainda, o
--     dinheiro fica no dia a que pertence e o cupom sai correto.
--   * O repasse do prestador não é afetado: ele lê `fin_lancamentos`, não
--     `caixa_movimentos`.
--   * A forma de pagamento real (dinheiro, PIX, cartão) é preservada. Não se
--     troca por "Pago no sistema anterior", que é específica da virada da
--     Clínica Total e registraria uma origem falsa.
--
-- Consequência operacional que a recepção precisa saber: se o paciente
-- realmente pagar HOJE por um atendimento antigo, o lançamento tem que ser
-- feito com a data de HOJE. Lançado com data retroativa, o dinheiro fica
-- fisicamente na gaveta sem o sistema esperar por ele, e o fechamento vai
-- acusar sobra.
--
-- Os 103 movimentos já gravados dentro de caixas fechados entre abril e
-- 24/08/2026 (R$ 12.292,04, em 41 caixas) NÃO são tocados por esta migration.
-- Mexer neles agora reescreveria fechamentos já impressos.
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
  -- Novo: o movimento caiu na gaveta do próprio dia do atendimento?
  v_caiu_no_dia  boolean := false;
  -- Novo: tipo efetivamente gravado, que pode ser rebaixado para 'registro'.
  v_tipo_mov     public.caixa_mov_tipo;
  v_virou_registro boolean := false;
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
    v_tipo_mov  := (p_movimento->>'tipo')::public.caixa_mov_tipo;
    IF v_user_id IS NULL THEN
      RAISE EXCEPTION 'user_id é obrigatório em p_movimento quando presente';
    END IF;

    IF (p_movimento ? 'forcar_sessao_hoje') THEN
      v_forcar_hoje := COALESCE((p_movimento->>'forcar_sessao_hoje')::boolean, true);
    END IF;

    -- 1) Lançamento retroativo cujo caixa daquele dia AINDA ESTÁ ABERTO: pode
    --    entrar nele com valor cheio. Nada foi conferido nem impresso, então
    --    não há cupom a contradizer, e o dinheiro fica no dia a que pertence.
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
        v_ts_mov      := (v_data_lanc::text || ' 12:00:00-03')::timestamptz;
        v_caiu_no_dia := true;
      END IF;
    END IF;

    -- 2) Caso normal e também o retroativo de um dia já FECHADO: a linha entra
    --    no caixa de hoje. Um fechamento já conferido nunca é reescrito.
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

    -- 3) NOVO: retroativo que não coube na gaveta do próprio dia não pode
    --    somar na gaveta de hoje. Vira linha de histórico: aparece no extrato
    --    e no cupom de hoje, e vale R$ 0,00 no dinheiro esperado.
    --
    --    Só 'recebimento' e 'despesa' são rebaixados; 'registro' já é o que
    --    queremos e os demais tipos (sangria, suprimento, abertura…) não
    --    chegam por este caminho.
    IF v_retroativo
       AND NOT v_caiu_no_dia
       AND v_tipo_mov IN ('recebimento'::public.caixa_mov_tipo,
                          'despesa'::public.caixa_mov_tipo)
    THEN
      v_tipo_mov       := 'registro'::public.caixa_mov_tipo;
      v_virou_registro := true;
    END IF;

    INSERT INTO public.caixa_movimentos (
      sessao_id, clinica_id, user_id, tipo, valor, descricao,
      forma_pagamento, lancamento_id, created_at
    )
    VALUES (
      v_sess_id, v_clinica_id, v_user_id,
      v_tipo_mov,
      v_valor_mov,
      -- A marca "[Data retroativa: DD/MM/AAAA]" é lida por `dataRetroativaDe`
      -- no cliente e o formato dela não pode mudar. O aviso extra vai depois
      -- do colchete, fora da expressão que o cliente procura.
      CASE
        WHEN v_virou_registro
          THEN (p_movimento->>'descricao')
               || format(' [Data retroativa: %s]', to_char(v_data_lanc, 'DD/MM/YYYY'))
               || ' — não entra no caixa de hoje'
        WHEN v_retroativo
          THEN (p_movimento->>'descricao')
               || format(' [Data retroativa: %s]', to_char(v_data_lanc, 'DD/MM/YYYY'))
        ELSE p_movimento->>'descricao'
      END,
      p_movimento->>'forma_pagamento',
      v_lanc_id,
      v_ts_mov
    )
    RETURNING id INTO v_mov_id;
  END IF;

  RETURN jsonb_build_object(
    'lancamento_id',  v_lanc_id,
    'movimento_id',   v_mov_id,
    'sessao_id',      v_sess_id,
    'sessao_criada',  v_sess_criada,
    'retroativo',     v_retroativo,
    -- Novos campos: o cliente pode avisar o operador do que aconteceu.
    'caiu_no_dia',    v_caiu_no_dia,
    'virou_registro', v_virou_registro
  );
END;
$function$;
