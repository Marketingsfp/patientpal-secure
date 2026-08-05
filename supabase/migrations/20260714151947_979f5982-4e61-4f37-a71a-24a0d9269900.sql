-- MED-16: estornarLancamentoReceita (src/lib/estornar-lancamento.ts) fazia
-- o estorno em varias chamadas client-side separadas: cancelar o
-- lancamento, reverter o recebimento no caixa (silenciosa — so
-- console.warn se falhasse) e reabrir o agendamento OU a mensalidade. Se a
-- ultima etapa falhasse, o lancamento ja tinha sido cancelado (commitado) —
-- sobrava inconsistencia entre "financeiro estornado" e "agendamento/
-- mensalidade ainda mostrado como pago", e a falha da reversao no caixa
-- nunca chegava a virar um aviso visivel pro usuario.
--
-- Move o estorno inteiro para uma unica transacao Postgres.
create or replace function public.estornar_lancamento_receita(
  _lancamento_id uuid,
  _clinica_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_lanc record;
  v_atd_repasse_pago boolean;
  v_ag_id uuid;
  v_mens_id uuid;
begin
  select id, agendamento_id, valor, descricao, repasse_pago
  into v_lanc
  from fin_lancamentos
  where id = _lancamento_id
  for update;

  if v_lanc.id is null then
    return jsonb_build_object('ok', true, 'motivo', 'nao_encontrado');
  end if;

  select repasse_pago into v_atd_repasse_pago
  from fin_atendimentos
  where lancamento_id = _lancamento_id
  limit 1;

  if coalesce(v_atd_repasse_pago, false) or coalesce(v_lanc.repasse_pago, false) then
    return jsonb_build_object(
      'ok', false,
      'motivo', 'repasse_pago',
      'mensagem', 'Repasse já pago — estorne o pagamento do repasse primeiro.'
    );
  end if;

  -- Não usamos DELETE: a policy fin_lanc_delete só permite admin/gestor —
  -- para financeiro o DELETE não retorna erro mas afeta 0 linhas, deixando
  -- o pagamento "vivo". status='cancelado' é o que o resto do sistema filtra.
  update fin_lancamentos set status = 'cancelado' where id = v_lanc.id;

  -- Reverte recebimentos de caixa vinculados (sangria na mesma sessão),
  -- ignorando os que já têm uma sangria de estorno anterior.
  insert into caixa_movimentos (
    sessao_id, clinica_id, user_id, tipo, valor, descricao, forma_pagamento, lancamento_id
  )
  select r.sessao_id, r.clinica_id, r.user_id, 'sangria', r.valor,
         trim('Estorno — ' || coalesce(r.descricao, '')), r.forma_pagamento, r.lancamento_id
  from caixa_movimentos r
  where r.lancamento_id = v_lanc.id
    and r.tipo = 'recebimento'
    and not exists (
      select 1 from caixa_movimentos s
      where s.lancamento_id = v_lanc.id
        and s.tipo = 'sangria'
        and s.sessao_id = r.sessao_id
        and lower(coalesce(s.descricao, '')) like 'estorno%'
    );

  v_ag_id := v_lanc.agendamento_id;
  if v_ag_id is not null then
    -- Atendimento vindo da agenda: reabre a ficha (libera o horário).
    update agendamentos set
      status = 'agendado',
      fluxo_etapa = 'aguardando_recepcao',
      fluxo_atualizado_em = now()
    where id = v_ag_id;
  else
    -- Receita avulsa (ex.: mensalidade de contrato): reverte a parcela
    -- vinculada para "pendente", se houver.
    select id into v_mens_id from contrato_mensalidades where lancamento_id = v_lanc.id limit 1;
    if v_mens_id is not null then
      update contrato_mensalidades set
        status = 'pendente',
        pago_em = null,
        forma_pagamento = null,
        valor_pago = null,
        lancamento_id = null
      where id = v_mens_id;
    end if;
  end if;

  return jsonb_build_object(
    'ok', true,
    'agendamento_id', v_ag_id,
    'mensalidade_id', v_mens_id,
    'valor', v_lanc.valor
  );
end;
$$;

revoke execute on function public.estornar_lancamento_receita(uuid,uuid) from public;
revoke execute on function public.estornar_lancamento_receita(uuid,uuid) from anon;
grant execute on function public.estornar_lancamento_receita(uuid,uuid) to authenticated;
