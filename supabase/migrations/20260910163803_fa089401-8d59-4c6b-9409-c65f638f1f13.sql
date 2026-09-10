-- Estorno de pagamento de um dia JÁ FECHADO não mexe na gaveta de ninguém,
-- a não ser que alguém esteja devolvendo dinheiro ao paciente agora — e aí
-- sai da gaveta de QUEM DEVOLVE, nunca da de um terceiro.
-- Caso real: caixa da AMANDA FELICIA em 10/09/2026 (estorno de mensalidades
-- pagas em 13/07 caiu na gaveta dela e gerou sobra de R$ 360,00).
--
-- estornar_lancamento_receita:
--   1. Caixa do pagamento ainda ABERTO -> saída nesse mesmo caixa (sem mudança).
--   2. FECHADO e _devolucao_agora = true -> saída no caixa aberto de quem
--      devolve: quem pediu o estorno (solicitação pendente) ou quem clica.
--      Sem caixa aberto dessa pessoa, recusa.
--   3. FECHADO sem devolução -> linha 'registro' (R$ 0,00 na gaveta) no caixa
--      aberto de quem clicou; sem caixa aberto, nenhuma linha.
-- estornar_sangria: sangria de dia fechado vira 'registro'. Corrige a trava de
-- estorno duplo (o marcador é gravado em MAIÚSCULAS; a checagem usava LIKE).
-- Trava: forma de pagamento de linha de ESTORNO não pode ser trocada por
-- usuário logado. Nova função mover_pagamento_mensalidade.

DROP FUNCTION IF EXISTS public.estorno_receita_destinos(uuid, uuid);

