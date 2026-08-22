-- ---------------------------------------------------------------------------
-- Estorno de sangria: a devolução tem que voltar para o caixa de quem operou
--
-- Problema corrigido: estornar_sangria gravava o suprimento de compensação com
-- user_id = auth.uid(), ou seja, a pessoa que CLICOU no estorno (na prática um
-- admin), e não a dona da sessão de caixa onde o dinheiro voltou.
--
-- A política de RLS de caixa_movimentos (cx_mov_select) deixa o operador comum
-- enxergar apenas as linhas com user_id = auth.uid(). Resultado: a devolução
-- ficava invisível para a própria atendente. Na tela dela o dinheiro só tinha
-- saído, e o saldo em espécie do turno fechava negativo — o que a trava de
-- "forma de pagamento negativa" impede de fechar, com razão.
--
-- Caso real, Suellen em 21/08/2026 (sessão 37ee1bb0-c084-422d-b4ec-e12ff17d5ef5):
--   recebido em dinheiro ....... 6.208,38
--   sangrias (4.000 + 1.600 + 608,38) .. 6.208,38  -> gaveta zerada
--   estorno de sangria (suprimento) ....  608,38   <- gravado no admin
--   estorno de recebimento .............  120,00
-- Um admin via 488,38 na mesma sessão; ela via -120,00 e não conseguia fechar.
--
-- A correção grava o suprimento no dono da sessão de destino. Quem executou o
-- estorno continua registrado no audit_log, que é o lugar certo para isso — a
-- autoria da ação não deve mudar de dono o dinheiro da gaveta.
--
-- Nada mais da função muda: autorização, deduplicação, escolha da sessão de
-- destino e retorno seguem idênticos.
-- ---------------------------------------------------------------------------

create or replace function public.estornar_sangria(
  _movimento_id uuid,
  _clinica_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
DECLARE
  v_mov              public.caixa_movimentos%ROWTYPE;
  v_sessao_status    text;
  v_sessao_alvo      uuid;
  v_aviso            text := NULL;
  v_user             uuid := auth.uid();
  v_novo_id          uuid;
  v_ja_estornado     boolean;
  v_desc_estorno     text;
  v_dono_sessao      uuid;
BEGIN
  PERFORM set_config('app.actor_source', 'estornar_sangria', true);
  IF v_user IS NULL THEN RAISE EXCEPTION 'Usuário não autenticado'; END IF;
  SELECT * INTO v_mov FROM public.caixa_movimentos WHERE id = _movimento_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'motivo', 'nao_encontrado', 'mensagem', 'Movimento de caixa não encontrado.'); END IF;
  IF _clinica_id IS NOT NULL AND v_mov.clinica_id <> _clinica_id THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'clinica_divergente', 'mensagem', 'Movimento pertence a outra clínica.');
  END IF;

  -- ===== AUTORIZAÇÃO (novo) ===============================================
  -- Conferida contra a clínica REAL do movimento (v_mov.clinica_id), nunca
  -- contra o parâmetro — que é opcional e vem de quem chama.
  IF NOT EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.user_id = v_user AND m.clinica_id = v_mov.clinica_id AND m.ativo = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_acesso',
      'mensagem', 'Você não tem acesso a esta clínica.');
  END IF;

  IF NOT public.has_module_access(v_user, v_mov.clinica_id, 'financeiro', 'write') THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'sem_permissao',
      'mensagem', 'Você não tem permissão para estornar sangria (módulo financeiro).');
  END IF;
  -- ========================================================================

  IF v_mov.tipo <> 'sangria' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tipo_invalido', 'mensagem', 'Este movimento não é uma sangria.');
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.caixa_movimentos WHERE tipo = 'suprimento' AND clinica_id = v_mov.clinica_id AND descricao LIKE ('[ESTORNO DE SANGRIA #' || v_mov.id::text || ']%')) INTO v_ja_estornado;
  IF v_ja_estornado THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_estornado', 'mensagem', 'Esta sangria já foi estornada anteriormente.');
  END IF;
  SELECT status INTO v_sessao_status FROM public.caixa_sessoes WHERE id = v_mov.sessao_id;
  IF v_sessao_status = 'aberto' THEN
    v_sessao_alvo := v_mov.sessao_id;
  ELSE
    SELECT id INTO v_sessao_alvo FROM public.caixa_sessoes WHERE clinica_id = v_mov.clinica_id AND user_id = v_user AND status = 'aberto' ORDER BY aberto_em DESC LIMIT 1;
    IF v_sessao_alvo IS NULL THEN
      SELECT id INTO v_sessao_alvo FROM public.caixa_sessoes WHERE clinica_id = v_mov.clinica_id AND status = 'aberto' ORDER BY aberto_em DESC LIMIT 1;
    END IF;
    IF v_sessao_alvo IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'motivo', 'sem_sessao_aberta', 'mensagem', 'Sessão original fechada e não há caixa aberto para lançar a compensação. Abra um caixa e tente novamente.');
    END IF;
    v_aviso := 'lancado_em_sessao_atual';
  END IF;
  -- Dono do caixa que RECEBE a devolucao. Sem isso a linha nasce no user_id
  -- de quem clicou e a RLS a esconde justamente de quem precisa fechar.
  SELECT user_id INTO v_dono_sessao FROM public.caixa_sessoes WHERE id = v_sessao_alvo;
  IF v_dono_sessao IS NULL THEN v_dono_sessao := v_user; END IF;
  v_desc_estorno := '[ESTORNO DE SANGRIA #' || v_mov.id::text || '] ' || COALESCE(v_mov.descricao, 'Sangria');
  INSERT INTO public.caixa_movimentos (sessao_id, clinica_id, user_id, tipo, valor, descricao, forma_pagamento, destino_user_id, destino_nome)
  VALUES (v_sessao_alvo, v_mov.clinica_id, v_dono_sessao, 'suprimento', v_mov.valor, v_desc_estorno, v_mov.forma_pagamento, v_mov.destino_user_id, v_mov.destino_nome)
  RETURNING id INTO v_novo_id;
  BEGIN
    INSERT INTO public.audit_log (clinica_id, user_id, action, table_name, record_id, dados_antes, dados_depois)
    VALUES (v_mov.clinica_id, v_user, 'ESTORNO_SANGRIA', 'caixa_movimentos', v_mov.id::text, to_jsonb(v_mov), jsonb_build_object('novo_movimento_id', v_novo_id, 'sessao_alvo', v_sessao_alvo));
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object('ok', true, 'novo_movimento_id', v_novo_id, 'sessao_alvo', v_sessao_alvo, 'aviso', v_aviso);
END;
$function$;
