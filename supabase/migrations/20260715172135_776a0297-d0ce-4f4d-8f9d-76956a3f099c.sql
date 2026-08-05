create or replace function public.finalizar_pagamento_agrupado(
  _clinica_id uuid,
  _grupo_id uuid,
  _forma_pagamento text,
  _criado_por uuid,
  _itens jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_principal_ag_id uuid;
  v_principal_lanc_id uuid;
  v_principal_criado_por uuid;
  v_mov_principal record;
  v_item jsonb;
  v_lanc_id uuid;
  v_extra_lanc_ids uuid[] := '{}';
  v_ag_id uuid;
  v_ag_medico uuid;
  v_ag_paciente uuid;
  i int;
  n int;
begin
  n := jsonb_array_length(_itens);
  if n < 2 then
    raise exception 'Pagamento agrupado precisa de ao menos 2 atendimentos.';
  end if;

  v_principal_ag_id := (_itens->0->>'agendamento_id')::uuid;

  select id, criado_por into v_principal_lanc_id, v_principal_criado_por
  from fin_lancamentos
  where clinica_id = _clinica_id
    and agendamento_id = v_principal_ag_id
    and tipo = 'receita'
    and status = 'confirmado'
  order by created_at desc
  limit 1
  for update;

  if v_principal_lanc_id is null then
    raise exception 'Lançamento principal não encontrado para o agendamento %.', v_principal_ag_id;
  end if;

  update fin_lancamentos set
    valor = (_itens->0->>'valor')::numeric,
    grupo_pagamento_id = _grupo_id,
    descricao = _itens->0->>'descricao',
    observacoes = _itens->0->>'observacoes',
    criado_por = coalesce(v_principal_criado_por, _criado_por)
  where id = v_principal_lanc_id;

  for i in 1 .. n - 1 loop
    v_item := _itens->i;
    v_ag_id := (v_item->>'agendamento_id')::uuid;

    -- Herda médico e paciente do próprio agendamento do item; sem isso,
    -- a coluna Médico do Movimento de Caixa e o Paciente ficavam vazios
    -- nas linhas do rateio a partir do 2º item.
    select medico_id, paciente_id
      into v_ag_medico, v_ag_paciente
    from agendamentos
    where id = v_ag_id;

    insert into fin_lancamentos (
      clinica_id, tipo, descricao, valor, data, forma_pagamento, status,
      agendamento_id, grupo_pagamento_id, criado_por, observacoes,
      medico_id, paciente_id
    ) values (
      _clinica_id, 'receita', v_item->>'descricao', (v_item->>'valor')::numeric,
      current_date, _forma_pagamento, 'confirmado',
      v_ag_id, _grupo_id,
      coalesce(v_principal_criado_por, _criado_por), v_item->>'observacoes',
      v_ag_medico, v_ag_paciente
    ) returning id into v_lanc_id;
    v_extra_lanc_ids := array_append(v_extra_lanc_ids, v_lanc_id);
  end loop;

  select id, sessao_id, clinica_id, user_id, forma_pagamento
  into v_mov_principal
  from caixa_movimentos
  where lancamento_id = v_principal_lanc_id
  order by created_at desc
  limit 1;

  if v_mov_principal.id is not null then
    update caixa_movimentos set
      valor = (_itens->0->>'valor')::numeric,
      descricao = _itens->0->>'descricao'
    where id = v_mov_principal.id;

    for i in 1 .. n - 1 loop
      v_item := _itens->i;
      insert into caixa_movimentos (
        sessao_id, clinica_id, user_id, tipo, valor, descricao, forma_pagamento, lancamento_id
      ) values (
        v_mov_principal.sessao_id, v_mov_principal.clinica_id, v_mov_principal.user_id,
        'recebimento', (v_item->>'valor')::numeric, v_item->>'descricao',
        v_mov_principal.forma_pagamento, v_extra_lanc_ids[i]
      );
    end loop;
  end if;

  -- Backfill: lançamentos extras antigos deste mesmo grupo sem medico/paciente
  -- herdam do agendamento vinculado. Idempotente: só preenche onde está nulo.
  update fin_lancamentos f set
    medico_id = coalesce(f.medico_id, a.medico_id),
    paciente_id = coalesce(f.paciente_id, a.paciente_id)
  from agendamentos a
  where f.agendamento_id = a.id
    and f.grupo_pagamento_id = _grupo_id
    and (f.medico_id is null or f.paciente_id is null);

  return jsonb_build_object(
    'principal_lancamento_id', v_principal_lanc_id,
    'extra_lancamento_ids', to_jsonb(v_extra_lanc_ids)
  );
end;
$$;

revoke execute on function public.finalizar_pagamento_agrupado(uuid,uuid,text,uuid,jsonb) from public;
revoke execute on function public.finalizar_pagamento_agrupado(uuid,uuid,text,uuid,jsonb) from anon;
grant execute on function public.finalizar_pagamento_agrupado(uuid,uuid,text,uuid,jsonb) to authenticated;

-- Backfill global: corrige linhas de rateio antigas (todos os grupos) que
-- ficaram sem medico_id/paciente_id devido à versão anterior da RPC.
update fin_lancamentos f set
  medico_id = coalesce(f.medico_id, a.medico_id),
  paciente_id = coalesce(f.paciente_id, a.paciente_id)
from agendamentos a
where f.agendamento_id = a.id
  and f.grupo_pagamento_id is not null
  and (f.medico_id is null or f.paciente_id is null);