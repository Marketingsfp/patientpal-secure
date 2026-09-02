-- Guia retroativa deixa de reabrir o caixa de quem ja fechou.
--
-- Quando alguem registra uma guia retroativa ja paga e o operador nao tem mais
-- caixa aberto, fn_registrar_lancamento_e_caixa abria um caixa novo so para
-- pendurar a linha de 'registro' (que vale R$ 0,00 na gaveta). Esse caixa nunca
-- era fechado e a tela passava a cobrar o fechamento todo dia, para sempre.
-- Aconteceu com a SUELLEN em 01/09: fechou 17:04, e as 17:11 um retroativo
-- reabriu um caixa fantasma no nome dela.
--
-- Agora, quando a propria chamada precisa CRIAR o caixa e a linha que entra e de
-- 'registro', o caixa e fechado zerado na mesma transacao. O rastro continua no
-- extrato do dia; ninguem herda um caixa aberto que nao abriu. A trava
-- v_sess_criada garante que um caixa em uso nunca e fechado.
--
-- Ver APLICAR-CAIXA-FANTASMA-DE-REGISTRO-2026-09-02.sql na raiz do projeto.

CREATE OR REPLACE FUNCTION public.fn_registrar_lancamento_e_caixa(
  p_lancamento jsonb,
  p_movimento  jsonb DEFAULT NULL::jsonb
)
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
  v_caiu_no_dia  boolean := false;
  v_tipo_mov     public.caixa_mov_tipo;
  v_virou_registro boolean := false;
  -- NOVO: o caixa criado por esta chamada foi fechado na hora?
  v_sess_autofechada boolean := false;
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

  v_data_lanc  := COALESCE((p_lancamento->>'data')::date, v_hoje);
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

    -- 1) Retroativo cujo caixa daquele dia AINDA ESTÁ ABERTO: entra nele.
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

    -- 2) Caso normal e retroativo de dia já fechado: vai para o caixa de hoje.
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

    -- 3) Retroativo que não coube na gaveta do próprio dia vira histórico.
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

    -- ------------------------------------------------------------------
    -- 4) NOVO — caixa fantasma.
    --
    -- Se esta chamada teve de CRIAR o caixa e a única coisa que entrou nele
    -- foi uma linha de 'registro' (R$ 0,00 na gaveta), o caixa não guarda
    -- dinheiro nenhum: ele existe só para o rastro aparecer no extrato.
    -- Deixá-lo aberto faz a tela cobrar para sempre um fechamento que não
    -- tem o que conferir — foi o que aconteceu com a SUELLEN em 01/09.
    --
    -- Fecha zerado aqui mesmo. `v_sess_criada` garante que só fechamos o
    -- caixa que nós acabamos de abrir: um caixa que o operador abriu e está
    -- usando nunca passa por aqui.
    -- ------------------------------------------------------------------
    IF v_sess_criada AND v_tipo_mov = 'registro'::public.caixa_mov_tipo THEN
      INSERT INTO public.caixa_movimentos (
        sessao_id, clinica_id, user_id, tipo, valor, descricao
      )
      VALUES (
        v_sess_id, v_clinica_id, v_user_id,
        'fechamento'::public.caixa_mov_tipo, 0,
        'Fechamento automático — caixa aberto apenas para registrar uma guia já paga antes'
      );

      UPDATE public.caixa_sessoes
         SET status                     = 'fechado'::public.caixa_sessao_status,
             fechado_em                 = now(),
             valor_fechamento_informado = 0,
             valor_fechamento_calculado = 0,
             diferenca                  = 0,
             observacoes = COALESCE(observacoes, '')
                           || ' | Fechado automaticamente: contém apenas linha de registro'
                           || ' (guia retroativa já paga), sem dinheiro na gaveta.'
       WHERE id = v_sess_id;

      v_sess_autofechada := true;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'lancamento_id',   v_lanc_id,
    'movimento_id',    v_mov_id,
    'sessao_id',       v_sess_id,
    'sessao_criada',   v_sess_criada,
    'retroativo',      v_retroativo,
    'caiu_no_dia',     v_caiu_no_dia,
    'virou_registro',  v_virou_registro,
    -- Novo campo: o cliente pode avisar que nenhum caixa ficou pendurado.
    'sessao_autofechada', v_sess_autofechada
  );
END;
$function$;
