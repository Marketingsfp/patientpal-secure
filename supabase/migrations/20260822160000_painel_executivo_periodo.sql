-- Painel Executivo — todos os indicadores do periodo, calculados no banco.
--
-- ============================== POR QUE ESTA FUNCAO EXISTE ==================
-- A tela buscava as linhas cruas (agendamentos, lancamentos, orcamentos) e
-- somava tudo dentro do navegador. So que o PostgREST devolve no MAXIMO 1.000
-- linhas por consulta: nos ultimos 30 dias a clinica tem ~24.100 agendamentos e
-- ~3.500 lancamentos, entao o painel contava so um pedaco e nao avisava.
--
-- Efeito medido em 22/08/2026 (periodo de 24/07 a 22/08), antes desta funcao:
--   Agendamentos ...... painel 999          | real 24.123
--   Clientes atendidos  painel 210          | real  1.593
--   Recebimentos ...... painel R$ 93.204,40 | real  R$ 367.442,46
--   Pagamentos ........ painel R$ 21.724,25 | real  R$  69.407,18
--   Ocupacao .......... painel 1,6%         | real  ~38%
-- E as variacoes "vs. periodo anterior" explodiam (+3608%) porque comparavam
-- dois recortes truncados de 1.000 linhas, sem relacao com o tamanho real.
--
-- Mesmo motivo e mesmo desenho da funcao `painel_grs_periodo`
-- (20260819180000), que ja tinha resolvido o card de GRs/Guias.
--
-- ================================ AS REGRAS ================================
-- 1. Contagem de atendimentos: espelha `src/lib/agenda/contagem.ts`. Exame de
--    LABORATORIO conta 1 por paciente/dia (N exames na mesma ficha = 1
--    atendimento); todas as outras categorias contam 1 por linha.
-- 2. Categoria do procedimento: espelha `src/lib/procedimento/categoria.ts`.
--    O agendamento guarda o procedimento como texto livre e pode vir
--    concatenado ("HEMOGRAMA + GLICEMIA"); cada parte e resolvida pelo nome em
--    `procedimentos.tipo_procedimento` e, quando ha mistura, vale a categoria
--    de maior prioridade (cirurgia > imagem > procedimento > consulta >
--    laboratorio > outro). Se o agendamento nao tem texto de procedimento,
--    cai na heuristica antiga: medico de especialidade "laboratorio".
-- 3. "Confirmados" agora usa a etapa `aguardando_recepcao`. O codigo antigo
--    comparava com 'aguardando', que NAO existe no enum `fluxo_etapa` — o
--    teste dava verdadeiro para todo mundo e por isso Confirmados aparecia
--    sempre igual a Agendamentos.
-- 4. Ticket medio = recebimentos do periodo / clientes atendidos no periodo.
--    Antes vinha da media de `fin_atendimentos.valor_total`, uma tabela que a
--    clinica parou de alimentar em 29/07/2026 (6 linhas somando R$ 18,00 no
--    periodo, o que dava o "R$ 3,00" da tela). Agora o numero fecha na mao com
--    os dois cards vizinhos do painel.
-- 5. Conversao de orcamento = orcamentos do periodo com pelo menos um
--    agendamento vinculado. Antes exigia `status = 'aprovado'`, que nunca
--    acontece: os 94 orcamentos ja criados na clinica estao todos como
--    'aberto'. A regra usada aqui e a mesma de `deriveStatus` em
--    `src/components/orcamentos-v2/status-utils.ts`.
-- 6. Datas: `p_ini`/`p_fim` filtram `agendamentos.inicio` (timestamp) e
--    `p_de`/`p_ate` filtram as colunas de data do financeiro — exatamente a
--    mesma separacao que a tela fazia antes.
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
  ags AS (
    SELECT a.id, a.status::text AS status, a.medico_id, a.paciente_id,
           a.inicio, a.fim, a.executado_em,
           a.fluxo_etapa::text AS fluxo_etapa, a.procedimento
    FROM public.agendamentos a
    WHERE a.clinica_id = p_clinica
      AND a.inicio >= p_ini
      AND a.inicio <= p_fim
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
             WHEN a.fim IS NOT NULL AND a.inicio IS NOT NULL
              AND extract(epoch FROM (a.fim - a.inicio)) / 60 > 0
              AND extract(epoch FROM (a.fim - a.inicio)) / 60 < 1440
               THEN extract(epoch FROM (a.fim - a.inicio)) / 60
           END AS dur_min,
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
      avg(atraso_min) FILTER (WHERE status = 'realizado' OR executado_em IS NOT NULL) AS atraso_medio_min
    FROM base
  ),
  capacidade AS (
    SELECT coalesce(sum(extract(epoch FROM (d.hora_fim - d.hora_inicio)) / 60), 0) AS minutos
    FROM generate_series(p_de, p_ate, interval '1 day') AS g(dia)
    JOIN public.medico_disponibilidades d
      ON d.clinica_id = p_clinica
     AND d.ativo
     AND d.dia_semana = extract(dow FROM g.dia)::int
     AND (d.vigencia_inicio IS NULL OR g.dia::date >= d.vigencia_inicio)
     AND (d.vigencia_fim    IS NULL OR g.dia::date <= d.vigencia_fim)
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
           l.data_vencimento, l.empresa_id
    FROM public.fin_lancamentos l
    WHERE l.clinica_id = p_clinica
      AND (   (l.data            >= p_de AND l.data            <= p_ate)
           OR (l.data_vencimento >= p_de AND l.data_vencimento <= p_ate))
  ),
  fin AS (
    SELECT
      coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'previsto'), 0) AS receita_prevista,
      coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'previsto'), 0) AS despesa_prevista,
      coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'confirmado' AND data >= p_de AND data <= p_ate), 0) AS receita_realizada,
      coalesce(sum(valor) FILTER (WHERE tipo = 'despesa' AND status = 'confirmado' AND data >= p_de AND data <= p_ate), 0) AS despesa_realizada,
      coalesce(sum(valor) FILTER (WHERE tipo = 'receita' AND status = 'confirmado' AND data >= p_de AND data <= p_ate AND empresa_id IS NOT NULL), 0) AS receita_convenio
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
      -- regra 4: fecha na mao com os cards "Recebimentos" e "Clientes atendidos"
      'ticketMedio',       CASE WHEN c.compareceram > 0 THEN round(fin.receita_realizada / c.compareceram, 2) ELSE 0 END
    ),
    'comercial', jsonb_build_object(
      'novos',               novos.n,
      'recorrentes',         greatest(0, (SELECT count(*) FROM pacs) - novos.n),
      'orcamentosNoPeriodo', orcs.total,
      'conversaoOrcamento',  CASE WHEN orcs.total > 0 THEN round((orcs.convertidos::numeric / orcs.total) * 100, 1) ELSE 0 END
    ),
    'qualidade', jsonb_build_object(
      'noShowPct',      CASE WHEN (c.compareceram + c.faltaram) > 0 THEN round((c.faltaram::numeric / (c.compareceram + c.faltaram)) * 100, 1) ELSE 0 END,
      'atrasoMedioMin', round(coalesce(c.atraso_medio_min, 0), 1)
    )
  )
  INTO v_resultado
  FROM contagens c, capacidade cap, fin, novos, orcs;

  RETURN v_resultado;
END;
$function$;

REVOKE ALL ON FUNCTION public.painel_executivo_periodo(uuid, timestamptz, timestamptz, date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.painel_executivo_periodo(uuid, timestamptz, timestamptz, date, date) TO authenticated;
