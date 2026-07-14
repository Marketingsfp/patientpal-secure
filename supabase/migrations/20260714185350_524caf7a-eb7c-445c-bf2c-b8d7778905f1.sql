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
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  -- Autorização: admin/gestor da clínica OU membro com papel 'financeiro'
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

  -- Garantir que o lançamento pertence à clínica informada
  if v_lanc.clinica_id is distinct from _clinica_id then
    raise exception 'Lançamento não pertence à clínica informada' using errcode = '42501';
  end if;

  select repasse_pago into v_atd_repasse_pago from fin_atendimentos where lancamento_id = _lancamento_id limit 1;
  if coalesce(v_atd_repasse_pago, false) or coalesce(v_lanc.repasse_pago, false) then
    return jsonb_build_object('ok', false, 'motivo', 'repasse_pago',
      'mensagem', 'Repasse já pago — estorne o pagamento do repasse primeiro.');
  end if;

  update fin_lancamentos set status = 'cancelado' where id = v_lanc.id;

  insert into caixa_movimentos (sessao_id, clinica_id, user_id, tipo, valor, descricao, forma_pagamento, lancamento_id)
  select r.sessao_id, r.clinica_id, r.user_id, 'sangria', r.valor,
         trim('Estorno — ' || coalesce(r.descricao, '')), r.forma_pagamento, r.lancamento_id
  from caixa_movimentos r
  where r.lancamento_id = v_lanc.id and r.tipo = 'recebimento'
    and not exists (
      select 1 from caixa_movimentos s
      where s.lancamento_id = v_lanc.id and s.tipo = 'sangria'
        and s.sessao_id = r.sessao_id and lower(coalesce(s.descricao, '')) like 'estorno%'
    );

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

  return jsonb_build_object('ok', true, 'agendamento_id', v_ag_id, 'mensalidade_id', v_mens_id, 'valor', v_lanc.valor);
end; $function$;

GRANT EXECUTE ON FUNCTION public.estornar_lancamento_receita(uuid, uuid) TO authenticated;