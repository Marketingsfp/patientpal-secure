-- Repasse: liberar pelo dia do atendimento, e não pela marcação "realizado".
--
-- Motivo (decisão do dono em 24/09/2026): a trava exigia que a ficha estivesse
-- marcada como "realizado" na Agenda. Na prática quase ninguém marca — das
-- fichas pagas pelo paciente entre 01 e 23/09/2026 e com repasse em aberto,
-- 551 estavam como "agendado" e 224 como "confirmado", contra apenas 207 como
-- "realizado". Eram 775 fichas (R$ 136 mil de receita) com o repasse do
-- profissional travado por uma marcação de rotina que a equipe não faz.
--
-- A regra passa a ser: libera quando a data do atendimento já chegou e a ficha
-- NÃO está cancelada nem marcada como falta. Continua impedindo os dois riscos
-- que a trava existia para evitar — pagar adiantado e pagar para quem faltou.
--
-- A mesma regra é aplicada na tela (app.financeiro.atendimentos.tsx); esta é a
-- blindagem do servidor, que vale mesmo se o cliente estiver desatualizado.

CREATE OR REPLACE FUNCTION public.pagar_repasse_medico(_clinica_id uuid, _medico_id uuid, _manual_ids uuid[], _agenda_ids uuid[], _total numeric, _data date, _forma_pagamento text, _conta_id uuid, _criado_por uuid, _medico_nome text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare
  v_locked_manual integer := 0;
  v_locked_agenda integer := 0;
  v_esperado integer;
  v_lanc_id uuid;
  v_invalid_manual integer := 0;
  v_invalid_agenda integer := 0;
  v_categoria_id uuid;
begin
  v_esperado := coalesce(array_length(_manual_ids, 1), 0) + coalesce(array_length(_agenda_ids, 1), 0);
  if v_esperado = 0 then
    raise exception 'Nenhum atendimento informado para pagamento de repasse.';
  end if;
  if _total <= 0 then
    raise exception 'Valor do repasse deve ser maior que zero.';
  end if;

  -- Blindagem server-side: o cliente pode estar em cache ou ser burlado.
  -- Manual: o dia já tem que ter chegado, e a ficha não pode estar cancelada.
  if _manual_ids is not null and array_length(_manual_ids, 1) > 0 then
    select count(*)
    into v_invalid_manual
    from fin_atendimentos fa
    where fa.id = any(_manual_ids)
      and (
        fa.clinica_id <> _clinica_id
        or fa.status = 'cancelado'
        or fa.data > current_date
        or fa.data > _data
        or fa.repasse_pago = true
      );

    if v_invalid_manual > 0 then
      raise exception 'Um ou mais atendimentos manuais estão cancelados, são de data futura ou já foram pagos.'
        using errcode = '23514';
    end if;
  end if;

  -- Agenda: repasse pertence à data do agendamento/reagendamento, não à data
  -- em que o paciente pagou. Só libera no dia do atendimento ou depois, e
  -- desde que a ficha não esteja cancelada nem marcada como falta.
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
        -- 50% da mensalidade é repasse).
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
              ag.status in ('cancelado'::agendamento_status, 'faltou'::agendamento_status)
              or ag.inicio::date > current_date
              or ag.inicio::date > _data
            )
          end
        )
      );

    if v_invalid_agenda > 0 then
      raise exception 'Um ou mais atendimentos da agenda ainda não estão liberados para repasse. O repasse só pode ser pago no dia marcado do atendimento ou depois, e a ficha não pode estar cancelada nem como falta.'
        using errcode = '23514';
    end if;
  end if;

  -- Trava otimista: só marca repasse_pago=true em quem ainda está false.
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

  -- Categoria da despesa de repasse. Sem "raise" se não achar: uma categoria
  -- faltando no cadastro não pode impedir o pagamento do médico.
  select c.id
  into v_categoria_id
  from fin_categorias c
  where c.clinica_id = _clinica_id
    and c.tipo::text = 'despesa'
    and c.ativo = true
    and upper(public.strip_accents(c.nome)) = 'REPASSE MEDICO'
  order by c.created_at
  limit 1;

  insert into fin_lancamentos (
    clinica_id, tipo, descricao, valor, data, data_vencimento,
    status, medico_id, conta_id, forma_pagamento, criado_por,
    categoria_id
  ) values (
    _clinica_id, 'despesa',
    'Repasse médico — ' || _medico_nome || ' (' || v_esperado || ' atend.)',
    _total, _data, _data,
    'confirmado', _medico_id, _conta_id, _forma_pagamento, _criado_por,
    v_categoria_id
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
