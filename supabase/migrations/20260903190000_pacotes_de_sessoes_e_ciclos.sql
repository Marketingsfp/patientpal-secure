-- ============================================================================
-- Pacotes de sessões (Fisioterapia) e ciclos de manutenção (Ortodontia)
-- ============================================================================
-- Conferido no banco de produção em 03/09/2026, antes de escrever:
--
--   * `fisio_pacotes` / `fisio_sessoes` já existem desde 20/08 e estão
--     praticamente vazias (1 pacote, 10 sessões, nenhuma ligada a agendamento).
--     A estrutura foi construída e nunca adotada, porque criar o pacote era um
--     ato manual numa tela que a recepção não abre. Esta migration muda isso:
--     o pacote passa a nascer sozinho no momento da VENDA.
--
--   * O orçamento NÃO é a espinha do dinheiro aqui. Em produção existem 92
--     orçamentos, todos de laboratório e todos em aberto; fisioterapia e
--     odontologia não passam por orçamento nenhum. O dinheiro do pacote entra
--     como lançamento de receita ligado ao agendamento da venda — R$ 9.680 em
--     51 vendas de "FISIOTERAPIA (5 SESSOES)" entre julho e setembro. Por isso
--     a situação financeira do relatório sai de `fin_lancamentos`, e o vínculo
--     com orçamento continua existindo mas opcional.
--
--   * Ortodontia é OUTRA COISA, não um pacote. A manutenção do aparelho é
--     cobrada por comparecimento (≈R$ 95 por visita, 36 lançamentos em 38
--     agendamentos). Quem falta não acumula dívida — vira busca ativa. Por isso
--     manutenção não cria pacote nem sessão: é um ciclo derivado do histórico
--     da agenda, e o relatório dela nunca soma cobrança retroativa.
--
-- ATENÇÃO: nada aqui altera cobrança, caixa, guia de recebimento ou repasse.
-- Todas as funções novas são de leitura, com exceção do gatilho que grava em
-- `fisio_pacotes`/`fisio_sessoes`.
-- ============================================================================

-- ── 1. Cadastro do procedimento ─────────────────────────────────────────────
-- Hoje o "(5 SESSOES)" existe apenas dentro do NOME do procedimento, como
-- texto. Ninguém consegue perguntar ao banco quantas sessões um pacote tem.
-- Estas duas colunas transformam isso em dado.

alter table public.procedimentos
  add column if not exists sessoes_incluidas smallint,
  add column if not exists ciclo_dias smallint;

comment on column public.procedimentos.sessoes_incluidas is
  'Quantas sessões o paciente leva ao comprar este procedimento uma vez. '
  '2 ou mais faz o pacote nascer sozinho no agendamento da venda. '
  'NULL ou 1 = procedimento avulso, comportamento de sempre.';

comment on column public.procedimentos.ciclo_dias is
  'Intervalo esperado entre um comparecimento e o próximo (30 = manutenção '
  'mensal de aparelho ortodôntico). Não cria pacote nem cobrança: serve só '
  'para o relatório saber quando o paciente está atrasado.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'procedimentos_sessoes_incluidas_check') then
    alter table public.procedimentos
      add constraint procedimentos_sessoes_incluidas_check
      check (sessoes_incluidas is null or (sessoes_incluidas >= 1 and sessoes_incluidas <= 200));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'procedimentos_ciclo_dias_check') then
    alter table public.procedimentos
      add constraint procedimentos_ciclo_dias_check
      check (ciclo_dias is null or (ciclo_dias >= 1 and ciclo_dias <= 365));
  end if;
end $$;

