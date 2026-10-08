-- Crédito na clínica (etapa 2): pagamento da cobrança do crédito.
--
-- O atendimento pago com crédito já foi faturado no dia (fin_lancamentos com
-- forma 'credito_clinica'). Quando o titular paga a cobrança do contrato, o
-- dinheiro entra na gaveta, mas NÃO pode virar receita de novo. Por isso o
-- pagamento gera só um movimento de caixa 'recebimento' (sem lançamento): ele
-- entra no fechamento e na conferência por forma, e nenhum relatório de
-- faturamento (que lê fin_lancamentos) o soma.
--
-- Exige o caixa do operador aberto hoje — o mesmo lugar onde ele confere a
-- gaveta no fim do dia.

create or replace function public.pagar_cobranca_credito_clinica(
  _mensalidade_id uuid,
  _forma text,
  _bandeira text default null
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_m record;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_sessao uuid;
  v_mov uuid;
  v_desc text;
  v_forma_txt text;
begin
  select m.id, m.clinica_id, m.contrato_id, m.valor, m.status, m.origem,
         c.numero, c.paciente_nome
    into v_m
  from public.contrato_mensalidades m
  join public.contratos_assinatura c on c.id = m.contrato_id
  where m.id = _mensalidade_id
  for update of m;

  if v_m.id is null then
    raise exception 'Cobrança não encontrada.';
  end if;
  if auth.uid() is null or not public.is_member(auth.uid(), v_m.clinica_id) then
    raise exception 'Acesso negado';
  end if;
  if v_m.origem is distinct from 'credito_clinica' then
    raise exception 'Esta cobrança não é de Crédito na clínica.';
  end if;
  if v_m.status not in ('pendente', 'aberto', 'atrasado') then
    raise exception 'Esta cobrança já foi paga ou cancelada.';
  end if;
  if coalesce(v_m.valor, 0) <= 0 then
    raise exception 'Cobrança sem valor.';
  end if;
  if _forma not in ('dinheiro', 'pix', 'debito', 'credito') then
    raise exception 'Forma de pagamento inválida.';
  end if;
  if _forma in ('debito', 'credito') and coalesce(btrim(_bandeira), '') = '' then
    raise exception 'Informe a bandeira do cartão.';
  end if;

  select id into v_sessao
  from public.caixa_sessoes
  where clinica_id = v_m.clinica_id
    and user_id = auth.uid()
    and status = 'aberto'::public.caixa_sessao_status
    and (aberto_em at time zone 'America/Sao_Paulo')::date = v_hoje
  order by aberto_em desc
  limit 1;
  if v_sessao is null then
    raise exception 'Abra o seu caixa de hoje para receber a cobrança do crédito.';
  end if;

  v_forma_txt := case _forma
    when 'dinheiro' then 'Dinheiro'
    when 'pix' then 'PIX'
    when 'debito' then 'Débito'
    else 'Crédito' end
    || case when coalesce(btrim(_bandeira), '') <> '' then ' ' || btrim(_bandeira) else '' end;

  v_desc := format('CRÉDITO NA CLÍNICA — pagamento da cobrança · Contrato #%s · %s',
                   v_m.numero, coalesce(v_m.paciente_nome, ''));

  insert into public.caixa_movimentos (
    sessao_id, clinica_id, user_id, tipo, valor, descricao, forma_pagamento
  ) values (
    v_sessao, v_m.clinica_id, auth.uid(), 'recebimento'::public.caixa_mov_tipo,
    v_m.valor, v_desc, _forma
  )
  returning id into v_mov;

  update public.contrato_mensalidades
     set status = 'pago',
         pago_em = now(),
         forma_pagamento = _forma,
         valor_pago = v_m.valor,
         observacoes = concat_ws(E'\n', observacoes,
           format('%s: pago R$ %s (%s) — movimento de caixa %s',
                  to_char(v_hoje, 'DD/MM/YYYY'), to_char(v_m.valor, 'FM999G990D00'),
                  v_forma_txt, v_mov)),
         updated_at = now()
   where id = v_m.id;

  return v_mov;
end;
$$;

grant execute on function public.pagar_cobranca_credito_clinica(uuid, text, text) to authenticated;