CREATE OR REPLACE FUNCTION public.estorno_receita_destinos(
  _lancamento_id uuid,
  _uid uuid,
  _devolucao_agora boolean
)
RETURNS TABLE (
  clinica_id uuid,
  valor numeric,
  descricao text,
  forma_pagamento text,
  lancamento_id uuid,
  sessao_destino uuid,
  dono_destino uuid,
  origem text,
  tipo_mov text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  with recebimentos as (
    select r.id, r.sessao_id, r.clinica_id, r.user_id, r.valor, r.descricao,
           r.forma_pagamento, r.lancamento_id, r.created_at,
           s.status::text as sessao_status,
           row_number() over (
             partition by r.forma_pagamento, r.valor order by r.created_at, r.id
           ) as rn
      from caixa_movimentos r
      join caixa_sessoes    s on s.id = r.sessao_id
     where r.lancamento_id = _lancamento_id
       and r.tipo = 'recebimento'
  ),
  ja_estornados as (
    select e.forma_pagamento, e.valor, count(*) as n
      from caixa_movimentos e
     where e.lancamento_id = _lancamento_id
       and (
         e.tipo = 'estorno'
         or (e.tipo = 'sangria'  and upper(coalesce(e.descricao, '')) like 'ESTORNO%')
         or (e.tipo = 'registro' and upper(coalesce(e.descricao, '')) like 'ESTORNO%')
       )
     group by e.forma_pagamento, e.valor
  ),
  pendentes as (
    select r.*
      from recebimentos r
      left join ja_estornados j
        on j.forma_pagamento is not distinct from r.forma_pagamento
       and j.valor = r.valor
     where r.rn > coalesce(j.n, 0)
  ),
  devolvedor as (
    select coalesce(
      (select es.solicitado_por
         from estorno_solicitacoes es
        where es.lancamento_id = _lancamento_id
          and es.status = 'pendente'
        order by es.solicitado_em desc
        limit 1),
      _uid
    ) as uid
  )
  select p.clinica_id, p.valor, p.descricao, p.forma_pagamento, p.lancamento_id,
         d.sessao_destino, d.dono_destino, d.origem, d.tipo_mov
    from pendentes p
    cross join devolvedor dv
    cross join lateral (
      select
        case when p.sessao_status = 'aberto'          then p.sessao_id
             when coalesce(_devolucao_agora, false)   then s_dev.id
             else s_exec.id end                                         as sessao_destino,
        case when p.sessao_status = 'aberto'          then p.user_id
             when coalesce(_devolucao_agora, false)   then s_dev.user_id
             else s_exec.user_id end                                    as dono_destino,
        case when p.sessao_status = 'aberto'          then 'sessao_original'
             when coalesce(_devolucao_agora, false) and s_dev.id is not null
                                                      then 'caixa_de_quem_devolveu'
             when coalesce(_devolucao_agora, false)   then 'sem_destino'
             when s_exec.id is not null               then 'registro_no_caixa_do_executor'
             else 'registro_sem_caixa' end                              as origem,
        case when p.sessao_status = 'aberto' or coalesce(_devolucao_agora, false)
             then 'estorno' else 'registro' end                         as tipo_mov
        from (select 1) base
        left join lateral (
          select s2.id, s2.user_id
            from caixa_sessoes s2
           where s2.clinica_id = p.clinica_id
             and s2.user_id    = dv.uid
             and s2.status     = 'aberto'
           order by s2.aberto_em desc
           limit 1
        ) s_dev on true
        left join lateral (
          select s3.id, s3.user_id
            from caixa_sessoes s3
           where s3.clinica_id = p.clinica_id
             and s3.user_id    = _uid
             and s3.status     = 'aberto'
           order by s3.aberto_em desc
           limit 1
        ) s_exec on true
    ) d;
$function$;

REVOKE ALL ON FUNCTION public.estorno_receita_destinos(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.estorno_receita_destinos(uuid, uuid, boolean) FROM authenticated;
REVOKE ALL ON FUNCTION public.estorno_receita_destinos(uuid, uuid, boolean) FROM anon;

DROP FUNCTION IF EXISTS public.estornar_lancamento_receita(uuid, uuid);

CREATE OR REPLACE FUNCTION public.estornar_lancamento_receita(
  _lancamento_id uuid,
  _clinica_id uuid,
  _devolucao_agora boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_lanc record; v_atd_repasse_pago boolean; v_ag_id uuid; v_mens_id uuid;
  v_uid uuid := auth.uid();
  v_dev boolean := coalesce(_devolucao_agora, false);
  v_autorizado boolean;
  v_e_mensalidade boolean;
  v_sem_destino boolean;
  v_usou_devolvedor boolean;
  v_usou_registro boolean;
  v_nome_devolvedor text;
  v_aviso text := null;
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.contrato_mensalidades where lancamento_id = _lancamento_id
  ) into v_e_mensalidade;

  v_autorizado := public.pode_escrever_modulo(
    v_uid,
    _clinica_id,
    case when v_e_mensalidade
      then ARRAY['cartao-beneficios', 'contratos', 'financeiro', 'financeiro-estorno']
      else ARRAY['financeiro', 'financeiro-estorno']
    end
  );

  if not v_autorizado then
    raise exception 'Sem permissão para estornar nesta clínica' using errcode = '42501';
  end if;

  select id, agendamento_id, valor, descricao, repasse_pago, clinica_id into v_lanc
  from fin_lancamentos where id = _lancamento_id for update;
  if v_lanc.id is null then
    return jsonb_build_object('ok', true, 'motivo', 'nao_encontrado');
  end if;

  if v_lanc.clinica_id is distinct from _clinica_id then
    raise exception 'Lançamento não pertence à clínica informada' using errcode = '42501';
  end if;

  select repasse_pago into v_atd_repasse_pago from fin_atendimentos where lancamento_id = _lancamento_id limit 1;

  if coalesce(v_atd_repasse_pago, false) or coalesce(v_lanc.repasse_pago, false) then
    return jsonb_build_object('ok', false, 'motivo', 'repasse_pago',
      'mensagem', 'Repasse já pago — estorne o pagamento do repasse primeiro.');
  end if;

  select coalesce(bool_or(d.origem = 'sem_destino'), false),
         coalesce(bool_or(d.origem = 'caixa_de_quem_devolveu'), false),
         coalesce(bool_or(d.tipo_mov = 'registro'), false)
    into v_sem_destino, v_usou_devolvedor, v_usou_registro
    from public.estorno_receita_destinos(v_lanc.id, v_uid, v_dev) d;

  if v_sem_destino then
    select p.nome into v_nome_devolvedor
      from profiles p
     where p.id = coalesce(
       (select es.solicitado_por from estorno_solicitacoes es
         where es.lancamento_id = v_lanc.id and es.status = 'pendente'
         order by es.solicitado_em desc limit 1),
       v_uid);
    return jsonb_build_object('ok', false, 'motivo', 'sem_sessao_aberta',
      'mensagem', 'O caixa deste pagamento já foi fechado. Para registrar a devolução ao paciente, '
        || coalesce(v_nome_devolvedor, 'quem vai devolver o valor')
        || ' precisa estar com o caixa aberto — a saída sai da gaveta de quem devolve.');
  end if;

  if v_usou_devolvedor then
    v_aviso := 'lancado_no_caixa_de_quem_devolveu';
  elsif v_usou_registro then
    v_aviso := 'registrado_sem_mexer_na_gaveta';
  end if;

  update fin_lancamentos set status = 'cancelado' where id = v_lanc.id;

  insert into caixa_movimentos (sessao_id, clinica_id, user_id, tipo, valor, descricao, forma_pagamento, lancamento_id)
  select d.sessao_destino, d.clinica_id, d.dono_destino, d.tipo_mov::public.caixa_mov_tipo, d.valor,
         case when d.tipo_mov = 'registro'
              then trim('Estorno — ' || coalesce(d.descricao, '')
                        || ' — pagamento de dia já fechado, sem devolução (não entra na gaveta)')
              else trim('Estorno — ' || coalesce(d.descricao, '')) end,
         d.forma_pagamento, d.lancamento_id
    from public.estorno_receita_destinos(v_lanc.id, v_uid, v_dev) d
   where d.sessao_destino is not null;

  v_ag_id := v_lanc.agendamento_id;
  if v_ag_id is not null then
    update agendamentos set status = 'agendado', fluxo_etapa = 'aguardando_recepcao', fluxo_atualizado_em = now()
    where id = v_ag_id;
  else
    select id into v_mens_id from contrato_mensalidades where lancamento_id = v_lanc.id limit 1;
    if v_mens_id is not null then
      update contrato_mensalidades set status = 'pendente', pago_em = null, forma_pagamento = null,
        valor_pago = null, lancamento_id = null where id = v_mens_id;
    end if;
  end if;

  return jsonb_build_object('ok', true, 'agendamento_id', v_ag_id, 'mensalidade_id', v_mens_id,
    'valor', v_lanc.valor, 'aviso', v_aviso);
end; $function$;

REVOKE ALL ON FUNCTION public.estornar_lancamento_receita(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.estornar_lancamento_receita(uuid, uuid, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION public.estornar_lancamento_receita(uuid, uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.estornar_sangria(
  _movimento_id uuid,
  _clinica_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_mov              public.caixa_movimentos%ROWTYPE;
  v_sessao_status    text;
  v_sessao_alvo      uuid;
  v_tipo             public.caixa_mov_tipo;
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

  IF v_mov.tipo <> 'sangria' THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'tipo_invalido', 'mensagem', 'Este movimento não é uma sangria.');
  END IF;

  SELECT EXISTS (
           SELECT 1 FROM public.caixa_movimentos
            WHERE tipo IN ('suprimento', 'registro')
              AND clinica_id = v_mov.clinica_id
              AND descricao ILIKE ('[ESTORNO DE SANGRIA #' || v_mov.id::text || ']%'))
      OR EXISTS (
           SELECT 1 FROM public.audit_log
            WHERE action = 'ESTORNO_SANGRIA' AND record_id = v_mov.id::text)
    INTO v_ja_estornado;
  IF v_ja_estornado THEN
    RETURN jsonb_build_object('ok', false, 'motivo', 'ja_estornado', 'mensagem', 'Esta sangria já foi estornada anteriormente.');
  END IF;

  SELECT status::text INTO v_sessao_status
    FROM public.caixa_sessoes WHERE id = v_mov.sessao_id;

  v_desc_estorno := '[ESTORNO DE SANGRIA #' || v_mov.id::text || '] ' || COALESCE(v_mov.descricao, 'Sangria');

  IF v_sessao_status = 'aberto' THEN
    v_sessao_alvo := v_mov.sessao_id;
    v_tipo := 'suprimento';
  ELSE
    SELECT id INTO v_sessao_alvo FROM public.caixa_sessoes
     WHERE clinica_id = v_mov.clinica_id AND user_id = v_user AND status = 'aberto'
     ORDER BY aberto_em DESC LIMIT 1;
    v_tipo := 'registro';
    v_desc_estorno := v_desc_estorno || ' — sangria de dia já fechado (não entra na gaveta)';
    v_aviso := 'registrado_sem_mexer_na_gaveta';
  END IF;

  IF v_sessao_alvo IS NOT NULL THEN
    SELECT user_id INTO v_dono_sessao FROM public.caixa_sessoes WHERE id = v_sessao_alvo;
    INSERT INTO public.caixa_movimentos (sessao_id, clinica_id, user_id, tipo, valor, descricao, forma_pagamento, destino_user_id, destino_nome)
    VALUES (v_sessao_alvo, v_mov.clinica_id, COALESCE(v_dono_sessao, v_user), v_tipo, v_mov.valor, v_desc_estorno, v_mov.forma_pagamento, v_mov.destino_user_id, v_mov.destino_nome)
    RETURNING id INTO v_novo_id;
  END IF;

  BEGIN
    INSERT INTO public.audit_log (clinica_id, user_id, action, table_name, record_id, dados_antes, dados_depois)
    VALUES (v_mov.clinica_id, v_user, 'ESTORNO_SANGRIA', 'caixa_movimentos', v_mov.id::text, to_jsonb(v_mov),
            jsonb_build_object('novo_movimento_id', v_novo_id, 'sessao_alvo', v_sessao_alvo, 'tipo', v_tipo));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('ok', true, 'novo_movimento_id', v_novo_id, 'sessao_alvo', v_sessao_alvo, 'aviso', v_aviso);
END;
$function$;

CREATE OR REPLACE FUNCTION public.fn_caixa_mov_trava_forma_estorno()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL
     AND OLD.tipo = 'estorno'
     AND NEW.forma_pagamento IS DISTINCT FROM OLD.forma_pagamento THEN
    RAISE EXCEPTION 'A forma de pagamento de um estorno segue o pagamento original e não pode ser trocada. Se a gaveta não bate, chame o supervisor.'
      USING errcode = '42501';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_caixa_mov_trava_forma_estorno ON public.caixa_movimentos;
CREATE TRIGGER trg_caixa_mov_trava_forma_estorno
  BEFORE UPDATE OF forma_pagamento ON public.caixa_movimentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_caixa_mov_trava_forma_estorno();

CREATE OR REPLACE FUNCTION public.mover_pagamento_mensalidade(_de uuid, _para uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid  uuid := auth.uid();
  v_de   public.contrato_mensalidades%ROWTYPE;
  v_para public.contrato_mensalidades%ROWTYPE;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado' USING errcode = '42501';
  END IF;
  IF _de = _para THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'Escolha uma parcela diferente.');
  END IF;

  SELECT * INTO v_de   FROM public.contrato_mensalidades WHERE id = _de   FOR UPDATE;
  SELECT * INTO v_para FROM public.contrato_mensalidades WHERE id = _para FOR UPDATE;
  IF v_de.id IS NULL OR v_para.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'Parcela não encontrada.');
  END IF;
  IF v_de.contrato_id IS DISTINCT FROM v_para.contrato_id THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'As duas parcelas precisam ser do mesmo contrato.');
  END IF;
  IF NOT public.pode_escrever_modulo(v_uid, v_de.clinica_id,
       ARRAY['cartao-beneficios', 'contratos', 'financeiro']) THEN
    RAISE EXCEPTION 'Sem permissão para alterar parcelas nesta clínica' USING errcode = '42501';
  END IF;
  IF v_de.status <> 'pago' THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'A parcela de origem não está paga.');
  END IF;
  IF v_para.status <> 'pendente' THEN
    RETURN jsonb_build_object('ok', false, 'mensagem', 'A parcela de destino precisa estar em aberto.');
  END IF;

  UPDATE public.contrato_mensalidades
     SET status = 'pendente', pago_em = NULL, forma_pagamento = NULL,
         valor_pago = NULL, lancamento_id = NULL
   WHERE id = v_de.id;

  UPDATE public.contrato_mensalidades
     SET status = 'pago', pago_em = v_de.pago_em, forma_pagamento = v_de.forma_pagamento,
         valor_pago = v_de.valor_pago, lancamento_id = v_de.lancamento_id
   WHERE id = v_para.id;

  RETURN jsonb_build_object('ok', true,
    'parcela_origem', v_de.numero_parcela, 'parcela_destino', v_para.numero_parcela);
END;
$function$;

REVOKE ALL ON FUNCTION public.mover_pagamento_mensalidade(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mover_pagamento_mensalidade(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.mover_pagamento_mensalidade(uuid, uuid) TO authenticated;