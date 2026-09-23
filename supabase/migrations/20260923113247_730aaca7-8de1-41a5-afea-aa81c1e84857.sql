-- ============================================================================
-- CAIXA — trava de fechamento diário + estorno não deixa modalidade negativa
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_caixa_forma_bucket(_forma text, _tipo text DEFAULT NULL)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $function$
  with k as (select lower(btrim(coalesce(_forma, ''))) as f)
  select case
    when k.f in ('credito', 'cartao_credito', 'cartão_credito', 'cartao credito') then 'credito'
    when k.f in ('debito', 'cartao_debito', 'cartão_debito', 'cartao debito')     then 'debito'
    when k.f in ('dinheiro', 'pix', 'boleto', 'transferencia', 'convenio', 'misto') then k.f
    when k.f = '' and coalesce(_tipo, '') in ('sangria', 'suprimento', 'despesa') then 'dinheiro'
    else 'outros'
  end
  from k;
$function$;

CREATE OR REPLACE FUNCTION public.fn_caixa_pendente_de_dia_anterior(
  _clinica_id uuid,
  _user_id    uuid
)
RETURNS TABLE (sessao_id uuid, dia date, operador text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select s.id,
         (s.aberto_em at time zone 'America/Sao_Paulo')::date,
         s.user_nome
    from public.caixa_sessoes s
   where s.clinica_id = _clinica_id
     and s.user_id    = _user_id
     and s.status     = 'aberto'::public.caixa_sessao_status
     and (s.aberto_em at time zone 'America/Sao_Paulo')::date
         < (now() at time zone 'America/Sao_Paulo')::date
   order by s.aberto_em
   limit 1;
$function$;

CREATE OR REPLACE FUNCTION public.tg_caixa_trava_dia_anterior()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_dia      date;
  v_operador text;
BEGIN
  -- Só o que mexe na gaveta. abertura/fechamento/reabertura e as linhas de
  -- 'registro' (R$ 0,00) passam sempre: o fechamento PRECISA passar, é com ele
  -- que o operador se livra da trava.
  IF NEW.tipo NOT IN ('recebimento'::public.caixa_mov_tipo,
                      'despesa'::public.caixa_mov_tipo,
                      'sangria'::public.caixa_mov_tipo,
                      'suprimento'::public.caixa_mov_tipo,
                      'estorno'::public.caixa_mov_tipo) THEN
    RETURN NEW;
  END IF;

  IF coalesce(current_setting('app.trava_caixa_off', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.clinica_id IS NULL OR NEW.user_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT p.dia, p.operador
    INTO v_dia, v_operador
    FROM public.fn_caixa_pendente_de_dia_anterior(NEW.clinica_id, NEW.user_id) p;

  IF v_dia IS NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'O caixa de % do dia % ainda está aberto. Confira o valor com o cupom e feche esse caixa antes de lançar no caixa de hoje.',
    coalesce(v_operador, 'este operador'), to_char(v_dia, 'DD/MM/YYYY')
    USING errcode = 'P0001',
          hint    = 'caixa_dia_anterior_aberto';
END;
$function$;

DROP TRIGGER IF EXISTS trg_caixa_trava_dia_anterior ON public.caixa_movimentos;
CREATE TRIGGER trg_caixa_trava_dia_anterior
  BEFORE INSERT ON public.caixa_movimentos
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_caixa_trava_dia_anterior();

CREATE OR REPLACE FUNCTION public.estornar_lancamento_receita(
  _lancamento_id uuid,
  _clinica_id uuid,
  _devolucao_agora boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_lanc record; v_atd_repasse_pago boolean; v_ag_id uuid; v_mens_id uuid;
  v_uid uuid := auth.uid();
  v_dev boolean := coalesce(_devolucao_agora, false);
  v_autorizado boolean;
  v_e_mensalidade boolean;
  v_sem_destino boolean;
  v_usou_devolvedor boolean;
  v_usou_registro boolean;
  v_nome_devolvedor text;
  v_aviso text := null;
  -- NOVO
  v_d record;
  v_saldo numeric;
  v_pend_dia date;
  v_pend_operador text;
  v_forma_label text;
begin
  if v_uid is null then
    raise exception 'Não autenticado' using errcode = '42501';
  end if;

  select exists (
    select 1 from public.contrato_mensalidades where lancamento_id = _lancamento_id
  ) into v_e_mensalidade;

  v_autorizado := public.pode_escrever_modulo(
    v_uid,
    _clinica_id,
    case when v_e_mensalidade
      then ARRAY['cartao-beneficios', 'cartao-terapeutico', 'contratos', 'financeiro', 'financeiro-estorno']
      else ARRAY['financeiro', 'financeiro-estorno']
    end
  );

  if not v_autorizado then
    raise exception 'Sem permissão para estornar nesta clínica' using errcode = '42501';
  end if;

  select id, agendamento_id, valor, descricao, repasse_pago, clinica_id into v_lanc
  from fin_lancamentos where id = _lancamento_id for update;
  if v_lanc.id is null then
    return jsonb_build_object('ok', true, 'motivo', 'nao_encontrado');
  end if;

  if v_lanc.clinica_id is distinct from _clinica_id then
    raise exception 'Lançamento não pertence à clínica informada' using errcode = '42501';
  end if;

  select repasse_pago into v_atd_repasse_pago from fin_atendimentos where lancamento_id = _lancamento_id limit 1;

  if coalesce(v_atd_repasse_pago, false) or coalesce(v_lanc.repasse_pago, false) then
    return jsonb_build_object('ok', false, 'motivo', 'repasse_pago',
      'mensagem', 'Repasse já pago — estorne o pagamento do repasse primeiro.');
  end if;

  select coalesce(bool_or(d.origem = 'sem_destino'), false),
         coalesce(bool_or(d.origem = 'caixa_de_quem_devolveu'), false),
         coalesce(bool_or(d.tipo_mov = 'registro'), false)
    into v_sem_destino, v_usou_devolvedor, v_usou_registro
    from public.estorno_receita_destinos(v_lanc.id, v_uid, v_dev) d;

  if v_sem_destino then
    select p.nome into v_nome_devolvedor
      from profiles p
     where p.id = coalesce(
       (select es.solicitado_por from estorno_solicitacoes es
         where es.lancamento_id = v_lanc.id and es.status = 'pendente'
         order by es.solicitado_em desc limit 1),
       v_uid);
    return jsonb_build_object('ok', false, 'motivo', 'sem_sessao_aberta',
      'mensagem', 'O caixa deste pagamento já foi fechado. Para registrar a devolução ao paciente, '
        || coalesce(v_nome_devolvedor, 'quem vai devolver o valor')
        || ' precisa estar com o caixa aberto — a saída sai da gaveta de quem devolve.');
  end if;

  -- ========== NOVO (a): trava de fechamento diário, com mensagem amigável ==========
  select p.dia, p.operador into v_pend_dia, v_pend_operador
    from public.estorno_receita_destinos(v_lanc.id, v_uid, v_dev) d
    cross join lateral public.fn_caixa_pendente_de_dia_anterior(d.clinica_id, d.dono_destino) p
   where d.sessao_destino is not null
     and d.tipo_mov = 'estorno'
   limit 1;

  if v_pend_dia is not null then
    return jsonb_build_object('ok', false, 'motivo', 'caixa_dia_anterior_aberto',
      'mensagem', 'O caixa de ' || coalesce(v_pend_operador, 'quem vai devolver o valor')
        || ' do dia ' || to_char(v_pend_dia, 'DD/MM/YYYY')
        || ' ainda está aberto. Esse caixa precisa ser conferido e fechado antes de registrar a devolução.');
  end if;

  -- ========== NOVO (b): estorno não deixa a modalidade negativa ==========
  -- Liberado em dois casos: o pagamento foi recebido na PRÓPRIA sessão de
  -- destino, ou a sessão tem saldo suficiente naquela forma. O troco de
  -- abertura fica FORA do saldo das formas, de propósito.
  for v_d in
    select d.*
      from public.estorno_receita_destinos(v_lanc.id, v_uid, v_dev) d
     where d.sessao_destino is not null
       and d.tipo_mov = 'estorno'
  loop
    if exists (
      select 1 from caixa_movimentos r
       where r.lancamento_id = v_lanc.id
         and r.tipo          = 'recebimento'::public.caixa_mov_tipo
         and r.sessao_id     = v_d.sessao_destino
    ) then
      continue;
    end if;

    select coalesce(sum(
             case when m.tipo in ('recebimento'::public.caixa_mov_tipo,
                                  'suprimento'::public.caixa_mov_tipo)  then  m.valor
                  when m.tipo in ('estorno'::public.caixa_mov_tipo,
                                  'sangria'::public.caixa_mov_tipo,
                                  'despesa'::public.caixa_mov_tipo)     then -m.valor
                  else 0 end), 0)
      into v_saldo
      from caixa_movimentos m
     where m.sessao_id = v_d.sessao_destino
       and m.tipo in ('recebimento'::public.caixa_mov_tipo,
                      'suprimento'::public.caixa_mov_tipo,
                      'estorno'::public.caixa_mov_tipo,
                      'sangria'::public.caixa_mov_tipo,
                      'despesa'::public.caixa_mov_tipo)
       and public.fn_caixa_forma_bucket(m.forma_pagamento, m.tipo::text)
         = public.fn_caixa_forma_bucket(v_d.forma_pagamento, 'estorno');

    if v_saldo < v_d.valor - 0.005 then
      v_forma_label := case public.fn_caixa_forma_bucket(v_d.forma_pagamento, 'estorno')
        when 'dinheiro'      then 'dinheiro'
        when 'pix'           then 'PIX'
        when 'debito'        then 'cartão de débito'
        when 'credito'       then 'cartão de crédito'
        when 'boleto'        then 'boleto'
        when 'transferencia' then 'transferência'
        when 'convenio'      then 'convênio'
        else 'nessa forma de pagamento'
      end;

      return jsonb_build_object('ok', false, 'motivo', 'sem_saldo_na_forma',
        'forma', v_forma_label,
        'saldo_disponivel', round(greatest(v_saldo, 0), 2),
        'valor_estorno', round(v_d.valor, 2),
        'mensagem', 'O caixa que receberia a devolução não tem esse valor em ' || v_forma_label
          || ': disponível R$ ' || to_char(greatest(v_saldo, 0), 'FM999G999G990D00')
          || ', devolução de R$ ' || to_char(v_d.valor, 'FM999G999G990D00')
          || '. Esse pagamento foi recebido em outro caixa, que já foi fechado. Para seguir, estorne'
          || ' SEM marcar "devolvi o dinheiro agora": a guia é cancelada, a ficha é liberada e fica'
          || ' o registro de R$ 0,00, sem mexer na gaveta.');
    end if;
  end loop;
  -- ========== FIM DO QUE É NOVO ==========

  if v_usou_devolvedor then
    v_aviso := 'lancado_no_caixa_de_quem_devolveu';
  elsif v_usou_registro then
    v_aviso := 'registrado_sem_mexer_na_gaveta';
  end if;

  update fin_lancamentos set status = 'cancelado' where id = v_lanc.id;

  insert into caixa_movimentos (sessao_id, clinica_id, user_id, tipo, valor, descricao, forma_pagamento, lancamento_id)
  select d.sessao_destino, d.clinica_id, d.dono_destino, d.tipo_mov::public.caixa_mov_tipo, d.valor,
         case when d.tipo_mov = 'registro'
              then trim('Estorno — ' || coalesce(d.descricao, '')
                        || ' — pagamento de dia já fechado, sem devolução (não entra na gaveta)')
              else trim('Estorno — ' || coalesce(d.descricao, '')) end,
         d.forma_pagamento, d.lancamento_id
    from public.estorno_receita_destinos(v_lanc.id, v_uid, v_dev) d
   where d.sessao_destino is not null;

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

  return jsonb_build_object('ok', true, 'agendamento_id', v_ag_id, 'mensalidade_id', v_mens_id,
    'valor', v_lanc.valor, 'aviso', v_aviso);
end; $function$;

REVOKE ALL ON FUNCTION public.fn_caixa_pendente_de_dia_anterior(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fn_caixa_pendente_de_dia_anterior(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_caixa_forma_bucket(text, text) TO authenticated;