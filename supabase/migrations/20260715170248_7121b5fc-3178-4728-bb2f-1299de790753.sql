-- Fix: multi-exame (multi-imagem) sibling rows não herdavam o agenda_id
-- do agendamento principal. Como o cálculo de ficha usa (dia, médico, agenda),
-- a irmã caía num bucket separado e ganhava número 001 fora de ordem.
-- Recria a RPC salvar_agendamento_multi_imagem para copiar o agenda_id
-- do principal (lido logo após o UPDATE/INSERT) para cada linha-irmã.

drop function if exists public.salvar_agendamento_multi_imagem(uuid,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,text[],text,text,date,uuid,text,text,uuid,uuid,text,uuid[]);

create or replace function public.salvar_agendamento_multi_imagem(
  _editing_id uuid,
  _clinica_id uuid,
  _paciente_id uuid,
  _paciente_nome text,
  _medico_id uuid,
  _enfermagem_recurso_id uuid,
  _inicio timestamptz,
  _fim timestamptz,
  _procedimentos text[],
  _status text,
  _observacoes text,
  _data_pagamento date,
  _orcamento_id uuid,
  _tipo_atendimento text,
  _forma_pagamento_prevista text,
  _especialidade_id uuid,
  _grupo_id uuid,
  _paciente_nome_esperado_no_slot text,
  _orcamento_item_ids uuid[] default null
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_principal_id uuid;
  v_principal_agenda_id uuid;
  v_sibling_ids uuid[] := '{}';
  v_new_id uuid;
  i int;
  v_atualizados int;
begin
  if _procedimentos is null or array_length(_procedimentos, 1) is null or array_length(_procedimentos, 1) = 0 then
    raise exception 'Informe ao menos um procedimento.';
  end if;

  if _editing_id is not null then
    update agendamentos set
      paciente_id = _paciente_id,
      paciente_nome = _paciente_nome,
      medico_id = _medico_id,
      enfermagem_recurso_id = _enfermagem_recurso_id,
      inicio = _inicio,
      fim = _fim,
      procedimento = _procedimentos[1],
      status = _status::agendamento_status,
      observacoes = _observacoes,
      data_pagamento = _data_pagamento,
      orcamento_id = _orcamento_id,
      tipo_atendimento = _tipo_atendimento,
      forma_pagamento_prevista = _forma_pagamento_prevista,
      especialidade_id = _especialidade_id,
      atendimento_grupo_id = _grupo_id
    where id = _editing_id
      and (_paciente_nome_esperado_no_slot is null or paciente_nome = _paciente_nome_esperado_no_slot);
    get diagnostics v_atualizados = row_count;
    if v_atualizados = 0 then
      raise exception 'Este horário acabou de ser ocupado por outro atendimento. Atualize a agenda e escolha outro horário.'
        using errcode = '23505';
    end if;
    v_principal_id := _editing_id;
    delete from agendamento_orcamento_itens where agendamento_id = _editing_id;
  else
    insert into agendamentos (
      clinica_id, paciente_id, paciente_nome, medico_id, enfermagem_recurso_id,
      inicio, fim, procedimento, status, observacoes, data_pagamento,
      orcamento_id, tipo_atendimento, forma_pagamento_prevista, especialidade_id,
      atendimento_grupo_id
    ) values (
      _clinica_id, _paciente_id, _paciente_nome, _medico_id, _enfermagem_recurso_id,
      _inicio, _fim, _procedimentos[1], _status::agendamento_status, _observacoes, _data_pagamento,
      _orcamento_id, _tipo_atendimento, _forma_pagamento_prevista, _especialidade_id,
      _grupo_id
    ) returning id into v_principal_id;
  end if;

  -- Lê o agenda_id do principal (preservado do slot original quando é UPDATE;
  -- normalmente NULL quando é INSERT novo). Passa para as irmãs para
  -- manter a ficha numerada dentro da mesma agenda.
  select agenda_id into v_principal_agenda_id
  from agendamentos where id = v_principal_id;

  if array_length(_procedimentos, 1) > 1 then
    for i in 2 .. array_length(_procedimentos, 1) loop
      insert into agendamentos (
        clinica_id, paciente_id, paciente_nome, medico_id, enfermagem_recurso_id,
        inicio, fim, procedimento, status, observacoes, data_pagamento,
        orcamento_id, tipo_atendimento, forma_pagamento_prevista, especialidade_id,
        atendimento_grupo_id, agenda_id
      ) values (
        _clinica_id, _paciente_id, _paciente_nome, _medico_id, _enfermagem_recurso_id,
        _inicio, _fim, _procedimentos[i], _status::agendamento_status, _observacoes, _data_pagamento,
        _orcamento_id, _tipo_atendimento, _forma_pagamento_prevista, _especialidade_id,
        _grupo_id, v_principal_agenda_id
      ) returning id into v_new_id;
      v_sibling_ids := array_append(v_sibling_ids, v_new_id);
    end loop;
  end if;

  if _orcamento_id is not null and _orcamento_item_ids is not null and array_length(_orcamento_item_ids, 1) > 0 then
    insert into agendamento_orcamento_itens (clinica_id, agendamento_id, orcamento_id, orcamento_item_id)
    select _clinica_id, v_principal_id, _orcamento_id, x
    from unnest(_orcamento_item_ids) as x;
  end if;

  return jsonb_build_object('principal_id', v_principal_id, 'sibling_ids', to_jsonb(v_sibling_ids));
end;
$$;

revoke execute on function public.salvar_agendamento_multi_imagem(uuid,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,text[],text,text,date,uuid,text,text,uuid,uuid,text,uuid[]) from public;
revoke execute on function public.salvar_agendamento_multi_imagem(uuid,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,text[],text,text,date,uuid,text,text,uuid,uuid,text,uuid[]) from anon;
grant execute on function public.salvar_agendamento_multi_imagem(uuid,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,text[],text,text,date,uuid,text,text,uuid,uuid,text,uuid[]) to authenticated;

-- Backfill: linhas irmãs antigas que ficaram sem agenda_id herdam do irmão
-- do mesmo atendimento_grupo_id que tem agenda_id. Só toca linhas com grupo
-- e agenda_id NULL.
update public.agendamentos a
set agenda_id = irm.agenda_id
from public.agendamentos irm
where a.atendimento_grupo_id is not null
  and a.agenda_id is null
  and irm.atendimento_grupo_id = a.atendimento_grupo_id
  and irm.agenda_id is not null
  and irm.id <> a.id;
