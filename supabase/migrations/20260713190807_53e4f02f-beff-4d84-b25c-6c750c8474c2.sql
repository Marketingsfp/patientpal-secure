-- Reagendamento (individual e em lote) fazia 3 updates client-side separados:
-- (1) libera a ficha de origem (vira DISPONÍVEL), (2) ocupa a ficha de
-- destino com os dados do paciente, (3) transfere fin_lancamentos da
-- origem para o destino. Se a etapa 2 falhasse, a origem já tinha sido
-- liberada — o paciente "sumia" do horário original sem entrar
-- corretamente no novo. A etapa 3 nem checava erro. No fluxo em lote as
-- etapas 1+2 rodavam em paralelo (Promise.all), então mesmo um erro na
-- etapa 2 não impedia a etapa 1 de já ter sido aplicada.
--
-- Move as 3 etapas para uma única transação Postgres: tudo-ou-nada. Também
-- revalida que o destino ainda está DISPONÍVEL dentro da transação (a
-- checagem client-side antes do clique é só uma prévia de UX).
create or replace function public.reagendar_atendimento(
  _origem_id uuid,
  _destino_id uuid,
  _trilha_msg text
)
returns jsonb
language plpgsql
security invoker
set search_path to 'public'
as $$
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

  select id, paciente_nome, procedimento
  into v_destino
  from agendamentos
  where id = _destino_id
  for update;
  if v_destino.id is null then
    raise exception 'Horário de destino não encontrado.';
  end if;

  -- Mesma regra de "slot livre" usada no front (isSlotLivre): nome
  -- normalizado igual a "disponivel" ou "bloqueio".
  if lower(trim(v_destino.paciente_nome)) not in ('disponível', 'disponivel', 'bloqueio') then
    raise exception 'Esse horário não está disponível. Escolha um slot DISPONÍVEL.'
      using errcode = '23505';
  end if;

  -- Se a origem não tinha procedimento definido, preserva o do slot de
  -- destino para não esvaziar essa informação (evita cobrança cair no
  -- fallback genérico "CONSULTA").
  v_novo_procedimento := coalesce(v_origem.procedimento, v_destino.procedimento);
  v_novas_obs := case
    when v_origem.observacoes is not null and v_origem.observacoes <> ''
      then v_origem.observacoes || E'\n' || _trilha_msg
    else _trilha_msg
  end;

  -- 1) Libera a ficha de origem.
  update agendamentos set
    paciente_id = null,
    paciente_nome = 'DISPONÍVEL',
    status = 'agendado',
    procedimento = null,
    observacoes = null,
    data_pagamento = null
  where id = _origem_id;

  -- 2) Ocupa a ficha de destino com os dados do paciente.
  update agendamentos set
    paciente_id = v_origem.paciente_id,
    paciente_nome = v_origem.paciente_nome,
    procedimento = v_novo_procedimento,
    status = 'agendado',
    observacoes = v_novas_obs,
    data_pagamento = v_origem.data_pagamento
  where id = _destino_id;

  -- 3) Transfere lançamentos financeiros da origem para o destino.
  update fin_lancamentos set agendamento_id = _destino_id
  where agendamento_id = _origem_id;

  return jsonb_build_object('origem_id', _origem_id, 'destino_id', _destino_id);
end;
$$;

revoke execute on function public.reagendar_atendimento(uuid,uuid,text) from public;
revoke execute on function public.reagendar_atendimento(uuid,uuid,text) from anon;
grant execute on function public.reagendar_atendimento(uuid,uuid,text) to authenticated;
