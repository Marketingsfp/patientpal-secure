-- Crédito na clínica (Cartão Consulta + Seguros e Cartão Desconto + Seguros).
--
-- Regras combinadas com o dono em 08/10/2026:
--   * só o TITULAR (quem não é "titular apenas financeiro") usa;
--   * libera depois de 6 mensalidades pagas (renovação já entra liberada);
--   * limite inicial vem do convênio (cb_convenios.credito_limite_inicial;
--     NULL = convênio sem crédito) e pode ser mudado por contrato;
--   * limite ROTATIVO: disponível = limite - cobranças de crédito em aberto;
--   * o valor usado vira uma cobrança SEPARADA no contrato, com o mesmo
--     vencimento da próxima mensalidade (contrato_mensalidades com
--     origem = 'credito_clinica' e numero_parcela negativo, como as taxas);
--   * cobrança atrasada (> tolerância) bloqueia o crédito — e, por ser uma
--     parcela do contrato em atraso, também os descontos do cartão;
--   * a cada 6 meses o limite é revisado por quem tem alçada NOMINAL
--     'credito_clinica'; sem revisão, o limite atual continua valendo.
--
-- O uso é amarrado ao lançamento: todo fin_lancamentos de receita confirmado
-- com forma 'credito_clinica' (ou parte de misto com essa forma) passa pelo
-- gatilho, que valida e lança na cobrança do contrato. Cancelar ou apagar o
-- lançamento devolve o valor ao crédito, enquanto a cobrança não foi paga.

-- 1) Colunas ---------------------------------------------------------------
alter table public.cb_convenios
  add column if not exists credito_limite_inicial numeric(10,2);

alter table public.contratos_assinatura
  add column if not exists credito_limite numeric(10,2),
  add column if not exists credito_revisado_em timestamptz;

alter table public.contrato_mensalidades
  add column if not exists origem text;

alter table public.fin_lancamentos
  add column if not exists credito_mensalidade_id uuid
    references public.contrato_mensalidades (id) on delete set null;

create index if not exists idx_fin_lanc_credito_mensalidade
  on public.fin_lancamentos (credito_mensalidade_id)
  where credito_mensalidade_id is not null;

-- 2) Histórico das revisões de limite --------------------------------------
create table if not exists public.credito_clinica_revisoes (
  id uuid primary key default gen_random_uuid(),
  clinica_id uuid not null references public.clinicas (id) on delete cascade,
  contrato_id uuid not null references public.contratos_assinatura (id) on delete cascade,
  limite_anterior numeric(10,2),
  limite_novo numeric(10,2) not null,
  observacao text not null,
  revisado_por uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_credito_revisoes_contrato
  on public.credito_clinica_revisoes (contrato_id, created_at desc);

alter table public.credito_clinica_revisoes enable row level security;

drop policy if exists credito_revisoes_select on public.credito_clinica_revisoes;
create policy credito_revisoes_select on public.credito_clinica_revisoes
  for select using (public.is_member(auth.uid(), clinica_id));
-- Sem policy de escrita: só a função revisar_limite_credito_clinica grava.

-- 3) Quanto do lançamento foi pago com crédito -----------------------------
create or replace function public.credito_clinica_valor_do_lancamento(
  _forma text, _valor numeric, _composicao jsonb
)
returns numeric
language sql
immutable
as $$
  select case
    when _forma = 'credito_clinica' then coalesce(_valor, 0)
    when jsonb_typeof(_composicao -> 'partes') = 'array' then coalesce((
      select sum((p ->> 'valor')::numeric)
      from jsonb_array_elements(_composicao -> 'partes') p
      where p ->> 'forma' = 'credito_clinica'
    ), 0)
    else 0
  end;
$$;

