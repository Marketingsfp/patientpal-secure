-- ============================================================================
-- Relatório de Sessões: expor o ciclo de retorno de cada linha
-- ============================================================================
--
-- A tela ganhou três cards de acompanhamento — Vencido, A vencer e Em dia — e
-- eles precisam saber QUAL é a janela de retorno de cada tratamento. Hoje esse
-- número existe só dentro da função: é o `ciclo_dias` do procedimento, que já
-- decide se a coluna Situação escreve "Em dia", "Atrasado" ou "Abandono".
--
-- Sem devolvê-lo, a tela teria que chutar 30 dias. Os quatro procedimentos de
-- manutenção cadastrados hoje usam 30, então o chute funcionaria — e quebraria
-- calado no dia em que alguém cadastrasse um retorno de 60 dias: os cards
-- diriam "vencido" para um paciente que a coluna Situação, ao lado, continuaria
-- chamando de "Em dia". Duas contas para a mesma pergunta, discordando na mesma
-- linha, é o pior resultado possível numa lista de cobrança.
--
-- O que muda: só a coluna nova no fim do retorno. Nenhuma linha entra ou sai da
-- folha, nenhum número existente foi tocado, e o site ainda publicado continua
-- funcionando — ele lê o retorno por nome de campo e simplesmente ignora o que
-- não conhece.
--
-- Em `movimento` a coluna volta nula de propósito: aquela visão é uma janela
-- fechada de produção ("o que foi realizado em agosto"), não a posição de
-- ninguém. Um prazo de retorno ali não descreveria nada.
-- ============================================================================

-- O tipo de retorno mudou, então não dá para usar CREATE OR REPLACE: o Postgres
-- recusa trocar o retorno de uma função existente.
drop function if exists public.fn_relatorio_sessoes(uuid, date, date, text);

