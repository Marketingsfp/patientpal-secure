
create or replace function public.fila_caixa_hoje(
  _clinica_id uuid,
  _data date default current_date
) returns table (
  id uuid,
  paciente_id uuid,
  paciente_nome text,
  procedimento text,
  inicio timestamptz,
  medico_nome text,
  valor numeric,
  valor_cartao numeric,
  ja_pago boolean,
  desconto_origem text
)
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  _tipos text[] := array['consulta','exame','procedimento'];
begin
  return query
  with fila as (
    select a.id as ag_id,
           a.paciente_id,
           a.paciente_nome,
           a.procedimento as proc_nome,
           a.inicio,
           m.nome as medico_nome
    from public.agendamentos a
    left join public.medicos m on m.id = a.medico_id
    where a.clinica_id = _clinica_id
      and a.fluxo_etapa in ('aguardando_recepcao','recepcao','caixa')
      and a.inicio >= _data::timestamptz
      and a.inicio <  (_data + 1)::timestamptz
  ),
  base as (
    select f.ag_id,
           f.paciente_id,
           f.paciente_nome,
           f.proc_nome,
           f.inicio,
           f.medico_nome,
           proc.procedimento_id,
           proc.base_dinheiro,
           proc.base_cartao
    from fila f
    left join lateral (
      select pp.id as procedimento_id,
             coalesce(pp.valor_dinheiro, pp.valor_padrao, 0)::numeric as base_dinheiro,
             coalesce(pp.valor_cartao_credito, pp.valor_padrao, pp.valor_dinheiro, 0)::numeric as base_cartao
      from public.procedimentos pp
      where pp.clinica_id = _clinica_id
        and upper(pp.nome) = upper(f.proc_nome)
      limit 1
    ) proc on true
  ),
  conv as (
    select b.ag_id, ct.convenio_id
    from base b
    cross join lateral (
      select cc.convenio_id
      from public.contratos_assinatura cc
      where cc.clinica_id  = _clinica_id
        and cc.status      = 'ativo'
        and cc.paciente_id = b.paciente_id
        and cc.convenio_id is not null
      order by cc.created_at asc nulls last
      limit 1
    ) ct
    where b.paciente_id is not null
  ),
  fixo as (
    select b.ag_id, v.valor_dinheiro::numeric as v
    from base b
    join conv cv on cv.ag_id = b.ag_id
    join public.procedimento_cb_convenio_valores v
      on v.procedimento_id = b.procedimento_id
     and v.convenio_id     = cv.convenio_id
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
    left join espec e on e.procedimento_id = b.procedimento_id
    cross join lateral (
      select rr.modo, rr.valor, rr.percentual
      from public.cb_convenio_regras rr
      where rr.convenio_id = cv.convenio_id
        and coalesce(rr.ativo, true) = true
        and (
          (rr.procedimento_id is not null and rr.procedimento_id = b.procedimento_id)
          or
          (rr.procedimento_id is null
           and (rr.especialidade_id is null or rr.especialidade_id = e.especialidade_id)
           and (rr.tipo is null or lower(rr.tipo) = any(_tipos)))
        )
      order by
        (case when rr.procedimento_id is not null then 0 else 1 end),
        (case
           when rr.procedimento_id is not null then 0
           when rr.tipo is null then 1
           else coalesce(array_position(_tipos, lower(rr.tipo)), 999)
         end),
        ((case when rr.especialidade_id is not null then 10 else 0 end)
          + (case when rr.tipo is not null then 5 else 0 end)
          + coalesce(rr.prioridade, 0) * 0.01) desc
      limit 1
    ) picked
    where not exists (select 1 from fixo fx where fx.ag_id = b.ag_id)
  ),
  calc as (
    select b.ag_id,
           b.paciente_id,
           b.paciente_nome,
           b.proc_nome,
           b.inicio,
           b.medico_nome,
           coalesce(fx.v, rpv.dinheiro, b.base_dinheiro) as v_dinheiro,
           coalesce(fx.v, rpv.cartao,   b.base_cartao)   as v_cartao,
           case when fx.v is not null then 'valor convênio'
                when rpv.sufixo is not null then rpv.sufixo end as sufixo,
           case when fx.v is not null then 'convenio_valor_fixo'
                when rpv.dinheiro is not null then 'convenio_regra'
                else 'particular' end as origem
    from base b
    left join fixo fx on fx.ag_id = b.ag_id
    left join lateral (
      select
        case
          when rp.modo = 'valor_fixo' then round(coalesce(rp.valor, 0)::numeric, 2)
          when rp.modo = 'percentual_desconto' then round((b.base_dinheiro * (1 - coalesce(rp.percentual, 0) / 100.0))::numeric, 2)
        end as dinheiro,
        case
          when rp.modo = 'valor_fixo' then round(coalesce(rp.valor, 0)::numeric, 2)
          when rp.modo = 'percentual_desconto' then round((b.base_cartao * (1 - coalesce(rp.percentual, 0) / 100.0))::numeric, 2)
        end as cartao,
        case
          when rp.modo = 'valor_fixo' then 'R$ ' || to_char(coalesce(rp.valor, 0), 'FM999999990.00')
          when rp.modo = 'percentual_desconto' then '-' || to_char(coalesce(rp.percentual, 0), 'FM990') || '%'
        end as sufixo
      from regra_pick rp
      where rp.ag_id = b.ag_id
      limit 1
    ) rpv on true
  )
  select c.ag_id,
         c.paciente_id,
         c.paciente_nome,
         case when c.sufixo is not null
              then c.proc_nome || ' (' || c.sufixo || ')'
              else c.proc_nome end,
         c.inicio,
         c.medico_nome,
         c.v_dinheiro,
         c.v_cartao,
         exists (
           select 1
           from public.fin_lancamentos l
           where l.agendamento_id = c.ag_id
             and l.clinica_id     = _clinica_id
             and l.tipo           = 'receita'
         ),
         c.origem
  from calc c
  order by c.inicio;
end
$$;

grant execute on function public.fila_caixa_hoje(uuid, date) to authenticated;

comment on function public.fila_caixa_hoje(uuid, date) is
'P1-CAIXA-001: fila do caixa do dia com valores e ja_pago calculados em uma unica chamada. SECURITY INVOKER — respeita RLS.';
