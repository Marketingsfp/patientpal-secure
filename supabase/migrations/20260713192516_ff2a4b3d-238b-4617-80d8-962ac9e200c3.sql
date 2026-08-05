-- Multi-exame "imagem" (múltiplas imagens no mesmo horário/paciente, cada
-- uma vira uma linha em agendamentos): ao editar, o agendamento principal
-- era atualizado primeiro e os irmãos inseridos depois, como dois passos
-- separados. Se a inserção dos irmãos falhasse, o principal ficava
-- alterado sozinho, sem os irmãos — estado parcial. Além disso os irmãos
-- nunca eram vinculados entre si (nenhuma coluna de grupo era gravada),
-- então não havia como localizar "todas as linhas deste mesmo multi-exame"
-- depois de criado.
--
-- Move UPDATE do principal + INSERT dos irmãos para uma única transação
-- Postgres (tudo-ou-nada) e grava atendimento_grupo_id (já existente na
-- tabela e usado pelo fluxo de Atendimento Múltiplo) em todas as linhas do
-- mesmo multi-exame.
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
  _paciente_nome_esperado_no_slot text
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
    -- Mesma trava otimista usada no reagendamento/edição normal: se outro
    -- operador já ocupou este horário entre a validação e este ponto, o
    -- UPDATE não casa nenhuma linha.
    update agendamentos set
      paciente_id = _paciente_id,
      paciente_nome = _paciente_nome,
      medico_id = _medico_id,
      enfermagem_recurso_id = _enfermagem_recurso_id,
      inicio = _inicio,
      fim = _fim,
      procedimento = _procedimentos[1],
      status = _status,
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
  else
    insert into agendamentos (
      clinica_id, paciente_id, paciente_nome, medico_id, enfermagem_recurso_id,
      inicio, fim, procedimento, status, observacoes, data_pagamento,
      orcamento_id, tipo_atendimento, forma_pagamento_prevista, especialidade_id,
      atendimento_grupo_id
    ) values (
      _clinica_id, _paciente_id, _paciente_nome, _medico_id, _enfermagem_recurso_id,
      _inicio, _fim, _procedimentos[1], _status, _observacoes, _data_pagamento,
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
        _inicio, _fim, _procedimentos[i], _status, _observacoes, _data_pagamento,
        _orcamento_id, _tipo_atendimento, _forma_pagamento_prevista, _especialidade_id,
        _grupo_id
      ) returning id into v_new_id;
      v_sibling_ids := array_append(v_sibling_ids, v_new_id);
    end loop;
  end if;

  return jsonb_build_object('principal_id', v_principal_id, 'sibling_ids', to_jsonb(v_sibling_ids));
end;
$$;

revoke execute on function public.salvar_agendamento_multi_imagem(uuid,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,text[],text,text,date,uuid,text,text,uuid,uuid,text) from public;
revoke execute on function public.salvar_agendamento_multi_imagem(uuid,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,text[],text,text,date,uuid,text,text,uuid,uuid,text) from anon;
grant execute on function public.salvar_agendamento_multi_imagem(uuid,uuid,uuid,text,uuid,uuid,timestamptz,timestamptz,text[],text,text,date,uuid,text,text,uuid,uuid,text) to authenticated;
