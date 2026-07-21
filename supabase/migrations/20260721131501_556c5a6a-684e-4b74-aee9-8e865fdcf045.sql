
CREATE OR REPLACE FUNCTION public.reagendar_atendimento(_origem_id uuid, _destino_id uuid, _trilha_msg text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_origem record;
  v_destino record;
  v_novo_procedimento text;
  v_novas_obs text;
begin
  if _origem_id = _destino_id then
    raise exception 'Esse já é o horário atual.';
  end if;

  select id, paciente_id, paciente_nome, procedimento, observacoes, data_pagamento
  into v_origem
  from agendamentos
  where id = _origem_id
  for update;
  if v_origem.id is null then
    raise exception 'Agendamento de origem não encontrado.';
  end if;

  select id, paciente_nome, procedimento, medico_id
  into v_destino
  from agendamentos
  where id = _destino_id
  for update;
  if v_destino.id is null then
    raise exception 'Horário de destino não encontrado.';
  end if;

  if lower(trim(v_destino.paciente_nome)) not in ('disponível', 'disponivel', 'bloqueio') then
    raise exception 'Esse horário não está disponível. Escolha um slot DISPONÍVEL.'
      using errcode = '23505';
  end if;

  v_novo_procedimento := coalesce(v_origem.procedimento, v_destino.procedimento);
  v_novas_obs := case
    when v_origem.observacoes is not null and v_origem.observacoes <> ''
      then v_origem.observacoes || E'\n' || _trilha_msg
    else _trilha_msg
  end;

  update agendamentos set
    paciente_id = null,
    paciente_nome = 'DISPONÍVEL',
    status = 'agendado',
    procedimento = null,
    observacoes = null,
    data_pagamento = null
  where id = _origem_id;

  update agendamentos set
    paciente_id = v_origem.paciente_id,
    paciente_nome = v_origem.paciente_nome,
    procedimento = v_novo_procedimento,
    status = 'agendado',
    observacoes = v_novas_obs,
    data_pagamento = v_origem.data_pagamento
  where id = _destino_id;

  -- Sincroniza lançamentos financeiros com o agendamento de destino:
  -- além do agendamento_id, atualiza médico e paciente para refletir o slot destino.
  update fin_lancamentos set
    agendamento_id = _destino_id,
    medico_id = v_destino.medico_id,
    paciente_id = v_origem.paciente_id
  where agendamento_id = _origem_id;

  return jsonb_build_object('origem_id', _origem_id, 'destino_id', _destino_id);
end;
$function$;
