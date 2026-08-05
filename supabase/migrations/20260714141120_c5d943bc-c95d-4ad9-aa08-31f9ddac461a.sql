create or replace function public.pagar_repasse_medico(
  _clinica_id uuid,
  _medico_id uuid,
  _manual_ids uuid[],
  _agenda_ids uuid[],
  _total numeric,
  _data date,
  _forma_pagamento text,
  _conta_id uuid,
  _criado_por uuid,
  _medico_nome text
)
returns uuid
language plpgsql
security invoker
set search_path to 'public'
as $$
declare
  v_locked_manual integer := 0;
  v_locked_agenda integer := 0;
  v_esperado integer;
  v_lanc_id uuid;
  v_invalid_manual integer := 0;
  v_invalid_agenda integer := 0;
begin
  v_esperado := coalesce(array_length(_manual_ids, 1), 0) + coalesce(array_length(_agenda_ids, 1), 0);
  if v_esperado = 0 then
    raise exception 'Nenhum atendimento informado para pagamento de repasse.';
  end if;
  if _total <= 0 then
    raise exception 'Valor do repasse deve ser maior que zero.';
  end if;

  -- Blindagem server-side: o cliente pode estar em cache ou ser burlado.
  -- Manual: só repassa atendimento já realizado.
  if _manual_ids is not null and array_length(_manual_ids, 1) > 0 then
    select count(*)
    into v_invalid_manual
    from fin_atendimentos fa
    where fa.id = any(_manual_ids)
      and (
        fa.clinica_id <> _clinica_id
        or fa.status <> 'realizado'
        or fa.repasse_pago = true
      );

    if v_invalid_manual > 0 then
      raise exception 'Um ou mais atendimentos manuais não estão realizados ou já foram pagos.'
        using errcode = '23514';
    end if;
  end if;

  -- Agenda: repasse pertence à data do agendamento/reagendamento, não à data
  -- em que o paciente pagou. Só libera no dia do atendimento ou depois, e
  -- apenas se o agendamento já estiver realizado.
  if _agenda_ids is not null and array_length(_agenda_ids, 1) > 0 then
    select count(*)
    into v_invalid_agenda
    from fin_lancamentos fl
    left join agendamentos ag on ag.id = fl.agendamento_id
    where fl.id = any(_agenda_ids)
      and (
        fl.clinica_id <> _clinica_id
        or fl.tipo <> 'receita'
        or fl.status <> 'confirmado'
        or fl.repasse_pago = true
        or ag.id is null
        or ag.status <> 'realizado'
        or ag.inicio::date > current_date
        or ag.inicio::date > _data
      );

    if v_invalid_agenda > 0 then
      raise exception 'Um ou mais atendimentos da agenda ainda não estão liberados para repasse. O repasse só pode ser pago no dia marcado do atendimento ou depois, com o atendimento realizado.'
        using errcode = '23514';
    end if;
  end if;

  -- Trava otimista: só marca repasse_pago=true em quem ainda está false.
  -- Se outra tentativa (corrida, retry, duas abas) já pagou algum desses
  -- atendimentos, o COUNT abaixo não bate e a exceção desfaz TUDO nesta
  -- transação (inclusive estas duas UPDATEs) — sem despesa órfã e sem
  -- atendimento marcado como pago sem despesa vinculada.
  if _manual_ids is not null and array_length(_manual_ids, 1) > 0 then
    update fin_atendimentos
    set repasse_pago = true,
        repasse_pago_em = _data,
        repasse_pago_at = now(),
        repasse_forma_pagamento = _forma_pagamento,
        repasse_conta_id = _conta_id,
        repasse_pago_por = _criado_por
    where id = any(_manual_ids)
      and clinica_id = _clinica_id
      and repasse_pago = false;
    get diagnostics v_locked_manual = row_count;
  end if;

  if _agenda_ids is not null and array_length(_agenda_ids, 1) > 0 then
    update fin_lancamentos
    set repasse_pago = true,
        repasse_pago_em = _data,
        repasse_pago_at = now(),
        repasse_forma_pagamento = _forma_pagamento,
        repasse_conta_id = _conta_id,
        repasse_pago_por = _criado_por
    where id = any(_agenda_ids)
      and clinica_id = _clinica_id
      and repasse_pago = false;
    get diagnostics v_locked_agenda = row_count;
  end if;

  if (v_locked_manual + v_locked_agenda) <> v_esperado then
    raise exception 'Um ou mais atendimentos não estavam disponíveis para pagamento (já pagos, ou sem permissão).'
      using errcode = '23505';
  end if;

  -- Só agora cria a despesa — dentro da MESMA transação. Se esta inserção
  -- falhar (ex.: violação de constraint), as duas UPDATEs acima também são
  -- desfeitas automaticamente pelo Postgres.
  insert into fin_lancamentos (
    clinica_id, tipo, descricao, valor, data, data_vencimento,
    status, medico_id, conta_id, forma_pagamento, criado_por
  ) values (
    _clinica_id, 'despesa',
    'Repasse médico — ' || _medico_nome || ' (' || v_esperado || ' atend.)',
    _total, _data, _data,
    'confirmado', _medico_id, _conta_id, _forma_pagamento, _criado_por
  )
  returning id into v_lanc_id;

  if _manual_ids is not null and array_length(_manual_ids, 1) > 0 then
    update fin_atendimentos
    set repasse_lancamento_id = v_lanc_id
    where id = any(_manual_ids);
  end if;

  if _agenda_ids is not null and array_length(_agenda_ids, 1) > 0 then
    update fin_lancamentos
    set repasse_lancamento_id = v_lanc_id
    where id = any(_agenda_ids);
  end if;

  return v_lanc_id;
end;
$$;

revoke execute on function public.pagar_repasse_medico(uuid,uuid,uuid[],uuid[],numeric,date,text,uuid,uuid,text) from public;
revoke execute on function public.pagar_repasse_medico(uuid,uuid,uuid[],uuid[],numeric,date,text,uuid,uuid,text) from anon;
grant execute on function public.pagar_repasse_medico(uuid,uuid,uuid[],uuid[],numeric,date,text,uuid,uuid,text) to authenticated;