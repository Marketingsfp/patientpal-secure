-- Painel Executivo — corrige "Agendamentos", "Ocupacao" e "Previsto".
--
-- ============================ 1) AGENDAMENTOS ==============================
-- A agenda desta clinica grava uma linha para CADA horario publicado, ocupado
-- ou nao. O horario livre entra como paciente_id NULL e paciente_nome
-- 'DISPONIVEL'. A funcao contava todas essas linhas como agendamento:
--
--   ultimos 30 dias -> 25.179 linhas, das quais 21.893 sao 'DISPONIVEL'.
--   Marcacoes de verdade: 3.286. O card mostrava quase 8x o que aconteceu.
--
-- O filtro exclui a linha SO quando ela nao tem paciente vinculado E se chama
-- 'DISPONIVEL'. Nao basta olhar paciente_id: existem 2 marcacoes reais no
-- historico digitadas so pelo nome, sem vinculo com o cadastro, e elas
-- precisam continuar contando.
--
-- ============================== 2) OCUPACAO ================================
-- Vinha estourando 100% (127,1% em 30 dias) por duas razoes somadas:
--   a) os minutos "agendados" incluiam os mesmos horarios livres;
--   b) a capacidade saia de medico_disponibilidades, e 27 dos 79 medicos que
--      atenderam no mes nao tem grade cadastrada — entravam com atendimento e
--      capacidade zero.
--
-- A capacidade passa a ser a PROPRIA AGENDA PUBLICADA: a soma dos minutos de
-- todas as linhas do periodo, livres e ocupadas. Duas consequencias boas:
--   - existe para todo medico, com grade cadastrada ou sem;
--   - o numerador e um subconjunto do denominador, entao o indicador NAO tem
--     como passar de 100% — sem precisar de nenhum limite artificial.
--
-- Medido na base de producao: 18/08 -> 33,8%, 19/08 -> 26,0%, 25/08 -> 19,8%.
-- Em 30 dias: 11,4% (diluido pelos dias futuros ainda sem marcacao).
--
-- medico_disponibilidades deixa de ser usada por esta funcao. A tabela
-- continua existindo e servindo a agenda; so nao entra mais neste calculo.
--
-- ============================== 3) PREVISTO ================================
-- A funcao somava lancamentos com status 'previsto'. Esse status NAO EXISTE:
-- o tipo fin_status_lancamento so aceita 'pendente', 'confirmado' e
-- 'cancelado'. O filtro nunca casava, e "Receita prevista" e "Despesa
-- prevista" mostravam R$ 0,00 desde sempre. Agora le 'pendente', que e o
-- equivalente real de "ainda nao entrou".
--
-- Observacao honesta: nesta clinica isso continuara zerado enquanto o fluxo
-- for o de hoje — nunca houve um lancamento pendente na base inteira, porque
-- a recepcao lanca e confirma no mesmo ato. Por isso a tela passa a esconder
-- o "Previsto" quando ele for zero, em vez de exibir um R$ 0,00 sem sentido.
--
-- ========================= 4) QUALIDADE: SEM MARCACAO ======================
-- Dois campos novos no bloco 'qualidade', para a tela saber quando o
-- indicador nao tem base nenhuma em vez de mostrar zero como se fosse
-- medicao:
--   marcacoesFalta    -> quantos agendamentos do periodo estao como 'faltou'
--   marcacoesExecucao -> quantos tem executado_em preenchido
--
-- Em 30 dias sao 0 e 1, contra 3.278 marcacoes de verdade: a clinica nunca
-- marcou uma falta em toda a historia do sistema, e um unico atendimento tem
-- horario de execucao. A tela exige uma amostra minima (AMOSTRA_MINIMA, em
-- app.painel-executivo.tsx) antes de publicar o indicador — uma media tirada
-- de um registro so parece medicao sem ser. Quando a recepcao passar a
-- registrar, os indicadores voltam sozinhos, sem nova alteracao.