-- 4) Situação do crédito de um paciente (núcleo, sem checagem de acesso) ---
create or replace function public._credito_clinica_situacao(
  _paciente_id uuid, _clinica_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_c record;
  v_pagas int;
  v_renov boolean;
  v_atraso boolean;
  v_limite numeric;
  v_usado numeric;
  v_base date;
  v_prox date;
begin
  select c.id, c.data_inicio, c.credito_limite, c.credito_revisado_em,
         c.contrato_origem_id, c.numero_renovacoes,
         v.credito_limite_inicial, v.nome as convenio_nome
    into v_c
  from public.contratos_assinatura c
  join public.cb_convenios v on v.id = c.convenio_id
  where c.clinica_id = _clinica_id
    and c.paciente_id = _paciente_id
    and c.status = 'ativo'
    and coalesce(c.titular_apenas_financeiro, false) = false
    and coalesce(v.credito_limite_inicial, 0) > 0
  order by c.data_inicio desc nulls last
  limit 1;

  if v_c.id is null then
    return jsonb_build_object('apto', false, 'motivo', 'sem_credito');
  end if;

  select count(*) into v_pagas
  from public.contrato_mensalidades
  where contrato_id = v_c.id and numero_parcela > 0 and status = 'pago';

  v_renov := v_c.contrato_origem_id is not null or coalesce(v_c.numero_renovacoes, 0) > 0;

  select exists (
    select 1 from public.contrato_mensalidades
    where contrato_id = v_c.id
      and status in ('pendente', 'aberto', 'atrasado')
      and vencimento < v_hoje - public.contrato_dias_tolerancia()
  ) into v_atraso;

  v_limite := coalesce(v_c.credito_limite, v_c.credito_limite_inicial);

  select coalesce(sum(valor), 0) into v_usado
  from public.contrato_mensalidades
  where contrato_id = v_c.id
    and origem = 'credito_clinica'
    and status in ('pendente', 'aberto', 'atrasado');

  -- Revisão a cada 6 meses, contados da última revisão ou do dia em que a
  -- 6ª mensalidade foi paga (quando o crédito foi liberado).
  select (pago_em at time zone 'America/Sao_Paulo')::date into v_base
  from public.contrato_mensalidades
  where contrato_id = v_c.id and numero_parcela > 0 and status = 'pago'
  order by numero_parcela
  offset 5 limit 1;
  v_base := coalesce((v_c.credito_revisado_em at time zone 'America/Sao_Paulo')::date,
                     v_base, v_c.data_inicio);
  v_prox := (v_base + interval '6 months')::date;

  return jsonb_build_object(
    'apto', (v_pagas >= 6 or v_renov) and not v_atraso,
    'motivo', case
      when v_atraso then 'atraso'
      when v_pagas < 6 and not v_renov then 'carencia'
      else null end,
    'contrato_id', v_c.id,
    'convenio_nome', v_c.convenio_nome,
    'mensalidades_pagas', v_pagas,
    'faltam_mensalidades', case when v_renov then 0 else greatest(6 - v_pagas, 0) end,
    'limite', v_limite,
    'usado', v_usado,
    'disponivel', greatest(v_limite - v_usado, 0),
    'proxima_revisao', v_prox,
    'revisao_pendente', v_hoje >= v_prox
  );
end;
$$;

-- Versão chamada pela tela: só para membros da clínica.
create or replace function public.credito_clinica_situacao(
  _paciente_id uuid, _clinica_id uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  if auth.uid() is null or not public.is_member(auth.uid(), _clinica_id) then
    raise exception 'Acesso negado';
  end if;
  return public._credito_clinica_situacao(_paciente_id, _clinica_id);
end;
$$;

grant execute on function public.credito_clinica_situacao(uuid, uuid) to authenticated;

-- 5) Gatilho: uso do crédito vira cobrança no contrato ----------------------
create or replace function public.fn_credito_clinica_usar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_valor numeric;
  v_sit jsonb;
  v_contrato uuid;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_venc date;
  v_dia int;
  v_mens_id uuid;
  v_num int;
  v_nota text;
begin
  v_valor := public.credito_clinica_valor_do_lancamento(
    NEW.forma_pagamento, NEW.valor, NEW.composicao_pagamento);
  if v_valor <= 0 then
    return NEW;
  end if;

  if NEW.tipo <> 'receita' or NEW.status <> 'confirmado' then
    raise exception 'Crédito na clínica só pode pagar um recebimento confirmado.';
  end if;
  if NEW.paciente_id is null then
    raise exception 'Crédito na clínica: informe o paciente (titular do cartão).';
  end if;

  v_sit := public._credito_clinica_situacao(NEW.paciente_id, NEW.clinica_id);
  v_contrato := nullif(v_sit ->> 'contrato_id', '')::uuid;
  if v_contrato is null then
    raise exception 'Este paciente não tem Crédito na clínica (só o titular do cartão com crédito).';
  end if;

  -- Trava o contrato: dois recebimentos ao mesmo tempo não podem passar do limite.
  perform 1 from public.contratos_assinatura where id = v_contrato for update;
  v_sit := public._credito_clinica_situacao(NEW.paciente_id, NEW.clinica_id);

  if (v_sit ->> 'motivo') = 'atraso' then
    raise exception 'Crédito na clínica bloqueado: o contrato tem cobrança em atraso.';
  end if;
  if (v_sit ->> 'motivo') = 'carencia' then
    raise exception 'Crédito na clínica liberado só após 6 mensalidades pagas (faltam %).',
      v_sit ->> 'faltam_mensalidades';
  end if;
  if v_valor > (v_sit ->> 'disponivel')::numeric + 0.005 then
    raise exception 'Crédito na clínica insuficiente: disponível R$ %.',
      to_char((v_sit ->> 'disponivel')::numeric, 'FM999G990D00');
  end if;

  -- Vence junto com a próxima mensalidade em aberto; sem ela, no próximo
  -- dia de vencimento do contrato.
  select min(vencimento) into v_venc
  from public.contrato_mensalidades
  where contrato_id = v_contrato and numero_parcela > 0
    and status in ('pendente', 'aberto', 'atrasado')
    and vencimento >= v_hoje;
  if v_venc is null then
    select coalesce(dia_vencimento, extract(day from v_hoje)::int) into v_dia
    from public.contratos_assinatura where id = v_contrato;
    v_venc := make_date(extract(year from v_hoje)::int, extract(month from v_hoje)::int, 1)
              + interval '1 month';
    v_venc := v_venc + (least(v_dia,
      extract(day from (v_venc + interval '1 month' - interval '1 day'))::int) - 1);
  end if;

  v_nota := format('%s: R$ %s — %s', to_char(v_hoje, 'DD/MM/YYYY'),
                   to_char(v_valor, 'FM999G990D00'), coalesce(NEW.descricao, 'atendimento'));

  select id into v_mens_id
  from public.contrato_mensalidades
  where contrato_id = v_contrato and origem = 'credito_clinica'
    and vencimento = v_venc and status in ('pendente', 'aberto')
  limit 1
  for update;

  if v_mens_id is not null then
    update public.contrato_mensalidades
       set valor = valor + v_valor,
           observacoes = concat_ws(E'\n', observacoes, v_nota),
           updated_at = now()
     where id = v_mens_id;
  else
    select least(coalesce(min(numero_parcela), 0), 0) - 1 into v_num
    from public.contrato_mensalidades where contrato_id = v_contrato;
    insert into public.contrato_mensalidades (
      clinica_id, contrato_id, numero_parcela, vencimento, valor, status,
      origem, observacoes
    ) values (
      NEW.clinica_id, v_contrato, v_num, v_venc, v_valor, 'pendente',
      'credito_clinica', concat('CRÉDITO NA CLÍNICA', E'\n', v_nota)
    )
    returning id into v_mens_id;
  end if;

  NEW.credito_mensalidade_id := v_mens_id;
  return NEW;
end;
$$;

drop trigger if exists trg_credito_clinica_usar on public.fin_lancamentos;
create trigger trg_credito_clinica_usar
  before insert on public.fin_lancamentos
  for each row execute function public.fn_credito_clinica_usar();

-- 6) Gatilho: estorno/cancelamento devolve o crédito -----------------------
create or replace function public.fn_credito_clinica_devolver()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_valor numeric;
  v_m record;
