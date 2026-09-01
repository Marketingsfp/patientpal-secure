-- ===========================================================================
-- Painel Executivo — correcoes de 01/09/2026
--
-- Rodar INTEIRO no SQL editor do Lovable Cloud. Sao duas funcoes trocadas por
-- CREATE OR REPLACE; nao apaga nem altera nenhum dado.
--
-- O QUE ESTAVA ERRADO
-- -------------------
-- 1) ATENDIMENTOS REALIZADOS contava so quem estava com o agendamento marcado
--    como "realizado". Em setembro/2026 a Menino Jesus tinha 278 marcacoes no
--    mes, 244 delas ja com recebimento confirmado no caixa — e apenas 23 com o
--    status "realizado". A recepcao recebe o pagamento e segue para o proximo
--    paciente; quem volta na agenda para mudar o status e a excecao. O campo
--    `executado_em` esta vazio em 100% das marcacoes de setembro, entao ele
--    tambem nao salvava a conta.
--
--    Passa a valer: atendido = status "realizado", OU horario de execucao
--    registrado, OU recebimento de receita confirmado ligado aquele
--    agendamento. O pagamento e a prova mais forte de que o paciente passou.
--
-- 2) SEM TIPO CADASTRADO juntava duas coisas diferentes. Alem dos 2.514
--    servicos ativos com o campo "tipo de procedimento" em branco, caiam ali
--    tambem os 106 servicos cadastrados com o tipo "equipamento"
--    (ELETROCARDIOGRAMA, HOLTER 24 HORAS, MAPA 24 HORAS, TESTE ERGOMETRICO),
--    que a funcao simplesmente nao conhecia. Esses tem tipo cadastrado, sao
--    exames feitos com aparelho, e passam a contar como exame.
--
-- 3) INADIMPLENCIA REAL DO CARTAO olhava so as parcelas com vencimento no mes
--    corrente. No dia 1 do mes nenhuma parcela do mes ainda passou dos 5 dias
--    de tolerancia, entao o card mostrava 0,0% com 1.881 contratos ativos e
--    2.179 parcelas realmente vencidas. Passa a olhar TODA parcela vencida ate
--    hoje, que e a mesma regua que faz o paciente ser atendido como Particular
--    no balcao.
--
-- 4) Os dois paineis liam o nome do servico de formas diferentes:
--    `dashboard_blocos_periodo` tentava o nome inteiro e, se nao achasse, o
--    nome sem o ultimo parenteses (a especialidade que a agenda anexa);
--    `painel_executivo_periodo` so tentava o nome inteiro. O mesmo agendamento
--    era classificado de um jeito num painel e de outro no outro. Agora as
--    duas usam as duas tentativas.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1/2 — dashboard_blocos_periodo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.dashboard_blocos_periodo(
  p_clinica uuid,
  p_ini timestamp with time zone,
  p_fim timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '60s'
AS $fn$
DECLARE
  v_resultado jsonb;
  -- Dias de tolerancia depois do vencimento antes de a parcela virar
  -- inadimplencia. Mesmo numero de DIAS_TOLERANCIA_MENSALIDADE no codigo
  -- (src/lib/cb-regras.ts) e do bloqueio no balcao.
  v_tolerancia int := 5;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  IF NOT public.is_member(auth.uid(), p_clinica) THEN
    RETURN NULL;
  END IF;

  WITH
  proc AS (
    SELECT DISTINCT ON (chave) chave, cat
    FROM (
      SELECT lower(btrim(unaccent(pr.nome))) AS chave,
             CASE lower(btrim(coalesce(pr.tipo_procedimento, '')))
               WHEN 'laboratorio'  THEN 'laboratorio'
               WHEN 'imagem'       THEN 'imagem'
               WHEN 'exame'        THEN 'imagem'   -- legado: mesma regra de imagem
               WHEN 'equipamento'  THEN 'imagem'   -- ECG, Holter, MAPA, ergometrico
               WHEN 'consulta'     THEN 'consulta'
               WHEN 'procedimento' THEN 'procedimento'
               WHEN 'cirurgia'     THEN 'cirurgia'
               ELSE 'outro'
             END AS cat
      FROM public.procedimentos pr
      WHERE pr.clinica_id = p_clinica
        AND pr.ativo
        AND coalesce(btrim(pr.nome), '') <> ''
    ) t
    -- O mesmo nome existe cadastrado varias vezes, umas com tipo e outras sem.
    -- Vence a linha que TEM tipo.
    ORDER BY chave, (cat = 'outro'), cat
  ),
  lab_med AS (
    SELECT DISTINCT me.medico_id
    FROM public.medico_especialidades me
    JOIN public.especialidades e ON e.id = me.especialidade_id
    WHERE lower(coalesce(e.nome, '')) LIKE '%laborat%'
  ),
  ags AS (
    SELECT a.id, a.status::text AS status, a.medico_id, a.paciente_id,
           a.inicio, a.executado_em, a.procedimento,
           -- Recebimento confirmado ligado a este agendamento. E a prova de
           -- que o paciente foi atendido, mesmo com o status parado em
           -- "agendado" — ver o item 1 do cabecalho.
           EXISTS (
             SELECT 1 FROM public.fin_lancamentos l
             WHERE l.agendamento_id = a.id
               AND l.tipo = 'receita'
               AND l.status = 'confirmado'
           ) AS pago
    FROM public.agendamentos a
    WHERE a.clinica_id = p_clinica
      AND a.inicio >= p_ini
      AND a.inicio <= p_fim
      AND NOT (a.paciente_id IS NULL
               AND upper(btrim(coalesce(a.paciente_nome, ''))) = 'DISPONIVEL')
  ),
  cat_ag AS (
    SELECT s.id, min(s.pri) AS pri
    FROM (
      SELECT a.id,
             CASE coalesce(nullif(p1.cat, 'outro'), nullif(p2.cat, 'outro'), 'outro')
               WHEN 'cirurgia'     THEN 1
               WHEN 'imagem'       THEN 2
               WHEN 'procedimento' THEN 3
               WHEN 'consulta'     THEN 4
               WHEN 'laboratorio'  THEN 5
               ELSE 6
             END AS pri
      FROM ags a
      CROSS JOIN LATERAL regexp_split_to_table(a.procedimento, '\s+\+\s+') AS x(parte)
      LEFT JOIN proc p1
        ON p1.chave = lower(btrim(unaccent(x.parte)))
      LEFT JOIN proc p2
        ON p2.chave = lower(btrim(unaccent(regexp_replace(x.parte, '\s*\([^()]*\)\s*$', ''))))
      WHERE a.procedimento IS NOT NULL
        AND a.procedimento <> ''
        AND btrim(x.parte) <> ''
    ) s
    GROUP BY s.id
  ),
  base AS (
    SELECT a.*,
           CASE coalesce(c.pri, 0)
             WHEN 1 THEN 'cirurgia'
             WHEN 2 THEN 'imagem'
             WHEN 3 THEN 'procedimento'
             WHEN 4 THEN 'consulta'
             WHEN 5 THEN 'laboratorio'
             ELSE NULL
           END AS cat,
           CASE
             WHEN a.procedimento IS NOT NULL AND a.procedimento <> ''
               THEN coalesce(c.pri, 6) = 5
             ELSE a.medico_id IN (SELECT medico_id FROM lab_med)
           END AS is_lab,
           coalesce(a.paciente_id::text, a.id::text) || '|'
             || (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date::text AS chave_lab,
           -- Atendido de verdade: marcado como realizado, com horario de
           -- execucao registrado, ou ja pago.
           (a.status::text = 'realizado' OR a.executado_em IS NOT NULL OR a.pago) AS realizado
    FROM ags a
    LEFT JOIN cat_ag c ON c.id = a.id
  ),
  atend AS (
    SELECT
      count(*) FILTER (WHERE realizado AND NOT is_lab AND cat = 'consulta') AS consultas,
      -- Exames = imagem (1 por linha) + laboratorio (1 por paciente/dia).
      count(*) FILTER (WHERE realizado AND NOT is_lab AND cat = 'imagem')
        + count(DISTINCT chave_lab) FILTER (WHERE realizado AND is_lab) AS exames,
      count(*) FILTER (WHERE realizado AND NOT is_lab AND cat IN ('procedimento', 'cirurgia')) AS procedimentos,
      -- Servico sem "tipo de procedimento" no cadastro. Fica visivel de
      -- proposito: some sozinho conforme o cadastro for preenchido.
      count(*) FILTER (
        WHERE realizado AND NOT is_lab
          AND (cat IS NULL OR cat NOT IN ('consulta', 'imagem', 'procedimento', 'cirurgia'))
      ) AS sem_tipo,
      count(*) FILTER (WHERE realizado AND NOT is_lab)
        + count(DISTINCT chave_lab) FILTER (WHERE realizado AND is_lab) AS total
    FROM base
  ),
  -- Inadimplencia real: TODA parcela ja vencida, de qualquer mes, nao paga e
  -- fora da tolerancia. Canceladas ficam de fora dos dois lados da conta.
  -- Denominador = tudo o que ja venceu ate hoje (pago + em aberto).
  inad AS (
    SELECT
      count(*) FILTER (
        WHERE m.status NOT IN ('pago', 'cancelado')
          AND m.vencimento < v_hoje - v_tolerancia
      ) AS atrasadas,
      coalesce(sum(m.valor) FILTER (
        WHERE m.status NOT IN ('pago', 'cancelado')
          AND m.vencimento < v_hoje - v_tolerancia
      ), 0) AS atrasadas_valor,
      coalesce(sum(coalesce(m.valor_pago, m.valor)) FILTER (WHERE m.status = 'pago'), 0)
        + coalesce(sum(m.valor) FILTER (WHERE m.status NOT IN ('pago', 'cancelado')), 0)
        AS base_valor,
      count(DISTINCT m.contrato_id) FILTER (
        WHERE m.status NOT IN ('pago', 'cancelado')
          AND m.vencimento < v_hoje - v_tolerancia
      ) AS contratos
    FROM public.contrato_mensalidades m
    WHERE m.clinica_id = p_clinica
      AND m.vencimento <= v_hoje
  ),
  aniver AS (
    SELECT
      count(*) FILTER (
        WHERE to_char(data_nascimento, 'MM-DD') = to_char(v_hoje, 'MM-DD')
      ) AS hoje,
      count(*) FILTER (
        WHERE to_char(data_nascimento, 'MM') = to_char(v_hoje, 'MM')
      ) AS mes
    FROM public.pacientes
    WHERE clinica_id = p_clinica
      AND ativo IS TRUE
      AND data_nascimento IS NOT NULL
  )
  SELECT jsonb_build_object(
    'atendimentos', jsonb_build_object(
      'consultas',     a.consultas,
      'exames',        a.exames,
      'procedimentos', a.procedimentos,
      'semTipo',       a.sem_tipo,
      'total',         a.total
    ),
    'inadimplencia', jsonb_build_object(
      'atrasadas',      i.atrasadas,
      'atrasadasValor', i.atrasadas_valor,
      'baseValor',      i.base_valor,
      'contratos',      i.contratos,
      'pct', CASE WHEN i.base_valor > 0
                  THEN round((i.atrasadas_valor / i.base_valor) * 100, 1)
                  ELSE 0 END
    ),
    'aniversariantes', jsonb_build_object(
      'hoje', n.hoje,
      'mes',  n.mes
    )
  )
  INTO v_resultado
  FROM atend a CROSS JOIN inad i CROSS JOIN aniver n;

  RETURN coalesce(v_resultado, '{}'::jsonb);
END;
$fn$;

-- ---------------------------------------------------------------------------
-- 2/2 — painel_executivo_periodo
--
-- Mesma correcao de "atendido de verdade" aplicada a Producao: Compareceram,
-- Taxa de comparecimento, No-show, Tempo medio e o ranking por medico saiam
-- todos do mesmo `status = 'realizado'`. Tambem ganha a segunda tentativa de
-- casar o nome do servico e o tipo "equipamento", para os dois paineis
-- classificarem o mesmo agendamento da mesma forma.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.painel_executivo_periodo(
  p_clinica uuid,
  p_ini timestamp with time zone,
  p_fim timestamp with time zone,
  p_de date,
  p_ate date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '60s'
AS $fn$
DECLARE
  v_resultado jsonb;
BEGIN
  IF NOT public.is_member(auth.uid(), p_clinica) THEN
    RETURN NULL;
  END IF;

  WITH
  proc AS (
    SELECT DISTINCT ON (chave) chave, cat
    FROM (
      SELECT lower(btrim(unaccent(pr.nome))) AS chave,
             CASE lower(btrim(coalesce(pr.tipo_procedimento, '')))
               WHEN 'laboratorio'  THEN 'laboratorio'
               WHEN 'imagem'       THEN 'imagem'
               WHEN 'exame'        THEN 'imagem'
               WHEN 'equipamento'  THEN 'imagem'
               WHEN 'consulta'     THEN 'consulta'
               WHEN 'procedimento' THEN 'procedimento'
               WHEN 'cirurgia'     THEN 'cirurgia'
               ELSE 'outro'
             END AS cat
      FROM public.procedimentos pr
      WHERE pr.clinica_id = p_clinica
        AND pr.ativo
        AND coalesce(btrim(pr.nome), '') <> ''
    ) t
    ORDER BY chave, (cat = 'outro'), cat
  ),
  lab_med AS (
    SELECT DISTINCT me.medico_id
    FROM public.medico_especialidades me
    JOIN public.especialidades e ON e.id = me.especialidade_id
    WHERE lower(coalesce(e.nome, '')) LIKE '%laborat%'
  ),
  esp_med AS (
    SELECT DISTINCT ON (me.medico_id) me.medico_id, me.especialidade_id
    FROM public.medico_especialidades me
    ORDER BY me.medico_id, me.especialidade_id
  ),
  -- TODAS as linhas da agenda no periodo, inclusive os horarios livres.
  -- So a capacidade usa esta CTE inteira; o resto do painel usa `ags`.
  ags_todos AS (
    SELECT a.id, a.status::text AS status, a.medico_id, a.paciente_id,
           a.inicio, a.fim, a.executado_em,
           a.fluxo_etapa::text AS fluxo_etapa, a.procedimento,
           (a.paciente_id IS NULL
            AND upper(btrim(coalesce(a.paciente_nome, ''))) = 'DISPONIVEL') AS vago,
           EXISTS (
             SELECT 1 FROM public.fin_lancamentos l
             WHERE l.agendamento_id = a.id
               AND l.tipo = 'receita'
               AND l.status = 'confirmado'
           ) AS pago,
           CASE
             WHEN a.fim IS NOT NULL AND a.inicio IS NOT NULL
              AND extract(epoch FROM (a.fim - a.inicio)) / 60 > 0
              AND extract(epoch FROM (a.fim - a.inicio)) / 60 < 1440
               THEN extract(epoch FROM (a.fim - a.inicio)) / 60
           END AS dur_min
    FROM public.agendamentos a
    WHERE a.clinica_id = p_clinica
      AND a.inicio >= p_ini
      AND a.inicio <= p_fim
  ),
  ags AS (
    SELECT t.id, t.status, t.medico_id, t.paciente_id, t.inicio, t.fim,
           t.executado_em, t.fluxo_etapa, t.procedimento, t.dur_min, t.pago
    FROM ags_todos t
    WHERE NOT t.vago
  ),
  cat_ag AS (
    SELECT s.id, min(s.pri) AS pri
    FROM (
      SELECT a.id,
             CASE coalesce(nullif(p1.cat, 'outro'), nullif(p2.cat, 'outro'), 'outro')
               WHEN 'cirurgia'     THEN 1
               WHEN 'imagem'       THEN 2
               WHEN 'procedimento' THEN 3
               WHEN 'consulta'     THEN 4
               WHEN 'laboratorio'  THEN 5
               ELSE 6
             END AS pri
      FROM ags a
      CROSS JOIN LATERAL regexp_split_to_table(a.procedimento, '\s+\+\s+') AS x(parte)
      LEFT JOIN proc p1
        ON p1.chave = lower(btrim(unaccent(x.parte)))
      LEFT JOIN proc p2
        ON p2.chave = lower(btrim(unaccent(regexp_replace(x.parte, '\s*\([^()]*\)\s*$', ''))))
      WHERE a.procedimento IS NOT NULL
        AND a.procedimento <> ''
        AND btrim(x.parte) <> ''
    ) s
    GROUP BY s.id
  ),
  base AS (
    SELECT a.*,
           CASE
             WHEN a.procedimento IS NOT NULL AND a.procedimento <> ''
               THEN coalesce(c.pri, 6) = 5
             ELSE a.medico_id IN (SELECT medico_id FROM lab_med)
           END AS is_lab,
           coalesce(a.paciente_id::text, a.id::text) || '|'
             || (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date::text AS chave_lab,
           -- Mesma definicao de dashboard_blocos_periodo.
           (a.status = 'realizado' OR a.executado_em IS NOT NULL OR a.pago) AS realizado,
           CASE
             WHEN a.executado_em IS NOT NULL AND a.inicio IS NOT NULL
              AND extract(epoch FROM (a.executado_em - a.inicio)) / 60 > 0
              AND extract(epoch FROM (a.executado_em - a.inicio)) / 60 < 720
               THEN extract(epoch FROM (a.executado_em - a.inicio)) / 60
           END AS atraso_min
    FROM ags a
    LEFT JOIN cat_ag c ON c.id = a.id
  ),
  contagens AS (
    SELECT
      count(*) FILTER (WHERE NOT is_lab AND status <> 'cancelado')
        + count(DISTINCT chave_lab) FILTER (WHERE is_lab AND status <> 'cancelado') AS agendados,
      count(*) FILTER (WHERE NOT is_lab AND (status IN ('confirmado','realizado','faltou') OR pago OR (fluxo_etapa IS NOT NULL AND fluxo_etapa <> 'aguardando_recepcao')))
        + count(DISTINCT chave_lab) FILTER (WHERE is_lab AND (status IN ('confirmado','realizado','faltou') OR pago OR (fluxo_etapa IS NOT NULL AND fluxo_etapa <> 'aguardando_recepcao'))) AS confirmados,
      count(*) FILTER (WHERE NOT is_lab AND realizado)
        + count(DISTINCT chave_lab) FILTER (WHERE is_lab AND realizado) AS compareceram,
      count(*) FILTER (WHERE NOT is_lab AND status = 'faltou')
        + count(DISTINCT chave_lab) FILTER (WHERE is_lab AND status = 'faltou') AS faltaram,
      count(*) FILTER (WHERE NOT is_lab AND status = 'cancelado')
        + count(DISTINCT chave_lab) FILTER (WHERE is_lab AND status = 'cancelado') AS cancelaram,
      coalesce(sum(dur_min) FILTER (WHERE status <> 'cancelado'), 0) AS agendado_min,
      avg(dur_min) FILTER (WHERE status <> 'cancelado' AND realizado) AS tempo_medio_min,
      -- O atraso continua saindo so de quem tem horario de execucao gravado:
      -- sem esse carimbo nao ha como medir atraso, e o card ja avisa quando a
      -- amostra e pequena demais.
      avg(atraso_min) FILTER (WHERE executado_em IS NOT NULL) AS atraso_medio_min,
      count(*) FILTER (WHERE status = 'faltou') AS marcacoes_falta,
      count(*) FILTER (WHERE executado_em IS NOT NULL) AS marcacoes_execucao
    FROM base
  ),
  capacidade AS (
    SELECT coalesce(sum(t.dur_min) FILTER (WHERE t.status <> 'cancelado'), 0) AS minutos
    FROM ags_todos t
  ),
  por_medico AS (
    SELECT coalesce(m.nome, '-') AS nome,
           count(*) FILTER (WHERE NOT b.is_lab AND b.status <> 'cancelado')
             + count(DISTINCT b.chave_lab) FILTER (WHERE b.is_lab AND b.status <> 'cancelado') AS total,
           count(*) FILTER (WHERE NOT b.is_lab AND b.realizado)
             + count(DISTINCT b.chave_lab) FILTER (WHERE b.is_lab AND b.realizado) AS realizados
    FROM base b
    LEFT JOIN public.medicos m ON m.id = b.medico_id
    WHERE b.medico_id IS NOT NULL
    GROUP BY b.medico_id, m.nome
    ORDER BY total DESC
    LIMIT 12
  ),
  por_especialidade AS (
    SELECT coalesce(e.nome, '-') AS nome, count(*) AS total
    FROM base b
    JOIN esp_med em ON em.medico_id = b.medico_id
    LEFT JOIN public.especialidades e ON e.id = em.especialidade_id
    WHERE b.status <> 'cancelado' AND b.medico_id IS NOT NULL
    GROUP BY em.especialidade_id, e.nome
    ORDER BY total DESC
    LIMIT 12
  ),
  lancs AS (
    SELECT l.tipo::text AS tipo, l.status::text AS status, l.valor, l.data,
           l.data_vencimento, l.empresa_id, l.agendamento_id
    FROM public.fin_lancamentos l
    WHERE l.clinica_id = p_clinica
      AND (   (l.data            >= p_de AND l.data            <= p_ate)
           OR (l.data_vencimento >= p_de AND l.data_vencimento <= p_ate))
  ),
  fin AS (
    SELECT
      coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'pendente'), 0) AS receita_prevista,
      coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'pendente'), 0) AS despesa_prevista,
      coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'confirmado' AND data >= p_de AND data <= p_ate), 0) AS receita_realizada,
      coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'confirmado' AND data >= p_de AND data <= p_ate), 0) AS despesa_realizada,
      coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'confirmado' AND data >= p_de AND data <= p_ate AND empresa_id IS NOT NULL), 0) AS receita_convenio,
      count(DISTINCT agendamento_id) FILTER (WHERE tipo = 'receita' AND status = 'confirmado' AND data >= p_de AND data <= p_ate AND agendamento_id IS NOT NULL) AS atendimentos_pagos
    FROM lancs
  ),
  pacs AS (
    SELECT DISTINCT b.paciente_id
    FROM base b
    WHERE b.paciente_id IS NOT NULL
  ),
  novos AS (
    SELECT count(*) AS n
    FROM pacs
    WHERE NOT EXISTS (
      SELECT 1 FROM public.agendamentos h
      WHERE h.clinica_id = p_clinica
        AND h.paciente_id = pacs.paciente_id
        AND h.inicio < p_ini
    )
  ),
  orcs AS (
    SELECT count(*) AS total,
           count(*) FILTER (
             WHERE lower(coalesce(o.status, '')) <> 'cancelado'
               AND EXISTS (SELECT 1 FROM public.agendamentos a WHERE a.orcamento_id = o.id)
           ) AS convertidos
    FROM public.orcamentos o
    WHERE o.clinica_id = p_clinica
      AND o.created_at >= p_ini
      AND o.created_at <= p_fim
  )
  SELECT jsonb_build_object(
    'producao', jsonb_build_object(
      'agendados',        c.agendados,
      'confirmados',      c.confirmados,
      'compareceram',     c.compareceram,
      'faltaram',         c.faltaram,
      'cancelaram',       c.cancelaram,
      'capacidadeMin',    round(cap.minutos),
      'agendadoMin',      round(c.agendado_min),
      'ocupacaoPct',      CASE WHEN cap.minutos > 0 THEN round((c.agendado_min / cap.minutos) * 100, 1) ELSE 0 END,
      'tempoMedioMin',    round(coalesce(c.tempo_medio_min, 0), 1),
      'porMedico',        coalesce((SELECT jsonb_agg(jsonb_build_object('nome', nome, 'total', total, 'realizados', realizados)) FROM por_medico), '[]'::jsonb),
      'porEspecialidade', coalesce((SELECT jsonb_agg(jsonb_build_object('nome', nome, 'total', total)) FROM por_especialidade), '[]'::jsonb)
    ),
    'financeiro', jsonb_build_object(
      'receitaPrevista',   fin.receita_prevista,
      'receitaRealizada',  fin.receita_realizada,
      'despesaPrevista',   fin.despesa_prevista,
      'despesaRealizada',  fin.despesa_realizada,
      'resultado',         fin.receita_realizada - fin.despesa_realizada,
      'receitaConvenio',   fin.receita_convenio,
      'receitaParticular', greatest(0, fin.receita_realizada - fin.receita_convenio),
      'ticketMedio',       CASE WHEN fin.atendimentos_pagos > 0 THEN round(fin.receita_realizada / fin.atendimentos_pagos, 2) ELSE 0 END
    ),
    'comercial', jsonb_build_object(
      'novos',               novos.n,
      'recorrentes',         greatest(0, (SELECT count(*) FROM pacs) - novos.n),
      'orcamentosNoPeriodo', orcs.total,
      'conversaoOrcamento',  CASE WHEN orcs.total > 0 THEN round((orcs.convertidos::numeric / orcs.total) * 100, 1) ELSE 0 END
    ),
    'qualidade', jsonb_build_object(
      'noShowPct',         CASE WHEN (c.compareceram + c.faltaram) > 0 THEN round((c.faltaram::numeric / (c.compareceram + c.faltaram)) * 100, 1) ELSE 0 END,
      'atrasoMedioMin',    round(coalesce(c.atraso_medio_min, 0), 1),
      'marcacoesFalta',    c.marcacoes_falta,
      'marcacoesExecucao', c.marcacoes_execucao
    )
  )
  INTO v_resultado
  FROM contagens c, capacidade cap, fin, novos, orcs;

  RETURN v_resultado;
END;
$fn$;
