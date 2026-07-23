
-- 1) Nova coluna + índice único parcial
ALTER TABLE public.estorno_solicitacoes
  ADD COLUMN IF NOT EXISTS caixa_movimento_id uuid;

CREATE INDEX IF NOT EXISTS idx_estorno_caixa_movimento
  ON public.estorno_solicitacoes (caixa_movimento_id)
  WHERE caixa_movimento_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_estorno_solicitacoes_movimento_pendente
  ON public.estorno_solicitacoes (caixa_movimento_id)
  WHERE status = 'pendente' AND caixa_movimento_id IS NOT NULL;

-- 2) RPC: estorna uma sangria criando um suprimento de compensação
CREATE OR REPLACE FUNCTION public.estornar_sangria(
  _movimento_id uuid,
  _clinica_id   uuid DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mov              public.caixa_movimentos%ROWTYPE;
  v_sessao_status    text;
  v_sessao_alvo      uuid;
  v_aviso            text := NULL;
  v_user             uuid := auth.uid();
  v_novo_id          uuid;
  v_ja_estornado     boolean;
  v_desc_estorno     text;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Usuário não autenticado';
  END IF;

  SELECT * INTO v_mov
  FROM public.caixa_movimentos
  WHERE id = _movimento_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrado',
      'mensagem', 'Movimento de caixa não encontrado.');
  END IF;

  IF _clinica_id IS NOT NULL AND v_mov.clinica_id <> _clinica_id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'clinica_divergente',
      'mensagem', 'Movimento pertence a outra clínica.');
  END IF;

  IF v_mov.tipo <> 'sangria' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tipo_invalido',
      'mensagem', 'Este movimento não é uma sangria.');
  END IF;

  -- Já foi estornado antes?
  SELECT EXISTS (
    SELECT 1 FROM public.caixa_movimentos
    WHERE tipo = 'suprimento'
      AND clinica_id = v_mov.clinica_id
      AND descricao LIKE ('[ESTORNO DE SANGRIA #' || v_mov.id::text || ']%')
  ) INTO v_ja_estornado;

  IF v_ja_estornado THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_estornado',
      'mensagem', 'Esta sangria já foi estornada anteriormente.');
  END IF;

  -- Decide em qual sessão lançar a compensação
  SELECT status INTO v_sessao_status
  FROM public.caixa_sessoes
  WHERE id = v_mov.sessao_id;

  IF v_sessao_status = 'aberto' THEN
    v_sessao_alvo := v_mov.sessao_id;
  ELSE
    -- procura sessão aberta do usuário aprovador na mesma clínica
    SELECT id INTO v_sessao_alvo
    FROM public.caixa_sessoes
    WHERE clinica_id = v_mov.clinica_id
      AND user_id = v_user
      AND status = 'aberto'
    ORDER BY aberto_em DESC
    LIMIT 1;

    IF v_sessao_alvo IS NULL THEN
      -- fallback: qualquer sessão aberta na clínica
      SELECT id INTO v_sessao_alvo
      FROM public.caixa_sessoes
      WHERE clinica_id = v_mov.clinica_id
        AND status = 'aberto'
      ORDER BY aberto_em DESC
      LIMIT 1;
    END IF;

    IF v_sessao_alvo IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'sem_sessao_aberta',
        'mensagem', 'Sessão original fechada e não há caixa aberto para lançar a compensação. Abra um caixa e tente novamente.');
    END IF;

    v_aviso := 'lancado_em_sessao_atual';
  END IF;

  v_desc_estorno := '[ESTORNO DE SANGRIA #' || v_mov.id::text || '] '
                 || COALESCE(v_mov.descricao, 'Sangria');

  INSERT INTO public.caixa_movimentos (
    sessao_id, clinica_id, user_id, tipo, valor, descricao,
    forma_pagamento, destino_user_id, destino_nome
  ) VALUES (
    v_sessao_alvo,
    v_mov.clinica_id,
    v_user,
    'suprimento',
    v_mov.valor,
    v_desc_estorno,
    v_mov.forma_pagamento,
    v_mov.destino_user_id,
    v_mov.destino_nome
  ) RETURNING id INTO v_novo_id;

  -- Auditoria best-effort
  BEGIN
    INSERT INTO public.audit_log (
      clinica_id, user_id, table_name, record_id, action,
      dados_antes, dados_depois
    ) VALUES (
      v_mov.clinica_id, v_user, 'caixa_movimentos', v_mov.id, 'ESTORNO',
      jsonb_build_object(
        'id', v_mov.id, 'tipo', v_mov.tipo, 'valor', v_mov.valor,
        'descricao', v_mov.descricao, 'destino_nome', v_mov.destino_nome,
        'sessao_id', v_mov.sessao_id
      ),
      jsonb_build_object(
        'compensacao_id', v_novo_id, 'sessao_compensacao', v_sessao_alvo,
        'aviso', v_aviso
      )
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok', true,
    'movimento_id', v_mov.id,
    'compensacao_id', v_novo_id,
    'sessao_compensacao', v_sessao_alvo,
    'valor', v_mov.valor,
    'aviso', v_aviso
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.estornar_sangria(uuid, uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.estornar_sangria(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.estornar_sangria(uuid, uuid) TO authenticated;
