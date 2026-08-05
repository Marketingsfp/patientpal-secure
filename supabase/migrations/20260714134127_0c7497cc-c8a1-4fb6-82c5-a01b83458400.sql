-- ALTA-11: o valor sugerido pela fila do Caixa (fila_caixa_hoje) escolhia
-- uma regra de cb_convenio_regras e aplicava o desconto direto, sem checar
-- carencia_mensalidades nem limite_qtd — diferente do resto do sistema
-- (obterInfoConvenioPaciente / carenciaCumprida em app.agenda.tsx), que já
-- fazia essas duas checagens antes de aplicar um desconto de convênio.
-- Resultado: a fila podia sugerir cobrar menos (ou de graça) de um
-- paciente que ainda não cumpriu a carência, e o operador do caixa podia
-- só confirmar o valor pré-preenchido sem perceber.
--
-- Corrige o caminho de regra (cb_convenio_regras / "regra_pick"):
--   1) só considera regras cuja carencia_mensalidades já foi cumprida
--      (comparando com mensalidades pagas do contrato específico).
--   2) regras com limite_qtd (limite de uso) são ignoradas aqui — verificar
--      corretamente a cota (período/escopo/grupo_gratuidade) exige a mesma
--      lógica complexa de obterInfoConvenioPaciente, cara demais para essa
--      consulta de fila. Nesses casos cai no preço particular (mais seguro
--      que arriscar sugerir desconto indevido) — o valor final com desconto
--      continua sendo calculado corretamente no momento da cobrança em
--      app.agenda.tsx.
-- O caminho de valor fixo por convênio (procedimento_cb_convenio_valores,
-- CTE "fixo") não carrega carencia_mensalidades/limite_qtd — está fora do
-- escopo desta correção.
create or replace function public.fila_caixa_hoje(_clinica_id uuid, _data date default current_date)
returns table(id uuid, paciente_id uuid, paciente_nome text, procedimento text, inicio timestamp with time zone, medico_nome text, valor numeric, valor_cartao numeric, ja_pago boolean, desconto_origem text)
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  _tipos text[] := array['consulta','exame','procedimento'];
begin
  return query
  with fila as (
    select a.id as ag_id, a.paciente_id, a.paciente_nome,
           a.procedimento as proc_nome, a.inicio, m.nome as medico_nome
    from public.agendamentos a
    left join public.medicos m on m.id = a.medico_id
    where a.clinica_id = _clinica_id
      and a.fluxo_etapa in ('aguardando_recepcao','recepcao','caixa')
      and a.inicio >= _data::timestamptz
      and a.inicio <  (_data + 1)::timestamptz
  ),
  procs_norm as (
    select distinct on (upper(pp.nome))
           upper(pp.nome) as up_nome,
           pp.id as procedimento_id,
           coalesce(pp.valor_dinheiro, pp.valor_padrao, 0)::numeric as base_dinheiro,
           coalesce(pp.valor_cartao_credito, pp.valor_padrao, pp.valor_dinheiro, 0)::numeric as base_cartao
    from public.procedimentos pp
    where pp.clinica_id = _clinica_id
    order by upper(pp.nome), pp.id
  ),
  base as (
    select f.ag_id, f.paciente_id, f.paciente_nome, f.proc_nome, f.inicio, f.medico_nome,
           pn.procedimento_id, pn.base_dinheiro, pn.base_cartao
    from fila f
    left join procs_norm pn on pn.up_nome = upper(f.proc_nome)
  ),
  conv as (
    select distinct on (b.ag_id) b.ag_id, cc.id as contrato_id, cc.convenio_id
    from base b
    join public.contratos_assinatura cc
      on cc.clinica_id = _clinica_id
     and cc.status = 'ativo'
     and cc.paciente_id = b.paciente_id
     and cc.convenio_id is not null
    where b.paciente_id is not null
    order by b.ag_id, cc.created_at asc nulls last
  ),
  -- Mensalidades pagas do contrato específico do paciente — usado para
  -- checar carência (mesmo critério de carenciaCumprida em cb-regras.ts).
  mens_pagas as (
    select cv.ag_id, count(m.id) as pagas
    from conv cv
    left join public.contrato_mensalidades m
      on m.contrato_id = cv.contrato_id and m.status = 'pago'
    group by cv.ag_id
  ),
  fixo as (
    select b.ag_id, v.valor_dinheiro::numeric as v
    from base b
    join conv cv on cv.ag_id = b.ag_id
    join public.procedimento_cb_convenio_valores v
      on v.procedimento_id = b.procedimento_id and v.convenio_id = cv.convenio_id
    where coalesce(v.valor_dinheiro, 0) > 0
  ),
  espec as (
    select distinct on (pe.procedimento_id) pe.procedimento_id, pe.especialidade_id
    from public.procedimento_especialidades pe
  ),
  regra_pick as (
    select b.ag_id, picked.modo, picked.valor, picked.percentual
    from base b
    join conv cv on cv.ag_id = b.ag_id
    left join mens_pagas mp on mp.ag_id = b.ag_id
    left join espec e on e.procedimento_id = b.procedimento_id
    cross join lateral (
      select rr.modo, rr.valor, rr.percentual
      from public.cb_convenio_regras rr
      where rr.convenio_id = cv.convenio_id and coalesce(rr.ativo, true) = true
        -- Carência: só considera a regra se o contrato já tem mensalidades
        -- pagas suficientes.
        and coalesce(rr.carencia_mensalidades, 0) <= coalesce(mp.pagas, 0)
        -- Limite de uso: fora do escopo desta consulta (ver comentário no
        -- topo do arquivo) — cai no preço particular em vez de arriscar.
        and rr.limite_qtd is null
        and (
          (rr.procedimento_id is not null and rr.procedimento_id = b.procedimento_id)
          or (rr.procedimento_id is null
              and (rr.especialidade_id is null or rr.especialidade_id = e.especialidade_id)
              and (rr.tipo is null or lower(rr.tipo) = any(_tipos)))
        )
      order by
        (case when rr.procedimento_id is not null then 0 else 1 end),
        (case when rr.procedimento_id is not null then 0
              when rr.tipo is null then 1
              else coalesce(array_position(_tipos, lower(rr.tipo)), 999) end),
        ((case when rr.especialidade_id is not null then 10 else 0 end)
          + (case when rr.tipo is not null then 5 else 0 end)
          + coalesce(rr.prioridade, 0) * 0.01) desc
      limit 1
    ) picked
    where not exists (select 1 from fixo fx where fx.ag_id = b.ag_id)
  ),
  calc as (
    select b.ag_id, b.paciente_id, b.paciente_nome, b.proc_nome, b.inicio, b.medico_nome,
           coalesce(fx.v, rpv.dinheiro, b.base_dinheiro, 0) as v_dinheiro,
           coalesce(fx.v, rpv.cartao,   b.base_cartao,   b.base_dinheiro, 0) as v_cartao,
           case when fx.v is not null then 'valor convênio'
                when rpv.sufixo is not null then rpv.sufixo end as sufixo,
           case when fx.v is not null then 'convenio_valor_fixo'
                when rpv.dinheiro is not null then 'convenio_regra'
                else 'particular' end as origem
    from base b
    left join fixo fx on fx.ag_id = b.ag_id
    left join lateral (
      select
        case when rp.modo='valor_fixo' then round(coalesce(rp.valor,0)::numeric,2)
             when rp.modo='percentual_desconto' then round((b.base_dinheiro * (1 - coalesce(rp.percentual,0)/100.0))::numeric,2) end as dinheiro,
        case when rp.modo='valor_fixo' then round(coalesce(rp.valor,0)::numeric,2)
             when rp.modo='percentual_desconto' then round((b.base_cartao * (1 - coalesce(rp.percentual,0)/100.0))::numeric,2) end as cartao,
        case when rp.modo='valor_fixo' then 'R$ ' || to_char(coalesce(rp.valor,0),'FM999999990.00')
             when rp.modo='percentual_desconto' then '-' || to_char(coalesce(rp.percentual,0),'FM990') || '%' end as sufixo
      from regra_pick rp where rp.ag_id = b.ag_id limit 1
    ) rpv on true
  )
  select c.ag_id, c.paciente_id, c.paciente_nome,
         case when c.sufixo is not null then c.proc_nome || ' (' || c.sufixo || ')' else c.proc_nome end,
         c.inicio, c.medico_nome, c.v_dinheiro, c.v_cartao,
         exists (select 1 from public.fin_lancamentos l
                 where l.agendamento_id = c.ag_id and l.clinica_id = _clinica_id and l.tipo = 'receita'
                   and l.status = 'confirmado'),
         c.origem
  from calc c
  order by c.inicio;
end $function$;
