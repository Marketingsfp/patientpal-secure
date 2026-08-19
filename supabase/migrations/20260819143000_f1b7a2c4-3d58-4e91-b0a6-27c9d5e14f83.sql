-- Fila de cobrança do Caixa: alinha o cálculo com o motor da Agenda.
--
-- Esta função monta a lista "Cobrança de pacientes" da aba Caixa. Ela era uma
-- reimplementação reduzida da regra de preço do Cartão Benefícios e divergia da
-- Agenda em seis pontos, todos corrigidos aqui:
--
-- 1. Serviço com especialidade no nome saía R$ 0,00. A Agenda grava
--    "CONSULTA (CARDIOLOGIA)" e o cadastro tem só "CONSULTA"; o casamento era
--    por nome exato, não achava o serviço e o preço base ficava zerado. Agora
--    tenta o nome exato e, se não achar, o nome sem o sufixo entre parênteses.
-- 2. Dependente do contrato pagava particular. O contrato era procurado apenas
--    em nome do próprio paciente; agora também via `contrato_dependentes`.
-- 3. Benefício com cota era descartado (`limite_qtd is null`), então quem tem
--    "consulta a R$ 9,99" ou gratuidade pagava o valor cheio. Agora a regra
--    entra e o item é marcado como `convenio_regra_cota` — o consumo da cota é
--    conferido pelo motor da Agenda ao abrir a cobrança, que é onde o valor
--    definitivo é calculado.
-- 4. A coluna de cartão repetia o preço de dinheiro. Agora usa `valor_cartao` /
--    `percentual_cartao` da regra e `valor_outros` da tabela de preços por
--    convênio.
-- 5. O tipo da regra era comparado com uma lista fixa de tipos, de modo que uma
--    regra de "exame" podia ser aplicada a uma consulta. Agora compara com o
--    tipo do serviço do agendamento.
-- 6. Contrato com mensalidade vencida continuava ganhando desconto. Agora vale
--    a mesma tolerância da Agenda: parcela vencida há mais de 5 dias cobra
--    particular.
--
-- A especialidade também deixou de ser uma escolha arbitrária por serviço:
-- considera o sufixo do nome do agendamento, as especialidades do médico
-- (coluna e tabela N:N) e as do procedimento, como a Agenda faz.
--
-- Continua STABLE e sem SECURITY DEFINER: roda com as permissões de quem
-- chama, respeitando o RLS por clínica.
CREATE OR REPLACE FUNCTION public.fila_caixa_hoje(_clinica_id uuid, _data date DEFAULT CURRENT_DATE)
 RETURNS TABLE(id uuid, paciente_id uuid, paciente_nome text, procedimento text, inicio timestamp with time zone, medico_nome text, valor numeric, valor_cartao numeric, ja_pago boolean, desconto_origem text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
declare
  -- Mesma tolerância da Agenda: só a partir do 6º dia a parcela bloqueia o convênio.
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
  -- Serviço do cadastro: nome exato primeiro, senão sem o sufixo
  -- "(ESPECIALIDADE)". O sufixo também é guardado porque desambigua a
  -- especialidade quando o serviço genérico ("CONSULTA") atende a várias.
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
           -- Primeiro valor MAIOR QUE ZERO, como `primeiroValorValido` no app:
           -- um preço cadastrado como 0 não deve mascarar o próximo da lista.
           coalesce((select x from unnest(array[p.valor_dinheiro, p.valor_dinheiro_pix, p.valor_padrao])
                       with ordinality t(x, i) where x > 0 order by i limit 1), 0)::numeric as base_dinheiro,
           coalesce((select x from unnest(array[p.valor_cartao_credito, p.valor_cartao_debito, p.valor_cartao, p.valor_padrao])
                       with ordinality t(x, i) where x > 0 order by i limit 1), 0)::numeric as base_cartao,
           lower(p.tipo) as proc_tipo
    from fila f
    left join proc_match pmt on pmt.ag_id = f.ag_id
    left join public.procedimentos p on p.id = pmt.procedimento_id
  ),
  -- Contrato ativo do paciente: como titular ou como dependente. O titular
  -- ganha preferência; entre iguais, o contrato mais antigo.
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
      on m.contrato_id = cv.contrato_id and m.status = 'pago'
    group by cv.ag_id
  ),
  -- Especialidades candidatas do atendimento, nas mesmas fontes da Agenda.
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
  -- Regra vencedora: especificidade manda (serviço > especialidade > tipo) e,
  -- no mesmo nível, gratuidade vence desconto — igual a `findRegra` no app.
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
  -- Reserva: preço por serviço digitado à mão na aba "Convênios" do cadastro
  -- do serviço. Só entra quando nenhuma regra cobre o atendimento, só linhas
  -- 'manual' (as de origem 'regra' são cache e podem estar velhas) e nunca
  -- pode encarecer — se o valor da tabela está acima do particular, vale o
  -- particular.
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