-- ── 2. Preenchimento do cadastro que já existe ──────────────────────────────
-- O número sai do próprio nome ("FISIOTERAPIA (5 SESSOES)" -> 5, "RPG 5
-- SESSOES" -> 5). O `[0-9]+` antes de SESS é o que separa um pacote de um
-- procedimento cobrado POR sessão ("EXERCICIO ORTOPTICO CADA SESSAO",
-- "FRAAX POR SESSAO"), que continua avulso.
--
-- Só preenche onde ainda está nulo: um ajuste manual feito depois pela
-- gerência nunca é sobrescrito por uma reexecução desta migration.

update public.procedimentos p
   set sessoes_incluidas = sub.n
  from (
    select id, substring(upper(nome) from '([0-9]+)\s*SESS')::int as n
      from public.procedimentos
  ) sub
 where sub.id = p.id
   and p.sessoes_incluidas is null
   and sub.n is not null
   and sub.n between 2 and 200;

-- Manutenção de aparelho: ciclo mensal. Nenhuma delas vira pacote.
update public.procedimentos
   set ciclo_dias = 30
 where ciclo_dias is null
   and upper(translate(nome, 'ÇÃÕÁÉÍÓÚ', 'CAOAEIOU')) like '%MANUTEN%';

-- ── 3. Casamento entre o texto da agenda e o cadastro ───────────────────────
-- `agendamentos.procedimento` é texto livre e NÃO tem chave estrangeira para
-- `procedimentos` — a agenda grava "NOME (ESPECIALIDADE)". Estas funções são a
-- ponte. Conferido contra os 9 nomes reais em produção: todos casam.

create or replace function public.fn_norm_proc(_t text)
returns text
language sql
immutable
as $fn$
  select upper(btrim(regexp_replace(
    translate(coalesce(_t, ''),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇáàâãäéèêëíìîïóòôõöúùûüç',
      'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'),
    '\s+', ' ', 'g')))
$fn$;

comment on function public.fn_norm_proc(text) is
  'Normaliza nome de procedimento para comparação: sem acento, maiúsculo, '
  'espaços colapsados. IMMUTABLE de propósito (unaccent não é).';

-- As duas leituras possíveis do texto da agenda: inteiro, e sem o último
-- parêntese (que é a especialidade). "MANUTENCAO (ODONTOLOGIA)" -> também
-- "MANUTENCAO"; "APARELHO DE METAL ( SO MANUTENCAO )" casa inteiro, porque o
-- parêntese ali faz parte do nome cadastrado.
create or replace function public.fn_proc_chaves(_texto text)
returns text[]
language sql
immutable
as $fn$
  select array[
    public.fn_norm_proc(_texto),
    public.fn_norm_proc(regexp_replace(coalesce(_texto, ''), '\s*\([^()]*\)\s*$', ''))
  ]
$fn$;

create or replace function public.fn_procedimento_por_texto(_clinica_id uuid, _texto text)
returns uuid
language sql
stable
security definer
set search_path = public
as $fn$
  select pr.id
    from public.procedimentos pr
   where pr.clinica_id = _clinica_id
     and public.fn_norm_proc(pr.nome) = any (public.fn_proc_chaves(_texto))
   order by pr.ativo desc, pr.created_at
   limit 1
$fn$;

revoke all on function public.fn_procedimento_por_texto(uuid, text) from public, anon;
grant execute on function public.fn_procedimento_por_texto(uuid, text) to authenticated, service_role;

-- ── 4. O pacote nasce na venda ──────────────────────────────────────────────
-- Gatilho em `agendamentos`. Quando a recepção marca um procedimento que tem
-- `sessoes_incluidas >= 2`, o pacote e as N sessões são criados na hora, com a
-- sessão 1 já amarrada a esse agendamento.
--
-- SECURITY DEFINER por necessidade: quem mexe na agenda é a recepção, que não
-- tem o módulo `fisioterapia` liberado (conferido nos perfis de acesso). Sem
-- isso a policy de INSERT recusaria as linhas e o pacote simplesmente não
-- nasceria, em silêncio.
--
-- O corpo inteiro está dentro de um EXCEPTION: criar um agendamento é o ato
-- mais crítico do balcão e NUNCA pode falhar por causa do controle de sessões.
-- Se algo aqui der errado, o agendamento é salvo do mesmo jeito e fica um
-- aviso no log do banco.

create or replace function public.fn_pacote_sessoes_auto()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_proc_id     uuid;
  v_proc_nome   text;
  v_sessoes     smallint;
  v_valor       numeric;
  v_pacote_id   uuid;
  v_sessao_id   uuid;
  v_status      text;
begin
  if new.paciente_id is null or new.status = 'cancelado' then
    return new;
  end if;

  -- Este agendamento já é sessão de algum pacote (reprocessamento, importação).
  if exists (select 1 from public.fisio_sessoes s where s.agendamento_id = new.id) then
    return new;
  end if;

  select pr.id, pr.nome, pr.sessoes_incluidas, coalesce(pr.valor_padrao, 0)
    into v_proc_id, v_proc_nome, v_sessoes, v_valor
    from public.procedimentos pr
   where pr.id = public.fn_procedimento_por_texto(new.clinica_id, new.procedimento);

  if v_proc_id is null or coalesce(v_sessoes, 0) < 2 then
    return new;
  end if;

  v_status := case new.status
                when 'realizado' then 'realizada'
                when 'faltou'    then 'faltou'
                else 'agendada'
              end;

  -- Já existe pacote ATIVO deste paciente para este mesmo procedimento com
  -- sessão sobrando? Então este agendamento é a sessão seguinte, e não uma
  -- venda nova. É o que impede a recepção de duplicar o pacote ao marcar a
  -- sessão 2 direto pela agenda, e o que faz a grade se preencher sozinha.
  select p.id
    into v_pacote_id
    from public.fisio_pacotes p
   where p.clinica_id = new.clinica_id
     and p.paciente_id = new.paciente_id
     and p.procedimento_id = v_proc_id
     and p.status = 'ativo'
     and exists (
       select 1 from public.fisio_sessoes s
        where s.pacote_id = p.id and s.status = 'pendente'
     )
   order by p.data_inicio desc
   limit 1;

  if v_pacote_id is null then
    insert into public.fisio_pacotes (
      clinica_id, paciente_id, descricao, procedimento_id, total_sessoes,
      valor_total, data_inicio, status, profissional_id, observacoes, created_by
    ) values (
      new.clinica_id, new.paciente_id, v_proc_nome, v_proc_id, v_sessoes,
      v_valor, (new.inicio at time zone 'America/Sao_Paulo')::date, 'ativo',
      new.medico_id, 'Aberto automaticamente pelo agendamento da venda.', new.criado_por
    )
    returning id into v_pacote_id;

    insert into public.fisio_sessoes (clinica_id, pacote_id, numero, status, profissional_id)
    select new.clinica_id, v_pacote_id, g, 'pendente', new.medico_id
      from generate_series(1, v_sessoes) g;
  end if;

  -- Amarra a primeira sessão ainda pendente a este agendamento.
  select s.id into v_sessao_id
    from public.fisio_sessoes s
   where s.pacote_id = v_pacote_id and s.status = 'pendente'
   order by s.numero
   limit 1;

  if v_sessao_id is not null then
    update public.fisio_sessoes
       set agendamento_id = new.id,
           data_prevista  = (new.inicio at time zone 'America/Sao_Paulo')::date,
           status         = v_status,
           realizada_em   = case when new.status = 'realizado' then now() else null end,
           profissional_id = coalesce(profissional_id, new.medico_id),
           updated_at     = now()
     where id = v_sessao_id;
  end if;

  return new;
exception
  when others then
    raise warning 'fn_pacote_sessoes_auto: agendamento % nao gerou pacote (%). Agendamento preservado.',
      new.id, sqlerrm;
    return new;
end
$fn$;

revoke all on function public.fn_pacote_sessoes_auto() from public, anon;

drop trigger if exists trg_pacote_sessoes_auto on public.agendamentos;
create trigger trg_pacote_sessoes_auto
  after insert on public.agendamentos
  for each row execute function public.fn_pacote_sessoes_auto();

-- ── 5. Remarcação mantém a data prevista da sessão ──────────────────────────
-- O gatilho de status que já existia (`trg_fisio_sync_sessao`) cuida de
-- realizado/faltou/cancelado. Faltava o caso de a recepção arrastar o
-- agendamento para outro dia: a sessão ficava com a data antiga e o relatório
-- de faltosos apontava um atraso que não existe.

create or replace function public.fn_fisio_sync_data_sessao()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.inicio is distinct from old.inicio then
    update public.fisio_sessoes
       set data_prevista = (new.inicio at time zone 'America/Sao_Paulo')::date,
           updated_at = now()
     where agendamento_id = new.id;
  end if;
  return new;
end
$fn$;

revoke all on function public.fn_fisio_sync_data_sessao() from public, anon;

drop trigger if exists trg_fisio_sync_data_sessao on public.agendamentos;
create trigger trg_fisio_sync_data_sessao
  after update of inicio on public.agendamentos
  for each row execute function public.fn_fisio_sync_data_sessao();

-- ── 6. Pacote se fecha sozinho ──────────────────────────────────────────────
-- Sem isso todo pacote fica "ativo" para sempre e a busca ativa passa a listar
-- gente que já terminou o tratamento. Uma falta CONSOME a sessão (o paciente
-- pagou por ela), então conta como sessão gasta para fechar o pacote.

create or replace function public.fn_pacote_fechar_quando_completo()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  update public.fisio_pacotes p
     set status = 'concluido', updated_at = now()
   where p.id = new.pacote_id
     and p.status = 'ativo'
     and not exists (
       select 1 from public.fisio_sessoes s
        where s.pacote_id = p.id and s.status in ('pendente', 'agendada')
     );
  return new;
end
$fn$;

revoke all on function public.fn_pacote_fechar_quando_completo() from public, anon;

drop trigger if exists trg_pacote_fechar on public.fisio_sessoes;
create trigger trg_pacote_fechar
  after insert or update of status on public.fisio_sessoes
  for each row execute function public.fn_pacote_fechar_quando_completo();

-- ── 7. Aviso de cobrança dobrada ────────────────────────────────────────────
-- A sessão 2 de um pacote de 5 já foi paga na venda. Se a recepção cobrar de
-- novo por hábito, o paciente paga duas vezes e o caixa do dia fecha errado.
-- Esta função responde "este agendamento já está coberto por um pacote pago?"
-- para a tela de recebimento avisar ANTES de gravar.
--
-- SECURITY DEFINER porque quem recebe é o caixa, que não enxerga fisio_*.
-- Devolve só o necessário para o aviso — nada de conteúdo clínico.

create or replace function public.fn_agendamento_coberto_por_pacote(_agendamento_id uuid)
returns table (
  coberto     boolean,
  pacote_id   uuid,
  descricao   text,
  numero      smallint,
  total       smallint,
  valor_pago  numeric
)
language sql
stable
security definer
set search_path = public
as $fn$
  select
    true,
    p.id,
    p.descricao,
    s.numero,
    p.total_sessoes,
    coalesce((
      select sum(l.valor)
        from public.fisio_sessoes s2
        join public.fin_lancamentos l on l.agendamento_id = s2.agendamento_id
       where s2.pacote_id = p.id
         and l.tipo = 'receita'
         and l.status = 'confirmado'
    ), 0)
  from public.fisio_sessoes s
  join public.fisio_pacotes p on p.id = s.pacote_id
  where s.agendamento_id = _agendamento_id
    and s.numero > 1
    and p.status <> 'cancelado'
$fn$;

revoke all on function public.fn_agendamento_coberto_por_pacote(uuid) from public, anon;
grant execute on function public.fn_agendamento_coberto_por_pacote(uuid) to authenticated, service_role;

-- ── 8. A grade de sessões na ficha do paciente ──────────────────────────────
-- A recepção precisa VER a grade ("3 de 5, próxima dia 12") mas não tem o
-- módulo `fisioterapia`. As tabelas continuam fechadas; o que abre é esta
-- leitura, que devolve apenas a parte administrativa. Evolução da sessão,
-- dor antes/depois e qualquer texto clínico ficam DE FORA de propósito.

create or replace function public.fn_pacotes_do_paciente(_paciente_id uuid)
returns table (
  pacote_id       uuid,
  descricao       text,
  status          text,
  total_sessoes   smallint,
  data_inicio     date,
  valor_total     numeric,
  valor_pago      numeric,
  sessao_id       uuid,
  numero          smallint,
  sessao_status   text,
  data_prevista   date,
  agendamento_id  uuid
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
declare
  v_clinica uuid;
begin
  select pa.clinica_id into v_clinica from public.pacientes pa where pa.id = _paciente_id;
  if v_clinica is null then
    return;
  end if;
  -- Quem enxerga a ficha do paciente enxerga a grade. Nada além disso.
  if not public.has_module_access(auth.uid(), v_clinica, 'clientes', 'read') then
    raise exception 'Sem permissão para ver a ficha deste paciente.'
      using errcode = '42501';
  end if;

  return query
  select p.id, p.descricao, p.status, p.total_sessoes, p.data_inicio, p.valor_total,
         coalesce(pg.valor, 0),
         s.id, s.numero, s.status, s.data_prevista, s.agendamento_id
    from public.fisio_pacotes p
    join public.fisio_sessoes s on s.pacote_id = p.id
    left join lateral (
      select sum(l.valor) valor
        from public.fisio_sessoes s2
        join public.fin_lancamentos l on l.agendamento_id = s2.agendamento_id
       where s2.pacote_id = p.id and l.tipo = 'receita' and l.status = 'confirmado'
    ) pg on true
   where p.paciente_id = _paciente_id
   order by p.data_inicio desc, p.created_at desc, s.numero;
end
$fn$;

revoke all on function public.fn_pacotes_do_paciente(uuid) from public, anon;
grant execute on function public.fn_pacotes_do_paciente(uuid) to authenticated, service_role;

-- ── 9. O relatório ──────────────────────────────────────────────────────────
-- Duas naturezas na mesma folha, distinguidas pela coluna `origem`:
--
--   'pacote' — Fisioterapia e afins. Vendido fechado, pago na venda. A conta
--              é contratadas x realizadas, e a situação financeira compara o
--              que entrou de lançamento com o valor do pacote.
--
--   'ciclo'  — Manutenção de aparelho. NÃO tem total contratado, NÃO acumula
--              dívida: quem não veio no mês não deve nada. A situação
--              financeira é sempre 'por_visita' e o que interessa é há quantos
--              dias o paciente não aparece.
--
-- `_ate` é a data de referência dos dias parados, não só o fim da janela.

create or replace function public.fn_relatorio_sessoes(
  _clinica_id uuid,
  _de date,
  _ate date
)
returns table (
  origem              text,
  paciente_id         uuid,
  paciente_nome       text,
  prontuario          text,
  procedimento        text,
  profissional        text,
  total_sessoes       int,
  realizadas          int,
  faltas              int,
  restantes           int,
  valor_contratado    numeric,
  valor_pago          numeric,
  situacao_financeira text,
  ultima_data         date,
  proxima_data        date,
  dias_parado         int,
  pendencia           text
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if not (
    public.has_module_access(auth.uid(), _clinica_id, 'relatorios', 'read')
    or public.has_module_access(auth.uid(), _clinica_id, 'financeiro', 'read')
    or public.has_module_access(auth.uid(), _clinica_id, 'recepcao', 'read')
  ) then
    raise exception 'Sem permissão para este relatório.' using errcode = '42501';
  end if;

  return query
  -- ---------- Pacotes fechados (Fisioterapia) ----------
  with cont as (
    select s.pacote_id,
           count(*) filter (where s.status = 'realizada')::int realizadas,
           count(*) filter (where s.status = 'faltou')::int    faltas,
           count(*) filter (where s.status in ('pendente','agendada'))::int restantes
      from public.fisio_sessoes s
     group by s.pacote_id
  ),
  pago as (
    select s.pacote_id, sum(l.valor) valor
      from public.fisio_sessoes s
      join public.fin_lancamentos l on l.agendamento_id = s.agendamento_id
     where l.tipo = 'receita' and l.status = 'confirmado'
     group by s.pacote_id
  ),
  ultima as (
    select s.pacote_id,
           max(coalesce((s.realizada_em at time zone 'America/Sao_Paulo')::date, s.data_prevista)) d
      from public.fisio_sessoes s
     where s.status in ('realizada','faltou')
     group by s.pacote_id
  ),
  proxima as (
    select s.pacote_id, min((a.inicio at time zone 'America/Sao_Paulo')::date) d
      from public.fisio_sessoes s
      join public.agendamentos a on a.id = s.agendamento_id
     where s.status = 'agendada'
       and (a.inicio at time zone 'America/Sao_Paulo')::date >= _ate
     group by s.pacote_id
  )
  select
    'pacote'::text,
    p.paciente_id,
    pa.nome::text,
    coalesce(nullif(btrim(pa.codigo_prontuario), ''), pa.codigo_prontuario_anterior, '')::text,
    p.descricao::text,
    coalesce(m.nome, '')::text,
    p.total_sessoes::int,
    coalesce(c.realizadas, 0),
    coalesce(c.faltas, 0),
    coalesce(c.restantes, p.total_sessoes::int),
    p.valor_total,
    coalesce(pg.valor, 0),
    case
      when coalesce(pg.valor, 0) <= 0.004 then 'aberto'
      when p.valor_total <= 0.004 then 'pago'
      when coalesce(pg.valor, 0) + 0.004 >= p.valor_total then 'pago'
      else 'parcial'
    end::text,
    u.d,
    px.d,
    case
      when coalesce(c.restantes, 1) = 0 then null
      when px.d is not null then 0
      else greatest(0, (_ate - coalesce(u.d, p.data_inicio)))
    end,
    case
      when coalesce(c.restantes, 1) = 0 then 'Pacote concluído'
      when px.d is not null then 'Próxima em ' || to_char(px.d, 'DD/MM/YYYY')
      else 'Sem agendamento'
    end::text
  from public.fisio_pacotes p
  join public.pacientes pa on pa.id = p.paciente_id
  left join public.medicos m on m.id = p.profissional_id
  left join cont c    on c.pacote_id = p.id
  left join pago pg   on pg.pacote_id = p.id
  left join ultima u  on u.pacote_id = p.id
  left join proxima px on px.pacote_id = p.id
  where p.clinica_id = _clinica_id
    and p.status <> 'cancelado'
    -- Pacote ainda aberto entra sempre (é para ele que a busca ativa existe);
    -- pacote já fechado entra só se começou dentro do período consultado.
    and (p.status = 'ativo' or p.data_inicio between _de and _ate)

  union all

  -- ---------- Ciclos de manutenção (Ortodontia) ----------
  select
    'ciclo'::text,
    v.paciente_id,
    v.paciente_nome,
    v.prontuario,
    v.proc_nome,
    coalesce(v.medico_nome, '')::text,
    0,
    v.comparecimentos,
    v.faltas,
    0,
    0::numeric,
    coalesce(v.valor_pago, 0),
    'por_visita'::text,
    v.ultima,
    v.proxima,
    case when v.proxima is not null then 0 else greatest(0, (_ate - v.ultima)) end,
    case
      when v.proxima is not null then 'Próxima em ' || to_char(v.proxima, 'DD/MM/YYYY')
      when (_ate - v.ultima) > (v.ciclo_dias * 2) then
        'Abandono — ' || (_ate - v.ultima) || ' dias sem manutenção'
      when (_ate - v.ultima) > v.ciclo_dias then
        'Atrasado — ' || (_ate - v.ultima) || ' dias sem manutenção'
      else 'Em dia'
    end::text
  from (
    select
      ag.paciente_id,
      pa.nome::text paciente_nome,
      coalesce(nullif(btrim(pa.codigo_prontuario), ''), pa.codigo_prontuario_anterior, '')::text prontuario,
      ag.proc_nome,
      ag.ciclo_dias,
      max(m.nome)::text medico_nome,
      count(*) filter (where ag.status = 'realizado')::int comparecimentos,
      count(*) filter (where ag.status = 'faltou')::int    faltas,
      max(ag.dia) filter (where ag.status = 'realizado') ultima,
      min(ag.dia) filter (where ag.status in ('agendado','confirmado') and ag.dia >= _ate) proxima,
      sum(ag.valor) valor_pago
    from (
      -- Uma linha por AGENDAMENTO, nunca mais que isso. O valor recebido vem
      -- de subconsulta lateral, e não de um join com `fin_lancamentos`: um
      -- atendimento pago em duas parcelas (46 casos na base hoje) duplicaria a
      -- linha no join e o paciente apareceria com o dobro de comparecimentos.
      select
        a.id,
        a.paciente_id,
        a.medico_id,
        a.status::text                                        as status,
        (a.inicio at time zone 'America/Sao_Paulo')::date      as dia,
        pr.nome::text                                         as proc_nome,
        pr.ciclo_dias,
        coalesce(pgo.valor, 0)                                as valor
      from public.agendamentos a
      join public.procedimentos pr
        on pr.clinica_id = a.clinica_id
       and pr.ciclo_dias is not null
       and public.fn_norm_proc(pr.nome) = any (public.fn_proc_chaves(a.procedimento))
      left join lateral (
        select sum(l.valor) valor
          from public.fin_lancamentos l
         where l.agendamento_id = a.id
           and l.tipo = 'receita'
           and l.status = 'confirmado'
      ) pgo on true
      where a.clinica_id = _clinica_id
        and a.paciente_id is not null
        and a.status <> 'cancelado'
        and (a.inicio at time zone 'America/Sao_Paulo')::date <= _ate
    ) ag
    join public.pacientes pa on pa.id = ag.paciente_id
    left join public.medicos m on m.id = ag.medico_id
    group by ag.paciente_id, pa.nome, pa.codigo_prontuario, pa.codigo_prontuario_anterior,
             ag.proc_nome, ag.ciclo_dias
  ) v
  -- Sem nenhum comparecimento não há ciclo em andamento — é alguém que só tem
  -- manutenção marcada para o futuro, e não é caso de busca ativa.
  where v.ultima is not null

  -- Quem está parado há mais tempo primeiro: a folha nasce já na ordem da
  -- busca ativa, que é o uso diário do relatório. (16 = dias_parado.)
  order by 1, 16 desc nulls last, 3;
end
$fn$;

revoke all on function public.fn_relatorio_sessoes(uuid, date, date) from public, anon;
grant execute on function public.fn_relatorio_sessoes(uuid, date, date) to authenticated, service_role;

-- ── 10. Índices de apoio ────────────────────────────────────────────────────
-- O relatório de ciclos varre os agendamentos COM paciente (16,7 mil hoje,
-- contra 94 mil no total). O índice parcial é o que mantém isso barato.

create index if not exists idx_agendamentos_paciente_proc
  on public.agendamentos (clinica_id, paciente_id, inicio)
  where paciente_id is not null;

create index if not exists idx_fin_lancamentos_agendamento
  on public.fin_lancamentos (agendamento_id)
  where agendamento_id is not null;
