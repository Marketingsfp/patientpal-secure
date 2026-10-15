-- Renovação do Cartão Benefícios x carência (pedido da operação, 15/10/2026).
--
-- Até aqui toda renovação (extensão do mesmo contrato ou troca de plano) era
-- tratada como "sem carência", em qualquer prazo. Regra nova, aprovada pelo dono:
--   * renovou até 3 meses depois do fim do contrato anterior → mantém o
--     histórico (continua sem carência), sem taxa de adesão;
--   * renovou com MAIS de 3 meses de atraso → a carência recomeça como num
--     contrato novo, mas a taxa de adesão continua isenta.
--
-- O "fim do contrato anterior" é `contratos_assinatura.data_fim` (na falta dele,
-- o vencimento da última mensalidade). O reinício fica gravado em
-- `carencia_desde`: só contam para a carência as mensalidades pagas com
-- vencimento a partir dessa data, e o contrato deixa de ser tratado como
-- renovação para fins de carência. A isenção manual (`sem_carencia`) continua
-- valendo acima de tudo. Contratos existentes não mudam (coluna nasce nula).
--
-- Funções reescritas a partir da definição em produção, alterando só a regra:
--   renovar_contrato_extensao, renovar_contrato_troca_plano,
--   fila_caixa_hoje (desconto na fila do caixa) e
--   _credito_clinica_situacao (Crédito na clínica libera após 6 pagas).

ALTER TABLE public.contratos_assinatura
  ADD COLUMN IF NOT EXISTS carencia_desde date;

COMMENT ON COLUMN public.contratos_assinatura.carencia_desde IS
  'Renovação feita mais de 3 meses após o fim do contrato anterior: a carência recomeça nesta data (só contam mensalidades pagas com vencimento a partir dela). Nulo = regra normal.';

