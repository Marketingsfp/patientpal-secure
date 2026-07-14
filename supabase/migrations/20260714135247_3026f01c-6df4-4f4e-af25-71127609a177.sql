-- ALTA-12: quando um agendamento vem de um orçamento, o vínculo com os
-- itens do orçamento (agendamento_orcamento_itens) era gravado DEPOIS de
-- já ter salvo o agendamento — dois passos separados. Se o vínculo
-- falhasse, o agendamento continuava criado (sucesso!) mas os itens do
-- orçamento ficavam "perdidos": nunca marcados como agendados, nunca
-- cobrados, e o erro virava só um aviso (vinculo_warning) fácil de ignorar.
--
-- RPC para o caminho "normal" de criação/edição de agendamento (inclui o
-- modo "laboratório", que só concatena os procedimentos num texto único —
-- o caller já faz essa concatenação antes de chamar). Junta INSERT/UPDATE
-- do agendamento + vínculo com itens do orçamento na MESMA transação.
-- O caminho "imagem" (múltiplos agendamentos-irmãos) é tratado à parte por
-- salvar_agendamento_multi_imagem, estendida nesta mesma migration para
-- cobrir o mesmo vínculo.
create or replace function public.salvar_agendamento_e_vincular_orcamento(
  _editing_id uuid,
  _clinica_id uuid,
  _paciente_id uuid,
  _paciente_nome text,
  _medico_id uuid,
  _enfermagem_recurso_id uuid,
  _inicio timestamptz,
  _fim timestamptz,
  _procedimento text,
  _status text,
  _observacoes text,
  _data_pagamento date,
  _orcamento_id uuid,
  _tipo_atendimento text,
  _forma_pagamento_prevista text,
  _especialidade_id uuid,
  _orcamento_item_ids uuid[],
  _paciente_nome_esperado_no_slot text
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_id uuid;
  v_atualizados int;
begin
  if _editing_id is not null then
    -- Mesma trava otimista contra corrida de slot já usada no resto da
    -- criação de agendamento.
    update agendamentos set
      paciente_id = _paciente_id,
      paciente_nome = _paciente_nome,
      medico_id = _medico_id,
      enfermagem_recurso_id = _enfermagem_recurso_id,
      inicio = _inicio,
      fim = _fim,
      procedimento = _procedimento,
      status = _status::agendamento_status,
      observacoes = _observacoes,
      data_pagamento = _data_pagamento,
      orcamento_id = _orcamento_id,
      tipo_atendimento = _tipo_atendimento,
      forma_pagamento_prevista = _forma_pagamento_prevista,
      especialidade_id = _especialidade_id
    where id = _editing_id
      and (_paciente_nome_esperado_no_slot is null or paciente_nome = _paciente_nome_esperado_no_slot);
    get diagnostics v_atualizados = row_count;
    if v_atualizados = 0 then
      raise exception 'Este horário acabou de ser ocupado por outro atendimento. Atualize a agenda e escolha outro horário.'
        using errcode = '23505';
    end if;
    v_id := _editing_id;
    delete from agendamento_orcamento_itens where agendamento_id = _editing_id;
  else
    insert into agendamentos (
      clinica_id, paciente_id, paciente_nome, medico_id, enfermagem_recurso_id,
      inicio, fim, procedimento, status, observacoes, data_pagamento,
      orcamento_id, tipo_atendimento, forma_pagamento_prevista, especialidade_id
    ) values (
      _clinica_id, _paciente_id, _paciente_nome, _medico_id, _enfermagem_recurso_id,
      _inicio, _fim, _procedimento, _status::agendamento_status, _observacoes, _data_pagamento,
      _orcamento_id, _tipo_atendimento, _forma_pagamento_prevista, _especialidade_id
    ) returning id into v_id;
  end if;

  if _orcamento_id is not null and _orcamento_item_ids is not null and array_length(_orcamento_item_ids, 1) > 0 then
    insert into agendamento_orcamento_itens (clinica_id, agendamento_id, orcamento_id, orcamento_item_id)
    select _clinica_id, v_id, _orcamento_id, x
    from unnest(_orcamento_item_ids) as x;
  end if;

  return jsonb_build_object('id', v_id);
end;
$$;

revoke execute on function public.salvar_agendamento_e_vincular_orcamento(uuid,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,text,text,text,date,uuid,text,text,uuid,uuid[],text) from public;
revoke execute on function public.salvar_agendamento_e_vincular_orcamento(uuid,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,text,text,text,date,uuid,text,text,uuid,uuid[],text) from anon;
grant execute on function public.salvar_agendamento_e_vincular_orcamento(uuid,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,text,text,text,date,uuid,text,text,uuid,uuid[],text) to authenticated;

-- Estende salvar_agendamento_multi_imagem (fix ALTA anterior) para também
-- vincular itens de orçamento ao agendamento PRINCIPAL do grupo, na mesma
-- transação — mesmo bug, mesma causa, caminho "imagem".
-- Um novo parâmetro muda a assinatura da função para o Postgres (mesmo com
-- default) — CREATE OR REPLACE criaria uma sobrecarga em vez de substituir,
-- então a versão antiga (17 parâmetros) precisa ser removida primeiro.
drop function if exists public.salvar_agendamento_multi_imagem(uuid,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,text[],text,text,date,uuid,text,text,uuid,uuid,text);

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

  if array_length(_procedimentos, 1) > 1 then
    for i in 2 .. array_length(_procedimentos, 1) loop
      insert into agendamentos (
        clinica_id, paciente_id, paciente_nome, medico_id, enfermagem_recurso_id,
        inicio, fim, procedimento, status, observacoes, data_pagamento,
        orcamento_id, tipo_atendimento, forma_pagamento_prevista, especialidade_id,
        atendimento_grupo_id
      ) values (
        _clinica_id, _paciente_id, _paciente_nome, _medico_id, _enfermagem_recurso_id,
        _inicio, _fim, _procedimentos[i], _status::agendamento_status, _observacoes, _data_pagamento,
        _orcamento_id, _tipo_atendimento, _forma_pagamento_prevista, _especialidade_id,
        _grupo_id
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