begin
  if OLD.credito_mensalidade_id is null then
    return coalesce(NEW, OLD);
  end if;
  if TG_OP = 'UPDATE' and not (NEW.status = 'cancelado' and OLD.status <> 'cancelado') then
    return NEW;
  end if;

  v_valor := public.credito_clinica_valor_do_lancamento(
    OLD.forma_pagamento, OLD.valor, OLD.composicao_pagamento);
  if v_valor <= 0 then
    return coalesce(NEW, OLD);
  end if;

  select id, status, valor into v_m
  from public.contrato_mensalidades
  where id = OLD.credito_mensalidade_id
  for update;

  if v_m.id is not null and v_m.status not in ('pago', 'cancelado') then
    update public.contrato_mensalidades
       set valor = greatest(valor - v_valor, 0),
           status = case when valor - v_valor <= 0.004 then 'cancelado' else status end,
           observacoes = concat_ws(E'\n', observacoes, format('%s: estorno de R$ %s',
             to_char((now() at time zone 'America/Sao_Paulo')::date, 'DD/MM/YYYY'),
             to_char(v_valor, 'FM999G990D00'))),
           updated_at = now()
     where id = v_m.id;
  elsif v_m.id is not null and v_m.status = 'pago' then
    raise exception 'A cobrança deste Crédito na clínica já foi paga pelo titular. Para estornar, fale com o financeiro.';
  end if;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists trg_credito_clinica_devolver_upd on public.fin_lancamentos;