-- ---------------------------------------------------------------------------
-- Renovação por extensão (mesmo contrato)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.renovar_contrato_extensao(_contrato_id uuid, _observacao text DEFAULT NULL::text, _dependentes jsonb DEFAULT '[]'::jsonb, _valor_mensal numeric DEFAULT NULL::numeric, _data_renovacao date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contrato public.contratos_assinatura%ROWTYPE;
  v_convenio public.cb_convenios%ROWTYPE;
  v_pagas int;
  v_max int;
  v_novo_valor numeric(12,2);
  v_num_parcelas int;
  v_prox int;
  v_dia_venc int;
  v_data_ancora date;
  v_periodo_inicio date;
  v_periodo_fim date;
  i int;
  v_venc date;
  v_ano int;
  v_mes int;
  v_dia int;
  v_dep jsonb;
  v_dep_id uuid;
  v_taxa_inclusao numeric;
  v_menor_neg int;
  v_data_ren date;
  v_fim_anterior date;
  v_carencia_reiniciada boolean := false;
BEGIN
  SELECT * INTO v_contrato FROM public.contratos_assinatura WHERE id = _contrato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato nao encontrado';
  END IF;

  IF NOT is_member(auth.uid(), v_contrato.clinica_id) THEN
    RAISE EXCEPTION 'Voce nao e membro desta clinica';
  END IF;

  IF v_contrato.cancelado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Contrato cancelado nao pode ser renovado';
  END IF;

  IF v_contrato.convenio_id IS NULL THEN
    RAISE EXCEPTION 'Contrato sem convenio vinculado';
  END IF;

  SELECT COUNT(*) FILTER (WHERE status = 'pago'), COUNT(*)
    INTO v_pagas, v_max
    FROM public.contrato_mensalidades
   WHERE contrato_id = _contrato_id
     AND numero_parcela > 0;

  IF v_max = 0 OR v_pagas < v_max THEN
    RAISE EXCEPTION 'So e possivel renovar quando todas as mensalidades estiverem pagas (pagas: % de %)', v_pagas, v_max;
  END IF;

  SELECT * INTO v_convenio FROM public.cb_convenios WHERE id = v_contrato.convenio_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convenio do contrato nao encontrado';
  END IF;

  v_novo_valor := COALESCE(_valor_mensal, v_convenio.valor_mensal);
  v_num_parcelas := COALESCE(NULLIF(v_convenio.num_parcelas, 0), 12);
  v_taxa_inclusao := COALESCE(v_convenio.taxa_inclusao_dependente, 0);
  v_data_ren := COALESCE(_data_renovacao, CURRENT_DATE);

  -- Janela de 3 meses a partir do fim do contrato que está sendo renovado.
  v_fim_anterior := COALESCE(
    v_contrato.data_fim,
    (SELECT MAX(vencimento) FROM public.contrato_mensalidades
      WHERE contrato_id = _contrato_id AND numero_parcela > 0)
  );
  v_carencia_reiniciada := v_fim_anterior IS NOT NULL
    AND v_data_ren > (v_fim_anterior + INTERVAL '3 months')::date;

  SELECT MAX(numero_parcela)
    INTO v_prox
    FROM public.contrato_mensalidades
   WHERE contrato_id = _contrato_id
     AND numero_parcela > 0;

  v_prox := COALESCE(v_prox, 0) + 1;
  v_dia_venc := COALESCE(v_contrato.dia_vencimento, EXTRACT(DAY FROM v_data_ren)::int, 10);
  v_periodo_inicio := v_data_ren;

  IF EXTRACT(DAY FROM v_data_ren)::int <= v_dia_venc THEN
    v_ano := EXTRACT(YEAR FROM v_data_ren)::int;
    v_mes := EXTRACT(MONTH FROM v_data_ren)::int;
  ELSE
    v_ano := EXTRACT(YEAR FROM (v_data_ren + INTERVAL '1 month'))::int;
    v_mes := EXTRACT(MONTH FROM (v_data_ren + INTERVAL '1 month'))::int;
  END IF;
  v_dia := LEAST(v_dia_venc, EXTRACT(DAY FROM (date_trunc('month', make_date(v_ano, v_mes, 1)) + INTERVAL '1 month - 1 day'))::int);
  v_data_ancora := make_date(v_ano, v_mes, v_dia);

  FOR i IN 0 .. v_num_parcelas - 1 LOOP
    v_ano := EXTRACT(YEAR FROM (v_data_ancora + (i || ' month')::interval))::int;
    v_mes := EXTRACT(MONTH FROM (v_data_ancora + (i || ' month')::interval))::int;
    v_dia := LEAST(v_dia_venc, EXTRACT(DAY FROM (date_trunc('month', make_date(v_ano, v_mes, 1)) + INTERVAL '1 month - 1 day'))::int);
    v_venc := make_date(v_ano, v_mes, v_dia);

    INSERT INTO public.contrato_mensalidades (contrato_id, clinica_id, numero_parcela, vencimento, valor, status)
    VALUES (_contrato_id, v_contrato.clinica_id, v_prox + i, v_venc, v_novo_valor, 'pendente');
    v_periodo_fim := v_venc;
  END LOOP;

  IF jsonb_typeof(_dependentes) = 'array' THEN
    SELECT COALESCE(MIN(numero_parcela), 0)
      INTO v_menor_neg
      FROM public.contrato_mensalidades
     WHERE contrato_id = _contrato_id
       AND numero_parcela < 0;

    FOR v_dep IN SELECT * FROM jsonb_array_elements(_dependentes) LOOP
      v_dep_id := NULLIF(v_dep->>'id','')::uuid;

      IF v_dep_id IS NOT NULL THEN
        IF COALESCE((v_dep->>'manter')::boolean, true) THEN
          UPDATE public.contrato_dependentes
             SET paciente_id = COALESCE(NULLIF(v_dep->>'paciente_id','')::uuid, paciente_id),
                 paciente_nome = COALESCE(NULLIF(v_dep->>'paciente_nome',''), paciente_nome),
                 parentesco = NULLIF(v_dep->>'parentesco',''),
                 tipo = COALESCE(NULLIF(v_dep->>'tipo',''), tipo)
           WHERE id = v_dep_id
             AND contrato_id = _contrato_id;
        ELSE
          UPDATE public.contrato_dependentes
             SET ativo = false,
                 excluido_em = v_data_ren
           WHERE id = v_dep_id
             AND contrato_id = _contrato_id;
        END IF;
      ELSE
        INSERT INTO public.contrato_dependentes (
          contrato_id, paciente_id, paciente_nome, parentesco, tipo, incluido_em, ativo
        ) VALUES (
          _contrato_id,
          NULLIF(v_dep->>'paciente_id','')::uuid,
          v_dep->>'paciente_nome',
          NULLIF(v_dep->>'parentesco',''),
          COALESCE(NULLIF(v_dep->>'tipo',''), 'dependente'),
          v_data_ren,
          true
        );

        IF COALESCE((v_dep->>'cobrar_taxa_inclusao')::boolean, false) AND v_taxa_inclusao > 0 THEN
          v_menor_neg := v_menor_neg - 1;
          INSERT INTO public.contrato_mensalidades (
            contrato_id, clinica_id, numero_parcela, vencimento, valor, status, observacoes
          ) VALUES (
            _contrato_id, v_contrato.clinica_id, v_menor_neg, v_data_ren, v_taxa_inclusao, 'pendente',
            'Taxa de inclusao de dependente: ' || COALESCE(v_dep->>'paciente_nome','')
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- Renovação dentro da janela mantém o `carencia_desde` que já existia
  -- (histórico de carência preservado); fora dela, a carência recomeça hoje.
  UPDATE public.contratos_assinatura
     SET data_fim = v_periodo_fim,
         numero_renovacoes = COALESCE(numero_renovacoes, 0) + 1,
         carencia_desde = CASE WHEN v_carencia_reiniciada THEN v_periodo_inicio ELSE carencia_desde END,
         updated_at = now()
   WHERE id = _contrato_id;

  INSERT INTO public.contrato_renovacoes (
    clinica_id, contrato_id, contrato_novo_id, tipo,
    convenio_anterior_id, convenio_novo_id,
    valor_anterior, valor_novo,
    parcelas_geradas, periodo_inicio, periodo_fim,
    usuario_id, observacao, dependentes_incluidos
  ) VALUES (
    v_contrato.clinica_id, _contrato_id, _contrato_id, 'extensao',
    v_contrato.convenio_id, v_contrato.convenio_id,
    v_contrato.valor_mensal, v_novo_valor,
    v_num_parcelas, v_periodo_inicio, v_periodo_fim,
    auth.uid(),
    CASE WHEN v_carencia_reiniciada
         THEN COALESCE(_observacao || E'\n', '') || '[Carência reiniciada: renovação mais de 3 meses após o fim do contrato (' || to_char(v_fim_anterior, 'DD/MM/YYYY') || ')]'
         ELSE _observacao END,
    COALESCE(_dependentes, '[]'::jsonb)
  );

  RETURN jsonb_build_object(
    'contrato_id', _contrato_id,
    'periodo_inicio', v_periodo_inicio,
    'periodo_fim', v_periodo_fim,
    'parcelas_geradas', v_num_parcelas,
    'carencia_reiniciada', v_carencia_reiniciada
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Renovação com troca de plano (contrato novo)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.renovar_contrato_troca_plano(_contrato_id uuid, _convenio_novo_id uuid, _observacao text DEFAULT NULL::text, _cobrar_taxa_adesao boolean DEFAULT false, _dependentes jsonb DEFAULT '[]'::jsonb, _valor_mensal numeric DEFAULT NULL::numeric, _data_renovacao date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contrato public.contratos_assinatura%ROWTYPE;
  v_convenio_novo public.cb_convenios%ROWTYPE;
  v_pagas int;
  v_max int;
  v_novo_id uuid;
  v_num_parcelas int;
  v_dia_venc int;
  v_data_inicio date;
  v_data_ancora date;
  v_periodo_fim date;
  v_ano int;
  v_mes int;
  v_dia int;
  v_venc date;
  v_taxa_inclusao numeric;
  v_menor_neg int;
  v_dep jsonb;
  v_valor numeric(12,2);
  i int;
  v_fim_anterior date;
  v_carencia_reiniciada boolean := false;
  v_obs text;
BEGIN
  SELECT * INTO v_contrato FROM public.contratos_assinatura WHERE id = _contrato_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contrato nao encontrado';
  END IF;

  IF NOT is_member(auth.uid(), v_contrato.clinica_id) THEN
    RAISE EXCEPTION 'Voce nao e membro desta clinica';
  END IF;

  IF v_contrato.cancelado_em IS NOT NULL THEN
    RAISE EXCEPTION 'Contrato cancelado nao pode ser renovado';
  END IF;

  SELECT COUNT(*) FILTER (WHERE status = 'pago'), COUNT(*)
    INTO v_pagas, v_max
    FROM public.contrato_mensalidades
   WHERE contrato_id = _contrato_id
     AND numero_parcela > 0;

  IF v_max = 0 OR v_pagas < v_max THEN
    RAISE EXCEPTION 'So e possivel renovar quando todas as mensalidades estiverem pagas (pagas: % de %)', v_pagas, v_max;
  END IF;

  SELECT * INTO v_convenio_novo
    FROM public.cb_convenios
   WHERE id = _convenio_novo_id
     AND clinica_id = v_contrato.clinica_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Convenio novo invalido';
  END IF;

  v_num_parcelas := COALESCE(NULLIF(v_convenio_novo.num_parcelas, 0), 12);
  v_dia_venc := COALESCE(v_contrato.dia_vencimento, 10);
  v_data_inicio := COALESCE(_data_renovacao, CURRENT_DATE);
  v_taxa_inclusao := COALESCE(v_convenio_novo.taxa_inclusao_dependente, 0);
  v_valor := COALESCE(_valor_mensal, v_convenio_novo.valor_mensal);

  -- Janela de 3 meses a partir do fim do contrato que está sendo renovado.
  v_fim_anterior := COALESCE(
    v_contrato.data_fim,
    (SELECT MAX(vencimento) FROM public.contrato_mensalidades
      WHERE contrato_id = _contrato_id AND numero_parcela > 0)
  );
  v_carencia_reiniciada := v_fim_anterior IS NOT NULL
    AND v_data_inicio > (v_fim_anterior + INTERVAL '3 months')::date;

  INSERT INTO public.contratos_assinatura (
    clinica_id, paciente_id, paciente_nome,
    data_inicio, dia_vencimento, valor_mensal, taxa_adesao,
    num_parcelas, forma_pagamento, status, convenio_id,
    contrato_origem_id, titular_apenas_financeiro,
    numero, criado_por, carencia_desde
  ) VALUES (
    v_contrato.clinica_id,
    v_contrato.paciente_id,
    v_contrato.paciente_nome,
    v_data_inicio,
    v_dia_venc,
    v_valor,
    0,
    v_num_parcelas,
    v_contrato.forma_pagamento,
    'ativo',
    _convenio_novo_id,
    _contrato_id,
    v_contrato.titular_apenas_financeiro,
    COALESCE((SELECT MAX(numero) + 1 FROM public.contratos_assinatura WHERE clinica_id = v_contrato.clinica_id), 1),
    auth.uid(),
    CASE WHEN v_carencia_reiniciada THEN v_data_inicio ELSE NULL END
  ) RETURNING id INTO v_novo_id;

  -- Ancora = 1o vencimento apos v_data_inicio.
  -- Se o dia do venc no mes de v_data_inicio ainda nao passou, ancora fica nesse mes.
  IF EXTRACT(DAY FROM v_data_inicio)::int <= v_dia_venc THEN
    v_ano := EXTRACT(YEAR FROM v_data_inicio)::int;
    v_mes := EXTRACT(MONTH FROM v_data_inicio)::int;
  ELSE
    v_ano := EXTRACT(YEAR FROM (v_data_inicio + INTERVAL '1 month'))::int;
    v_mes := EXTRACT(MONTH FROM (v_data_inicio + INTERVAL '1 month'))::int;
  END IF;
  v_dia := LEAST(v_dia_venc, EXTRACT(DAY FROM (date_trunc('month', make_date(v_ano, v_mes, 1)) + INTERVAL '1 month - 1 day'))::int);
  v_data_ancora := make_date(v_ano, v_mes, v_dia);

  FOR i IN 0 .. v_num_parcelas - 1 LOOP
    v_ano := EXTRACT(YEAR FROM (v_data_ancora + (i || ' month')::interval))::int;
    v_mes := EXTRACT(MONTH FROM (v_data_ancora + (i || ' month')::interval))::int;
    v_dia := LEAST(v_dia_venc, EXTRACT(DAY FROM (date_trunc('month', make_date(v_ano, v_mes, 1)) + INTERVAL '1 month - 1 day'))::int);
    v_venc := make_date(v_ano, v_mes, v_dia);

    INSERT INTO public.contrato_mensalidades (contrato_id, clinica_id, numero_parcela, vencimento, valor, status)
    VALUES (v_novo_id, v_contrato.clinica_id, i + 1, v_venc, v_valor, 'pendente');
    v_periodo_fim := v_venc;
  END LOOP;

  UPDATE public.contratos_assinatura
     SET data_fim = v_periodo_fim,
         updated_at = now()
   WHERE id = v_novo_id;

  IF jsonb_typeof(_dependentes) = 'array' THEN
    v_menor_neg := 0;
    FOR v_dep IN SELECT * FROM jsonb_array_elements(_dependentes) LOOP
      IF NULLIF(v_dep->>'id','') IS NULL OR COALESCE((v_dep->>'manter')::boolean, true) THEN
        INSERT INTO public.contrato_dependentes (
          contrato_id, paciente_id, paciente_nome, parentesco, tipo, incluido_em, ativo
        ) VALUES (
          v_novo_id,
          NULLIF(v_dep->>'paciente_id','')::uuid,
          v_dep->>'paciente_nome',
          NULLIF(v_dep->>'parentesco',''),
          COALESCE(NULLIF(v_dep->>'tipo',''), 'dependente'),
          v_data_inicio,
          true
        );

        IF NULLIF(v_dep->>'id','') IS NULL
           AND COALESCE((v_dep->>'cobrar_taxa_inclusao')::boolean, false)
           AND v_taxa_inclusao > 0 THEN
          v_menor_neg := v_menor_neg - 1;
          INSERT INTO public.contrato_mensalidades (
            contrato_id, clinica_id, numero_parcela, vencimento, valor, status, observacoes
          ) VALUES (
            v_novo_id,
            v_contrato.clinica_id,
            v_menor_neg,
            v_data_inicio,
            v_taxa_inclusao,
            'pendente',
            'Taxa de inclusão de dependente — ' || COALESCE(v_dep->>'paciente_nome','')
          );
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE public.contratos_assinatura
     SET status = 'renovado',
         renovado_em = v_data_inicio::timestamptz,
         numero_renovacoes = COALESCE(numero_renovacoes, 0) + 1,
         updated_at = now()
   WHERE id = _contrato_id;

  v_obs := CASE WHEN _data_renovacao IS NOT NULL AND _data_renovacao <> CURRENT_DATE
                THEN COALESCE(_observacao || E'\n', '') || '[Renovação registrada com data informada: ' || to_char(v_data_inicio, 'DD/MM/YYYY') || ']'
                ELSE _observacao END;
  IF v_carencia_reiniciada THEN
    v_obs := COALESCE(v_obs || E'\n', '') || '[Carência reiniciada: renovação mais de 3 meses após o fim do contrato (' || to_char(v_fim_anterior, 'DD/MM/YYYY') || ')]';
  END IF;

  INSERT INTO public.contrato_renovacoes (
    clinica_id, contrato_id, contrato_novo_id, tipo,
    convenio_anterior_id, convenio_novo_id, valor_anterior, valor_novo,
    parcelas_geradas, periodo_inicio, periodo_fim, usuario_id, observacao,
    dependentes_incluidos
  ) VALUES (
    v_contrato.clinica_id,
    _contrato_id,
    v_novo_id,
    'troca_plano',
    v_contrato.convenio_id,
    _convenio_novo_id,
    v_contrato.valor_mensal,
    v_valor,
    v_num_parcelas,
    v_data_inicio,
    v_periodo_fim,
    auth.uid(),
    v_obs,
    _dependentes
  );

  RETURN jsonb_build_object(
    'contrato_novo_id', v_novo_id,
    'parcelas_geradas', v_num_parcelas,
    'taxa_adesao', 0,
    'data_renovacao', v_data_inicio,
    'carencia_reiniciada', v_carencia_reiniciada
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- Fila do caixa: renovação atrasada volta a respeitar a carência
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fila_caixa_hoje(_clinica_id uuid, _data date DEFAULT CURRENT_DATE)
 RETURNS TABLE(id uuid, paciente_id uuid, paciente_nome text, procedimento text, inicio timestamp with time zone, medico_nome text, valor numeric, valor_cartao numeric, ja_pago boolean, desconto_origem text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  _tolerancia_dias int := 5;
  _acentos_de text := 'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ';
  _acentos_para text := 'AAAAAEEEEIIIIOOOOOUUUUC';
  _meds uuid[];
begin
  -- Conferência de acesso feita UMA vez (antes era por linha, via RLS):
  -- mesma regra da política agend_select de agendamentos.
  if auth.uid() is null or _clinica_id is null
     or not (_clinica_id = any(public.clinicas_do_usuario())) then
    return;
  end if;
  _meds := public.medicos_do_usuario();

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
      and (_meds is null or a.medico_id = any(_meds))
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
           lower(p.tipo) as proc_tipo,
           (translate(upper(coalesce(p.nome, '')), _acentos_de, _acentos_para) in ('REVISAO','RETORNO')
            and coalesce((select x from unnest(array[p.valor_dinheiro, p.valor_dinheiro_pix, p.valor_padrao])
                            with ordinality t(x, i) where x > 0 order by i limit 1), 0)::numeric = 0
            and coalesce((select x from unnest(array[p.valor_cartao_credito, p.valor_cartao_debito, p.valor_cartao, p.valor_padrao])
                            with ordinality t(x, i) where x > 0 order by i limit 1), 0)::numeric = 0) as revisao_gratuita
    from fila f
    left join proc_match pmt on pmt.ag_id = f.ag_id
    left join public.procedimentos p on p.id = pmt.procedimento_id
  ),
  conv as (
    -- `renov` = contrato dispensado da carência: renovação dentro da janela de
    -- 3 meses (carencia_desde nulo) ou isenção manual.
    select distinct on (b.ag_id) b.ag_id, c.contrato_id, c.convenio_id, c.renov, c.carencia_desde
    from base b
    join lateral (
      select ca.id as contrato_id, ca.convenio_id, ca.created_at, 0 as ordem,
             (((coalesce(ca.numero_renovacoes, 0) > 0
                or ca.contrato_origem_id is not null)
               and ca.carencia_desde is null)
              or coalesce(ca.sem_carencia, false)) as renov,
             ca.carencia_desde
        from public.contratos_assinatura ca
       where ca.clinica_id = _clinica_id and ca.status = 'ativo'
         and ca.convenio_id is not null and ca.paciente_id = b.paciente_id
      union all
      select ca.id, ca.convenio_id, ca.created_at, 1,
             (((coalesce(ca.numero_renovacoes, 0) > 0
                or ca.contrato_origem_id is not null)
               and ca.carencia_desde is null)
              or coalesce(ca.sem_carencia, false)),
             ca.carencia_desde
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
    -- Carência reiniciada: só contam as mensalidades do novo período.
    select cv.ag_id, count(m.id) as n
    from conv cv
    left join public.contrato_mensalidades m
      on m.contrato_id = cv.contrato_id and m.status = 'pago' and m.numero_parcela > 0
     and (cv.carencia_desde is null or m.vencimento >= cv.carencia_desde)
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
      and not b.revisao_gratuita
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
      and not b.revisao_gratuita
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

-- ---------------------------------------------------------------------------
-- Crédito na clínica: a carência de 6 mensalidades também recomeça
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._credito_clinica_situacao(_paciente_id uuid, _clinica_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
         c.contrato_origem_id, c.numero_renovacoes, c.carencia_desde,
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

  -- Carência reiniciada (renovação atrasada): só contam as do novo período.
  select count(*) into v_pagas
  from public.contrato_mensalidades
  where contrato_id = v_c.id and numero_parcela > 0 and status = 'pago'
    and (v_c.carencia_desde is null or vencimento >= v_c.carencia_desde);

  v_renov := (v_c.contrato_origem_id is not null or coalesce(v_c.numero_renovacoes, 0) > 0)
             and v_c.carencia_desde is null;

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
    and (v_c.carencia_desde is null or vencimento >= v_c.carencia_desde)
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
$function$;