CREATE OR REPLACE FUNCTION public.painel_executivo_periodo(
  p_clinica uuid,
  p_ini timestamptz,
  p_fim timestamptz,
  p_de date,
  p_ate date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET statement_timeout TO '60s'
AS $function$
DECLARE
  v_resultado jsonb;
BEGIN
  IF NOT public.is_member(auth.uid(), p_clinica) THEN
    RETURN NULL;
  END IF;

  WITH
  -- nome do procedimento -> categoria operacional
  proc AS (
    SELECT DISTINCT ON (chave) chave, cat
    FROM (
      SELECT lower(btrim(unaccent(pr.nome))) AS chave,
             CASE lower(btrim(coalesce(pr.tipo_procedimento, '')))
               WHEN 'laboratorio'  THEN 'laboratorio'
               WHEN 'imagem'       THEN 'imagem'
               WHEN 'exame'        THEN 'imagem'   -- legado: mesma regra de imagem
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
    -- mesmo criterio do resolver em TS: se o nome repete com tipos diferentes,
    -- a categoria especifica ganha de 'outro'.
    ORDER BY chave, (cat = 'outro'), cat
  ),
  lab_med AS (
    SELECT DISTINCT me.medico_id
    FROM public.medico_especialidades me
    JOIN public.especialidades e ON e.id = me.especialidade_id
    WHERE lower(coalesce(e.nome, '')) LIKE '%laborat%'
  ),
  -- primeira especialidade de cada medico (escolha estavel, por id)
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
  -- Marcacoes de verdade: horario livre nao e agendamento.
  ags AS (
    SELECT t.id, t.status, t.medico_id, t.paciente_id, t.inicio, t.fim,
           t.executado_em, t.fluxo_etapa, t.procedimento, t.dur_min
    FROM ags_todos t
    WHERE NOT t.vago
  ),
  -- categoria resolvida por agendamento: menor prioridade numerica vence
  cat_ag AS (
    SELECT s.id, min(s.pri) AS pri
    FROM (
      SELECT a.id,
             CASE coalesce(p.cat, 'outro')
               WHEN 'cirurgia'     THEN 1
               WHEN 'imagem'       THEN 2
               WHEN 'procedimento' THEN 3
               WHEN 'consulta'     THEN 4
               WHEN 'laboratorio'  THEN 5
               ELSE 6
             END AS pri
      FROM ags a
      CROSS JOIN LATERAL regexp_split_to_table(a.procedimento, '\s+\+\s+') AS x(parte)
      LEFT JOIN proc p ON p.chave = lower(btrim(unaccent(x.parte)))
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
           -- chave de agrupamento do laboratorio: paciente + dia
           coalesce(a.paciente_id::text, a.id::text) || '|'
             || (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date::text AS chave_lab,
           CASE
             WHEN a.executado_em IS NOT NULL AND a.inicio IS NOT NULL
              AND extract(epoch FROM (a.executado_em - a.inicio)) / 60 > 0
              AND extract(epoch FROM (a.executado_em - a.inicio)) / 60 < 720
               THEN extract(epoch FROM (a.executado_em - a.inicio)) / 60
           END AS atraso_min
    FROM ags a
    LEFT JOIN cat_ag c ON c.id = a.id
  ),
  -- ---------------- Producao ----------------
  contagens AS (
    SELECT
      count(*) FILTER (WHERE NOT is_lab AND status <> 'cancelado')
        + count(DISTINCT chave_lab) FILTER (WHERE is_lab AND status <> 'cancelado') AS agendados,
      count(*) FILTER (WHERE NOT is_lab AND (status IN ('confirmado','realizado','faltou') OR (fluxo_etapa IS NOT NULL AND fluxo_etapa <> 'aguardando_recepcao')))
        + count(DISTINCT chave_lab) FILTER (WHERE is_lab AND (status IN ('confirmado','realizado','faltou') OR (fluxo_etapa IS NOT NULL AND fluxo_etapa <> 'aguardando_recepcao'))) AS confirmados,
      count(*) FILTER (WHERE NOT is_lab AND (status = 'realizado' OR executado_em IS NOT NULL))
        + count(DISTINCT chave_lab) FILTER (WHERE is_lab AND (status = 'realizado' OR executado_em IS NOT NULL)) AS compareceram,
      count(*) FILTER (WHERE NOT is_lab AND status = 'faltou')
        + count(DISTINCT chave_lab) FILTER (WHERE is_lab AND status = 'faltou') AS faltaram,
      count(*) FILTER (WHERE NOT is_lab AND status = 'cancelado')
        + count(DISTINCT chave_lab) FILTER (WHERE is_lab AND status = 'cancelado') AS cancelaram,
      coalesce(sum(dur_min) FILTER (WHERE status <> 'cancelado'), 0) AS agendado_min,
      avg(dur_min) FILTER (WHERE status <> 'cancelado' AND (status = 'realizado' OR executado_em IS NOT NULL)) AS tempo_medio_min,
      avg(atraso_min) FILTER (WHERE status = 'realizado' OR executado_em IS NOT NULL) AS atraso_medio_min,
      -- quanto o periodo tem de marcacao para os indicadores de qualidade
      count(*) FILTER (WHERE status = 'faltou') AS marcacoes_falta,
      count(*) FILTER (WHERE executado_em IS NOT NULL) AS marcacoes_execucao
    FROM base
  ),
  -- Capacidade = a agenda publicada do periodo, livre + ocupada. Ver o
  -- cabecalho: e o que existe para todo medico e o que impede o indicador de
  -- passar de 100%.
  capacidade AS (
    SELECT coalesce(sum(t.dur_min) FILTER (WHERE t.status <> 'cancelado'), 0) AS minutos
    FROM ags_todos t
  ),
  por_medico AS (
    SELECT coalesce(m.nome, '-') AS nome,
           count(*) FILTER (WHERE NOT b.is_lab AND b.status <> 'cancelado')
             + count(DISTINCT b.chave_lab) FILTER (WHERE b.is_lab AND b.status <> 'cancelado') AS total,
           count(*) FILTER (WHERE NOT b.is_lab AND (b.status = 'realizado' OR b.executado_em IS NOT NULL))
             + count(DISTINCT b.chave_lab) FILTER (WHERE b.is_lab AND (b.status = 'realizado' OR b.executado_em IS NOT NULL)) AS realizados
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
  -- ---------------- Financeiro ----------------
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
      -- 'pendente' e o unico status de "ainda nao entrou" que existe no
      -- sistema; a versao anterior procurava 'previsto', que nunca existiu.
      coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'pendente'), 0) AS receita_prevista,
      coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'pendente'), 0) AS despesa_prevista,
      coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'confirmado' AND data >= p_de AND data <= p_ate), 0) AS receita_realizada,
      coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'confirmado' AND data >= p_de AND data <= p_ate), 0) AS despesa_realizada,
      coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'confirmado' AND data >= p_de AND data <= p_ate AND empresa_id IS NOT NULL), 0) AS receita_convenio,
      -- divisor do Ticket Medio: atendimentos distintos que geraram recebimento
      count(DISTINCT agendamento_id) FILTER (WHERE tipo = 'receita' AND status = 'confirmado' AND data >= p_de AND data <= p_ate AND agendamento_id IS NOT NULL) AS atendimentos_pagos
    FROM lancs
  ),
  -- ---------------- Comercial ----------------
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
      -- regra 4: divide pelos atendimentos que geraram recebimento, e nao pelos
      -- marcados como "realizado" — ver o cabecalho da migracao original
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
      -- zero aqui significa "nao ha o que medir", nao "esta tudo bem"
      'marcacoesFalta',    c.marcacoes_falta,
      'marcacoesExecucao', c.marcacoes_execucao
    )
  )
  INTO v_resultado
  FROM contagens c, capacidade cap, fin, novos, orcs;

  RETURN v_resultado;
END;
$function$;

-- Mesma permissao das demais RPCs do painel: so usuario logado (e o backend).
REVOKE ALL ON FUNCTION public.painel_executivo_periodo(uuid, timestamptz, timestamptz, date, date) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.painel_executivo_periodo(uuid, timestamptz, timestamptz, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.painel_executivo_periodo(uuid, timestamptz, timestamptz, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.painel_executivo_periodo(uuid, timestamptz, timestamptz, date, date) TO service_role;