create trigger trg_credito_clinica_devolver_upd
  after update of status on public.fin_lancamentos
  for each row execute function public.fn_credito_clinica_devolver();

drop trigger if exists trg_credito_clinica_devolver_del on public.fin_lancamentos;
create trigger trg_credito_clinica_devolver_del
  after delete on public.fin_lancamentos
  for each row execute function public.fn_credito_clinica_devolver();

-- 7) Revisão do limite (alçada nominal 'credito_clinica') ------------------
create or replace function public.revisar_limite_credito_clinica(
  _contrato_id uuid, _limite numeric, _observacao text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_c record;
begin
  select c.id, c.clinica_id, coalesce(c.credito_limite, v.credito_limite_inicial) as limite
    into v_c
  from public.contratos_assinatura c
  join public.cb_convenios v on v.id = c.convenio_id
  where c.id = _contrato_id;

  if v_c.id is null then
    raise exception 'Contrato não encontrado';
  end if;
  if auth.uid() is null
     or not public.tem_alcada_nominal(auth.uid(), v_c.clinica_id, 'credito_clinica') then
    raise exception 'Sem autorização para revisar o Crédito na clínica.';
  end if;
  if _limite is null or _limite < 0 then
    raise exception 'Informe um limite válido.';
  end if;
  if coalesce(btrim(_observacao), '') = '' then
    raise exception 'Escreva o motivo da revisão.';
  end if;

  insert into public.credito_clinica_revisoes (
    clinica_id, contrato_id, limite_anterior, limite_novo, observacao, revisado_por
  ) values (
    v_c.clinica_id, v_c.id, v_c.limite, _limite, btrim(_observacao), auth.uid()
  );

  update public.contratos_assinatura
     set credito_limite = _limite, credito_revisado_em = now()
   where id = v_c.id;
end;
$$;

grant execute on function public.revisar_limite_credito_clinica(uuid, numeric, text) to authenticated;

comment on column public.cb_convenios.credito_limite_inicial is
  'Crédito na clínica: limite inicial do titular (NULL = convênio sem crédito).';
comment on column public.contrato_mensalidades.origem is
  'NULL = parcela/taxa normal; credito_clinica = cobrança do Crédito na clínica.';