create or replace function public.fn_relatorio_sessoes(
  _clinica_id uuid,
  _de date,
  _ate date,
  _modo text default 'posicao'
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
  pendencia           text,
  -- Janela de retorno cadastrada no procedimento, em dias. Nula quando o
  -- tratamento não tem ciclo cadastrado (é o caso dos pacotes de fisioterapia)
  -- e no modo movimento.
  ciclo_dias          int
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

  -- ══════════════════════════════════════════════════════════════════════════
  -- MODO MOVIMENTO — produção realizada DENTRO da janela _de.._ate
  -- ══════════════════════════════════════════════════════════════════════════
  -- Aqui `total_sessoes`, `restantes` e `valor_contratado` saem ZERADOS e a
  -- situação financeira sai como 'movimento'. Não é esquecimento: comparar o
  -- dinheiro que entrou num mês com o valor total de um pacote vendido em
  -- outro mês é a mesma soma indevida que já produziu "30 realizadas de 10
  -- contratadas". Quem pergunta produção do mês não está perguntando saldo do
  -- pacote, e a tela deste modo nem mostra essas colunas.
  if _modo = 'movimento' then
    return query
    with ocor as (
      -- Uma linha por sessão que ACONTECEU (ou foi falta) dentro da janela.
      -- A data vem do agendamento quando existe: é a data real do atendimento.
      select
        s.pacote_id,
        s.status,
        coalesce(
          (a.inicio at time zone 'America/Sao_Paulo')::date,
          (s.realizada_em at time zone 'America/Sao_Paulo')::date,
          s.data_prevista
        ) as dia
      from public.fisio_sessoes s
      left join public.agendamentos a on a.id = s.agendamento_id
      where s.clinica_id = _clinica_id
        and s.status in ('realizada', 'faltou')
    ),
    ocor_periodo as (
      select * from ocor where dia between _de and _ate
    ),
    conta as (
      select o.pacote_id,
             count(*) filter (where o.status = 'realizada')::int realizadas,
             count(*) filter (where o.status = 'faltou')::int    faltas,
             max(o.dia) ultima
        from ocor_periodo o
       group by o.pacote_id
    ),
    -- Dinheiro que entrou NA JANELA por qualquer sessão do pacote. Fica fora
    -- de `ocor_periodo` de propósito: a venda de um pacote é receita do mês
    -- mesmo que a primeira sessão só vá acontecer no mês seguinte.
    recebido as (
      select s.pacote_id, sum(l.valor) v
        from public.fisio_sessoes s
        join public.fin_lancamentos l on l.agendamento_id = s.agendamento_id
       where s.clinica_id = _clinica_id
         and l.tipo = 'receita'
         and l.status = 'confirmado'
         and l.data between _de and _ate
       group by s.pacote_id
    ),
    -- Um pacote entra na folha se teve atendimento OU se teve dinheiro na
    -- janela. Só as duas coisas juntas descrevem a produção do período.
    base as (
      select pacote_id from conta
      union
      select pacote_id from recebido
    ),
    prox as (
      select s.pacote_id, min((a.inicio at time zone 'America/Sao_Paulo')::date) d
        from public.fisio_sessoes s
        join public.agendamentos a on a.id = s.agendamento_id
       where s.status = 'agendada'
         and (a.inicio at time zone 'America/Sao_Paulo')::date > _ate
       group by s.pacote_id
    )
    select
      'pacote'::text,
      p.paciente_id,
      pa.nome::text,
      coalesce(nullif(btrim(pa.codigo_prontuario), ''), pa.codigo_prontuario_anterior, '')::text,
      p.descricao::text,
      coalesce(m.nome, '')::text,
      0,
      coalesce(c.realizadas, 0),
      coalesce(c.faltas, 0),
      0,
      0::numeric,
      coalesce(r.v, 0),
      'movimento'::text,
      c.ultima,
      px.d,
      null::int,
      (coalesce(c.realizadas, 0) || ' sessão(ões) no período')::text,
      null::int
    from base b
    join public.fisio_pacotes p on p.id = b.pacote_id
    join public.pacientes pa on pa.id = p.paciente_id
    left join public.medicos m on m.id = p.profissional_id
    left join conta c    on c.pacote_id = b.pacote_id
    left join recebido r on r.pacote_id = b.pacote_id
    left join prox px    on px.pacote_id = b.pacote_id
    where p.clinica_id = _clinica_id
      and p.status <> 'cancelado'

    union all

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
      'movimento'::text,
      v.ultima,
      v.proxima,
      null::int,
      (v.comparecimentos || ' visita(s) no período')::text,
      null::int
    from (
      select
        ag.paciente_id,
        pa.nome::text paciente_nome,
        coalesce(nullif(btrim(pa.codigo_prontuario), ''), pa.codigo_prontuario_anterior, '')::text prontuario,
        ag.proc_nome,
        max(m.nome)::text medico_nome,
        count(*) filter (where ag.status = 'realizado' and ag.dia between _de and _ate)::int comparecimentos,
        count(*) filter (where ag.status = 'faltou'    and ag.dia between _de and _ate)::int    faltas,
        max(ag.dia) filter (where ag.status = 'realizado' and ag.dia between _de and _ate) ultima,
        min(ag.dia) filter (where ag.status in ('agendado','confirmado') and ag.dia > _ate)   proxima,
        sum(ag.valor) filter (where ag.dia between _de and _ate) valor_pago
      from (
        -- Mesma precaução do modo posição: uma linha por AGENDAMENTO. O valor
        -- vem de subconsulta lateral porque um atendimento pago em duas
        -- parcelas duplicaria a linha num join e dobraria a contagem.
        select
          a.paciente_id,
          a.medico_id,
          a.status::text                                    as status,
          (a.inicio at time zone 'America/Sao_Paulo')::date  as dia,
          pr.nome::text                                     as proc_nome,
          coalesce(pgo.valor, 0)                            as valor
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
      ) ag
      join public.pacientes pa on pa.id = ag.paciente_id
      left join public.medicos m on m.id = ag.medico_id
      group by ag.paciente_id, pa.nome, pa.codigo_prontuario, pa.codigo_prontuario_anterior,
               ag.proc_nome
    ) v
    -- Quem não teve nem atendimento, nem falta, nem dinheiro na janela não é
    -- produção do período.
    --
    -- O terceiro critério não é excesso de zelo: em agosto de 2026 existe uma
    -- manutenção com R$ 95,00 recebidos e o agendamento ainda em "agendado",
    -- porque a recepção cobrou e não clicou na presença. Sem esta linha o
    -- relatório fecharia agosto R$ 95,00 abaixo do caixa. A visita continua
    -- NÃO sendo contada (presença nunca sai de pagamento), então a linha
    -- aparece com 0 visitas e o valor recebido — que é exatamente o sinal que
    -- a coordenação precisa ver.
    where v.comparecimentos > 0 or v.faltas > 0 or coalesce(v.valor_pago, 0) <> 0

    order by 1, 8 desc, 3;

    return;
  end if;

  -- ══════════════════════════════════════════════════════════════════════════
  -- MODO POSIÇÃO (padrão) — onde cada paciente está na data _ate
  -- ══════════════════════════════════════════════════════════════════════════
  return query
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
    end::text,
    -- Pacote de fisioterapia não tem ciclo cadastrado; quando o procedimento
    -- de origem tiver um, ele é respeitado sem mudar mais nada.
    prc.ciclo_dias
  from public.fisio_pacotes p
  join public.pacientes pa on pa.id = p.paciente_id
  left join public.medicos m on m.id = p.profissional_id
  left join public.procedimentos prc on prc.id = p.procedimento_id
  left join cont c    on c.pacote_id = p.id
  left join pago pg   on pg.pacote_id = p.id
  left join ultima u  on u.pacote_id = p.id
  left join proxima px on px.pacote_id = p.id
  where p.clinica_id = _clinica_id
    and p.status <> 'cancelado'
    and (p.status = 'ativo' or p.data_inicio between _de and _ate)

  union all

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
    end::text,
    v.ciclo_dias
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
  where v.ultima is not null

  order by 1, 16 desc nulls last, 3;
end
$fn$;

revoke all on function public.fn_relatorio_sessoes(uuid, date, date, text) from public, anon;
grant execute on function public.fn_relatorio_sessoes(uuid, date, date, text) to authenticated, service_role;
