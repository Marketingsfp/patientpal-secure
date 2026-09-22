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
) returns uuid
language plpgsql
set search_path = public
as $function$
declare
  v_locked_manual integer := 0;
  v_locked_agenda integer := 0;
  v_esperado integer;
  v_lanc_id uuid;
  v_invalid_manual integer := 0;
  v_invalid_agenda integer := 0;
  v_categoria_id uuid;  -- NOVO
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
        -- Sem agendamento só é aceito num caso: mensalidade paga de contrato
        -- do Cartão Terapêutico (regra de negócio confirmada pela clínica —
        -- 50% da mensalidade é repasse). Todo o resto continua exigindo
        -- agendamento realizado e data liberada, como sempre.
        or (
          case
            when ag.id is null then not exists (
              select 1
              from contrato_mensalidades cm
              join contratos_assinatura ca on ca.id = cm.contrato_id
              join cb_convenios cv on cv.id = ca.convenio_id
              where cm.lancamento_id = fl.id
                and cm.numero_parcela >= 1
                and cm.status = 'pago'
                and cv.produto = 'terapeutico'
            )
            else (
              ag.status <> 'realizado'
              or ag.inicio::date > current_date
              or ag.inicio::date > _data
            )
          end
        )
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

  -- NOVO: categoria da despesa de repasse. Sem "raise" se nao achar: uma
  -- categoria faltando no cadastro nao pode impedir o pagamento do medico --
  -- a despesa entra com a categoria em branco, como entrava antes.
  select c.id
  into v_categoria_id
  from fin_categorias c
  where c.clinica_id = _clinica_id
    and c.tipo::text = 'despesa'
    and c.ativo = true
    and upper(public.strip_accents(c.nome)) = 'REPASSE MEDICO'
  order by c.created_at
  limit 1;

  -- Só agora cria a despesa — dentro da MESMA transação. Se esta inserção
  -- falhar (ex.: violação de constraint), as duas UPDATEs acima também são
  -- desfeitas automaticamente pelo Postgres.
  insert into fin_lancamentos (
    clinica_id, tipo, descricao, valor, data, data_vencimento,
    status, medico_id, conta_id, forma_pagamento, criado_por,
    categoria_id  -- NOVO
  ) values (
    _clinica_id, 'despesa',
    'Repasse médico — ' || _medico_nome || ' (' || v_esperado || ' atend.)',
    _total, _data, _data,
    'confirmado', _medico_id, _conta_id, _forma_pagamento, _criado_por,
    v_categoria_id  -- NOVO
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
$function$;