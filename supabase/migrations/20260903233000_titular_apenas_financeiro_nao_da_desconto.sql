-- =====================================================================
-- Titular apenas financeiro não recebe desconto de convênio
-- =====================================================================
-- O contrato do Cartão Benefícios tem a marcação `titular_apenas_financeiro`
-- para quem assina e paga a mensalidade SEM ser beneficiário — tipicamente o
-- filho que compra o cartão para o pai e a mãe. Nesse caso os beneficiários
-- são apenas os dependentes ativos do contrato.
--
-- A marcação já era respeitada na contagem de vidas e na impressão do cartão,
-- mas NÃO nos pontos que decidem preço. Caso real: paciente titular apenas
-- financeiro de um cartão comprado para os pais teve a consulta de
-- endocrinologia cobrada por R$ 10,00 (tabela do convênio) em vez dos
-- R$ 120,00 particulares.
--
-- Esta migration corrige as duas funções do banco que escolhiam o contrato do
-- paciente sem olhar a marcação. Em ambas o filtro entra SÓ no ramo do
-- titular: o ramo do dependente continua igual, porque o contrato segue
-- valendo normalmente para os dependentes ativos.
--
-- Equivalente em TypeScript: `titularUsaBeneficio`
-- (src/lib/convenio/escolher-contrato-ativo.ts).
-- =====================================================================

