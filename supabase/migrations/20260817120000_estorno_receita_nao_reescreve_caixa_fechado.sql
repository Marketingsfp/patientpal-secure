-- Estorno de receita: a saída no caixa não pode mais cair numa sessão já
-- fechada.
--
-- Problema corrigido: a versão anterior inseria o movimento de estorno sempre
-- na MESMA sessão de caixa do recebimento original, mesmo que aquela sessão já
-- estivesse fechada e conferida há semanas. Efeito prático em produção: 26
-- saídas de estorno entraram em caixas fechados (17 delas em dinheiro, R$
-- 2.088,00). O dia antigo, já conferido, passa a mostrar sobra; o dia em que o
-- dinheiro realmente saiu da gaveta fica com falta e sem explicação. A tela de
-- solicitação inclusive prometia o contrário ao usuário ("a devolução será
-- lançada na data informada, sem alterar o fechamento anterior").
--
-- Regra nova, igual à que estornar_sangria já aplicava:
--   * sessão do recebimento ainda aberta  -> lança nela (comportamento atual);
--   * sessão fechada                      -> lança no caixa aberto atual (o do
--                                            próprio usuário; se não houver, o
--                                            da clínica) e devolve o aviso
--                                            'lancado_em_sessao_atual';
--   * sessão fechada e nenhum caixa aberto -> não estorna nada e explica o
--                                            motivo, em vez de reescrever um
--                                            fechamento antigo em silêncio.
--
-- A deduplicação (não lançar dois estornos para o mesmo recebimento) deixou de
-- se apoiar em sessao_id — que agora pode mudar — e passa a comparar forma de
-- pagamento e valor, contando quantos já existem. Assim um pagamento misto com
-- duas parcelas idênticas continua sendo estornado nas duas.

CREATE OR REPLACE FUNCTION public.estornar_lancamento_receita(_lancamento_id uuid, _clinica_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_lanc record; v_atd_repasse_pago boolean; v_ag_id uuid; v_mens_id uuid;
  v_uid uuid := auth.uid();
  v_autorizado boolean;
  v_precisa_fallback boolean;
  v_sessao_aberta uuid;
  v_aviso text := null;
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  select
    public.can_manage_clinica(v_uid, _clinica_id)
    or exists (
      select 1 from public.clinica_memberships m
      where m.user_id = v_uid
        and m.clinica_id = _clinica_id
        and m.ativo = true
        and m.role in ('admin','gestor','financeiro')
    )
  into v_autorizado;

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

  -- Algum recebimento ainda por estornar está numa sessão fechada?
  select exists (
    with recebimentos as (
      select r.id, r.forma_pagamento, r.valor, s.status as sessao_status,
             row_number() over (
               partition by r.forma_pagamento, r.valor order by r.created_at, r.id
             ) as rn
      from caixa_movimentos r
      join caixa_sessoes s on s.id = r.sessao_id
      where r.lancamento_id = v_lanc.id and r.tipo = 'recebimento'
    ),
    ja_estornados as (
      select e.forma_pagamento, e.valor, count(*) as n
      from caixa_movimentos e
      where e.lancamento_id = v_lanc.id
        and (
          e.tipo = 'estorno'
          or (e.tipo = 'sangria' and lower(coalesce(e.descricao, '')) like 'estorno%')
        )
      group by e.forma_pagamento, e.valor
    )
    select 1
    from recebimentos r
    left join ja_estornados j
      on j.forma_pagamento is not distinct from r.forma_pagamento and j.valor = r.valor
    where r.rn > coalesce(j.n, 0) and r.sessao_status <> 'aberto'
  ) into v_precisa_fallback;

  if v_precisa_fallback then
    -- Preferência pelo caixa aberto do próprio usuário; senão, qualquer caixa
    -- aberto da clínica.
    select id into v_sessao_aberta from caixa_sessoes
    where clinica_id = v_lanc.clinica_id and user_id = v_uid and status = 'aberto'
    order by aberto_em desc limit 1;
    if v_sessao_aberta is null then
      select id into v_sessao_aberta from caixa_sessoes
      where clinica_id = v_lanc.clinica_id and status = 'aberto'
      order by aberto_em desc limit 1;
    end if;
    if v_sessao_aberta is null then
      return jsonb_build_object('ok', false, 'motivo', 'sem_sessao_aberta',
        'mensagem', 'O caixa do pagamento original já foi fechado e não há nenhum caixa aberto para lançar a devolução. Abra um caixa e tente novamente.');
    end if;
    v_aviso := 'lancado_em_sessao_atual';
  end if;

  update fin_lancamentos set status = 'cancelado' where id = v_lanc.id;

  -- Registra a devolução como 'estorno' (não 'sangria'): é dinheiro que sai
  -- do caixa para o paciente, não uma retirada operacional. Linhas antigas
  -- cadastradas como 'sangria' com descrição "Estorno —" também contam como
  -- já estornadas, para não duplicar.
  with recebimentos as (
    select r.sessao_id, r.clinica_id, r.user_id, r.valor, r.descricao,
           r.forma_pagamento, r.lancamento_id, s.status as sessao_status,
           row_number() over (
             partition by r.forma_pagamento, r.valor order by r.created_at, r.id
           ) as rn
    from caixa_movimentos r
    join caixa_sessoes s on s.id = r.sessao_id
    where r.lancamento_id = v_lanc.id and r.tipo = 'recebimento'
  ),
  ja_estornados as (
    select e.forma_pagamento, e.valor, count(*) as n
    from caixa_movimentos e
    where e.lancamento_id = v_lanc.id
      and (
        e.tipo = 'estorno'
        or (e.tipo = 'sangria' and lower(coalesce(e.descricao, '')) like 'estorno%')
      )
    group by e.forma_pagamento, e.valor
  )
  insert into caixa_movimentos (sessao_id, clinica_id, user_id, tipo, valor, descricao, forma_pagamento, lancamento_id)
  select
    case when r.sessao_status = 'aberto' then r.sessao_id else v_sessao_aberta end,
    r.clinica_id, r.user_id, 'estorno', r.valor,
    trim('Estorno — ' || coalesce(r.descricao, '')), r.forma_pagamento, r.lancamento_id
  from recebimentos r
  left join ja_estornados j
    on j.forma_pagamento is not distinct from r.forma_pagamento and j.valor = r.valor
  where r.rn > coalesce(j.n, 0);

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

GRANT EXECUTE ON FUNCTION public.estornar_lancamento_receita(uuid, uuid) TO authenticated;