-- 1) Tipo padrão do atendimento (convênio × particular) -----------------
CREATE OR REPLACE FUNCTION public.tipo_atendimento_padrao(p_clinica_id uuid, p_paciente_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contrato_id uuid;
  v_atrasadas   int;
  c_tolerancia  constant int := 5;
BEGIN
  IF p_clinica_id IS NULL OR p_paciente_id IS NULL THEN
    RETURN 'particular';
  END IF;

  SELECT c.id INTO v_contrato_id
  FROM public.contratos_assinatura c
  WHERE c.clinica_id = p_clinica_id
    AND c.status = 'ativo'
    AND c.paciente_id = p_paciente_id
    -- Titular que só paga não é beneficiário: o atendimento DELE nasce
    -- particular.
    AND coalesce(c.titular_apenas_financeiro, false) = false
  ORDER BY (c.convenio_id IS NULL), c.created_at
  LIMIT 1;

  IF v_contrato_id IS NULL THEN
    SELECT c.id INTO v_contrato_id
    FROM public.contrato_dependentes d
    JOIN public.contratos_assinatura c ON c.id = d.contrato_id
    WHERE d.paciente_id = p_paciente_id
      AND d.ativo
      AND c.clinica_id = p_clinica_id
      AND c.status = 'ativo'
    ORDER BY (c.convenio_id IS NULL), c.created_at
    LIMIT 1;
  END IF;

  IF v_contrato_id IS NULL THEN
    RETURN 'particular';
  END IF;

  SELECT count(*) INTO v_atrasadas
  FROM public.contrato_mensalidades m
  WHERE m.contrato_id = v_contrato_id
    AND m.status IN ('pendente', 'aberto', 'atrasado')
    AND m.vencimento < (CURRENT_DATE - c_tolerancia);

  RETURN CASE WHEN v_atrasadas = 0 THEN 'convenio' ELSE 'particular' END;
END;
$function$;

-- 2) Fila do caixa (valor a receber de cada atendimento do dia) ---------
CREATE OR REPLACE FUNCTION public.fila_caixa_hoje(_clinica_id uuid, _data date DEFAULT CURRENT_DATE)
 RETURNS TABLE(id uuid, paciente_id uuid, paciente_nome text, procedimento text, inicio timestamp with time zone, medico_nome text, valor numeric, valor_cartao numeric, ja_pago boolean, desconto_origem text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  _tolerancia_dias int := 5;
  _acentos_de text := 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
  _acentos_para text := 'AAAAAEEEEIIIIOOOOOUUUUC';
begin
  return query
  with fila as (
    select a.id as ag_id, a.paciente_id, a.paciente_nome,
           a.procedimento as proc_nome, a.inicio, a.medico_id, m.nome as medico_nome
    from public.agendamentos a
    left join public.medicos m on m.id = a.medico_id
    where a.clinica_id = _clinica_id
      and a.fluxo_etapa in ('aguardando_recepcao','recepcao','caixa')
      and a.inicio >= _data::timestamptz
      and a.inicio <  (_data + 1)::timestamptz
      and a.paciente_id is not null
      and a.status <> 'cancelado'::agendamento_status
  ),
  proc_match as (
    select f.ag_id,
           (select p.id
              from public.procedimentos p
             where p.clinica_id = _clinica_id
               and coalesce(p.ativo, true)
               and upper(p.nome) in (
                     upper(f.proc_nome),
                     upper(btrim(regexp_replace(f.proc_nome, '\s*\([^()]*\)\s*$', '')))
                   )
             order by (upper(p.nome) = upper(f.proc_nome)) desc, p.id
             limit 1) as procedimento_id,
           nullif(btrim((regexp_match(f.proc_nome, '\(([^()]+)\)\s*$'))[1]), '') as sufixo_esp
    from fila f
  ),
  base as (
    select f.ag_id, f.paciente_id, f.paciente_nome, f.proc_nome, f.inicio,
           f.medico_id, f.medico_nome, pmt.procedimento_id, pmt.sufixo_esp,
           coalesce((select x from unnest(array[p.valor_dinheiro, p.valor_dinheiro_pix, p.valor_padrao])
                       with ordinality t(x, i) where x > 0 order by i limit 1), 0)::numeric as base_dinheiro,
           coalesce((select x from unnest(array[p.valor_cartao_credito, p.valor_cartao_debito, p.valor_cartao, p.valor_padrao])
                       with ordinality t(x, i) where x > 0 order by i limit 1), 0)::numeric as base_cartao,
           lower(p.tipo) as proc_tipo
    from fila f
    left join proc_match pmt on pmt.ag_id = f.ag_id
    left join public.procedimentos p on p.id = pmt.procedimento_id
  ),
  conv as (
    select distinct on (b.ag_id) b.ag_id, c.contrato_id, c.convenio_id, c.renov
    from base b
    join lateral (
      select ca.id as contrato_id, ca.convenio_id, ca.created_at, 0 as ordem,
             (coalesce(ca.numero_renovacoes, 0) > 0
              or ca.contrato_origem_id is not null
              or coalesce(ca.sem_carencia, false)) as renov
        from public.contratos_assinatura ca
       where ca.clinica_id = _clinica_id and ca.status = 'ativo'
         and ca.convenio_id is not null and ca.paciente_id = b.paciente_id
         -- Titular apenas financeiro paga o cartão e NÃO usa os benefícios:
         -- a cobrança dele sai pela tabela particular. O ramo de dependente
         -- logo abaixo continua inalterado.
         and coalesce(ca.titular_apenas_financeiro, false) = false
      union all
      select ca.id, ca.convenio_id, ca.created_at, 1,
             (coalesce(ca.numero_renovacoes, 0) > 0
              or ca.contrato_origem_id is not null
              or coalesce(ca.sem_carencia, false))
        from public.contratos_assinatura ca
        join public.contrato_dependentes cd
          on cd.contrato_id = ca.id and coalesce(cd.ativo, true)
         and cd.paciente_id = b.paciente_id
       where ca.clinica_id = _clinica_id and ca.status = 'ativo'
         and ca.convenio_id is not null
    ) c on true
    order by b.ag_id, c.ordem, c.created_at asc nulls last
  ),
  atraso as (
    select cv.ag_id, count(m.id) as atrasadas
    from conv cv
    left join public.contrato_mensalidades m
      on m.contrato_id = cv.contrato_id
     and m.status in ('pendente','aberto','atrasado')
     and m.vencimento < (_data - _tolerancia_dias)
    group by cv.ag_id
  ),
  pagas as (
    select cv.ag_id, count(m.id) as n
    from conv cv
    left join public.contrato_mensalidades m
      on m.contrato_id = cv.contrato_id and m.status = 'pago' and m.numero_parcela > 0
    group by cv.ag_id
  ),
  esps as (
    select b.ag_id, e.id as especialidade_id
      from base b
      join public.especialidades e
        on translate(upper(e.nome), _acentos_de, _acentos_para)
         = translate(upper(b.sufixo_esp), _acentos_de, _acentos_para)
     where b.sufixo_esp is not null
    union
    select b.ag_id, m.especialidade_id
      from base b join public.medicos m on m.id = b.medico_id
     where m.especialidade_id is not null
    union
    select b.ag_id, me.especialidade_id
      from base b join public.medico_especialidades me on me.medico_id = b.medico_id
    union
    select b.ag_id, pe.especialidade_id
      from base b join public.procedimento_especialidades pe on pe.procedimento_id = b.procedimento_id
  ),
  regra as (
    select distinct on (b.ag_id)
           b.ag_id, r.modo, r.valor, r.valor_cartao, r.percentual, r.percentual_cartao,
           coalesce(r.gratuito, false) as gratuito, r.limite_qtd
    from base b
    join conv cv on cv.ag_id = b.ag_id
    left join pagas pg on pg.ag_id = b.ag_id
    join public.cb_convenio_regras r
      on r.convenio_id = cv.convenio_id and coalesce(r.ativo, true) = true
    where (coalesce(r.carencia_mensalidades, 0) <= coalesce(pg.n, 0) or cv.renov)
      and (
        (r.procedimento_id is not null and r.procedimento_id = b.procedimento_id)
        or (r.procedimento_id is null
            and (r.especialidade_id is null
                 or exists (select 1 from esps e
                             where e.ag_id = b.ag_id and e.especialidade_id = r.especialidade_id))
            and (r.tipo is null or lower(r.tipo) = b.proc_tipo))
      )
    order by b.ag_id,
      ((case when r.procedimento_id is not null then 1000 else 0 end)
       + (case when r.especialidade_id is not null then 100 else 0 end)
       + (case when r.tipo is not null then 50 else 0 end)
       + (case when coalesce(r.gratuito, false) then 10 else 0 end)
       + coalesce(r.prioridade, 0) * 0.001) desc
  ),
  calc_regra as (
    select rg.ag_id, rg.gratuito, (rg.limite_qtd is not null) as tem_cota,
      case when rg.gratuito then 0
           when rg.modo = 'valor_fixo' then round(coalesce(rg.valor, 0)::numeric, 2)
           when rg.modo = 'percentual_desconto'
             then round((b.base_dinheiro * (1 - coalesce(rg.percentual, 0) / 100.0))::numeric, 2) end as v_din,
      case when rg.gratuito then 0
           when rg.modo = 'valor_fixo' then round(coalesce(rg.valor_cartao, rg.valor, 0)::numeric, 2)
           when rg.modo = 'percentual_desconto'
             then round((b.base_cartao * (1 - coalesce(rg.percentual_cartao, rg.percentual, 0) / 100.0))::numeric, 2) end as v_cart,
      case when rg.gratuito then 'gratuito'
           when rg.modo = 'valor_fixo' then 'R$ ' || to_char(coalesce(rg.valor, 0), 'FM999999990.00')
           when rg.modo = 'percentual_desconto' then '-' || to_char(coalesce(rg.percentual, 0), 'FM990') || '%' end as sufixo
    from regra rg join base b on b.ag_id = rg.ag_id
  ),
  manual as (
    select b.ag_id, x.final_din as v_din, x.final_out as v_cart
    from base b
    join conv cv on cv.ag_id = b.ag_id
    join public.procedimento_cb_convenio_valores v
      on v.procedimento_id = b.procedimento_id and v.convenio_id = cv.convenio_id
     and v.origem = 'manual'
    cross join lateral (
      select case when b.base_dinheiro > 0 and c0.cand_din > b.base_dinheiro
                  then b.base_dinheiro else c0.cand_din end as final_din,
             case when b.base_cartao > 0 and c0.cand_out > b.base_cartao
                  then b.base_cartao else c0.cand_out end as final_out
      from (select case when coalesce(v.valor_dinheiro, 0) > 0 then v.valor_dinheiro else v.valor_outros end as cand_din,
                   case when coalesce(v.valor_outros, 0) > 0 then v.valor_outros else v.valor_dinheiro end as cand_out) c0
    ) x
    where not exists (select 1 from regra rg where rg.ag_id = b.ag_id)
      and (coalesce(v.valor_dinheiro, 0) > 0 or coalesce(v.valor_outros, 0) > 0)
      and ((b.base_dinheiro > 0 and x.final_din < b.base_dinheiro)
           or (b.base_cartao > 0 and x.final_out < b.base_cartao))
  ),
  calc as (
    select b.ag_id, b.paciente_id, b.paciente_nome, b.proc_nome, b.inicio, b.medico_nome,
           case when coalesce(at.atrasadas, 0) > 0 then b.base_dinheiro
                else coalesce(cr.v_din, mn.v_din, b.base_dinheiro, 0) end as v_dinheiro,
           case when coalesce(at.atrasadas, 0) > 0 then b.base_cartao
                else coalesce(cr.v_cart, mn.v_cart, b.base_cartao, b.base_dinheiro, 0) end as v_cartao,
           case when coalesce(at.atrasadas, 0) > 0 then null
                when cr.ag_id is not null then cr.sufixo
                when mn.ag_id is not null then 'valor convênio' end as sufixo,
           case when cv.ag_id is null then 'particular'
                when coalesce(at.atrasadas, 0) > 0 then 'convenio_em_atraso'
                when cr.ag_id is not null and cr.tem_cota then 'convenio_regra_cota'
                when cr.ag_id is not null then 'convenio_regra'
                when mn.ag_id is not null then 'convenio_valor_fixo'
                else 'particular' end as origem
    from base b
    left join conv cv on cv.ag_id = b.ag_id
    left join atraso at on at.ag_id = b.ag_id
    left join calc_regra cr on cr.ag_id = b.ag_id
    left join manual mn on mn.ag_id = b.ag_id
  )
  select c.ag_id, c.paciente_id, c.paciente_nome,
         case when c.sufixo is not null then c.proc_nome || ' (' || c.sufixo || ')' else c.proc_nome end,
         c.inicio, c.medico_nome, c.v_dinheiro, c.v_cartao,
         exists (select 1 from public.fin_lancamentos l
                 where l.agendamento_id = c.ag_id and l.clinica_id = _clinica_id
                   and l.tipo = 'receita' and l.status = 'confirmado'),
         c.origem
  from calc c order by c.inicio;
end $function$;
