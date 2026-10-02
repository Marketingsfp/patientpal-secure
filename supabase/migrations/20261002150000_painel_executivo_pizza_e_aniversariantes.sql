-- ===========================================================================
-- Painel Executivo — pizza "Distribuicao de atendimentos" (02/10/2026)
--
-- Troca UMA funcao (dashboard_blocos_periodo) por CREATE OR REPLACE. Nao
-- apaga nem altera nenhum dado. Base: a versao de 20260910144455, que e a
-- que estava no banco.
--
-- O QUE ESTAVA ERRADO
-- A fatia "Sem tipo cadastrado" olhava so o campo "tipo de procedimento" do
-- servico, que esta em branco em 2.612 dos servicos ativos. Esses mesmos
-- servicos tem o campo "tipo" preenchido (exame / procedimento / consulta).
-- Em setembro/2026: 2.102 de 7.314 atendimentos caiam em "sem tipo".
--
-- O QUE MUDA
-- Sem "tipo de procedimento", vale o "tipo". Simulado em setembro/2026:
--   consultas 3.397 -> 3.562 | exames 1.815 -> 3.220
--   procedimentos 0 -> 334   | sem tipo 2.102 -> 198
--   total 7.314 -> 7.314 (igual: o agrupamento de laboratorio nao muda)
-- So a pizza usa esta classificacao.
--
-- ANIVERSARIANTES (aprovado pelo dono em 02/10/2026): passam a contar so
-- quem foi agendado na clinica nos ultimos 2 anos. Hoje 641 -> 28, mes
-- 19.387 -> 943. A lista nominal do painel usa a funcao nova
-- painel_aniversariantes_hoje, com a mesma regra; a funcao antiga
-- pacientes_aniversariantes_hoje fica como esta porque a tela de Clientes
-- tambem a usa.
-- ===========================================================================

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
               -- "Tipo de procedimento" em branco (a maioria do cadastro):
               -- vale o campo "tipo" do mesmo servico. Nunca vira
               -- laboratorio, para nao mudar o agrupamento por paciente/dia
               -- nem o total de atendimentos.
               ELSE CASE lower(btrim(coalesce(pr.tipo, '')))
                      WHEN 'exame'        THEN 'imagem'
                      WHEN 'consulta'     THEN 'consulta'
                      WHEN 'procedimento' THEN 'procedimento'
                      ELSE 'outro'
                    END
             END AS cat,
             (coalesce(btrim(pr.tipo_procedimento), '') = '') AS pelo_tipo
      FROM public.procedimentos pr
      WHERE pr.clinica_id = p_clinica
        AND pr.ativo
        AND coalesce(btrim(pr.nome), '') <> ''
    ) t
    -- O mesmo nome existe cadastrado varias vezes, umas com tipo e outras sem.
    -- Vence a linha que TEM tipo, e entre elas a que tem "tipo de procedimento".
    ORDER BY chave, (cat = 'outro'), pelo_tipo, cat
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
           -- execucao registrado, ou ja pago — e com o dia do agendamento ja
           -- chegado. Pagamento adiantado de consulta futura nao e atendimento.
           ((a.status::text = 'realizado' OR a.executado_em IS NOT NULL OR a.pago)
            AND (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date <= v_hoje) AS realizado
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
      -- Servico nao achado no cadastro, ou com tipo "outro". Fica visivel de
      -- proposito: some sozinho conforme o cadastro for corrigido.
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
  -- Aniversariantes contam so quem foi agendado na clinica nos ultimos 2
  -- anos. O cadastro tem ~249 mil pacientes, a maioria do sistema antigo; em
  -- 02/10/2026 eram 641 aniversariantes no dia pelo cadastro inteiro e 28
  -- entre quem veio nos ultimos 2 anos.
  ativos_2a AS (
    SELECT DISTINCT a.paciente_id
    FROM public.agendamentos a
    WHERE a.clinica_id = p_clinica
      AND a.paciente_id IS NOT NULL
      AND a.inicio >= now() - interval '2 years'
      AND a.inicio <= now()
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
    JOIN ativos_2a ON ativos_2a.paciente_id = pacientes.id
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
-- Lista nominal dos aniversariantes de hoje para o Painel Executivo, com a
-- mesma regra dos 2 anos. Devolve so nome e nascimento (para a idade).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.painel_aniversariantes_hoje(
  _clinica_id uuid,
  _limite integer DEFAULT 60
)
RETURNS TABLE (id uuid, nome text, data_nascimento date)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
  SELECT p.id, p.nome::text, p.data_nascimento
  FROM public.pacientes p
  WHERE p.clinica_id = _clinica_id
    AND p.ativo IS TRUE
    AND p.data_nascimento IS NOT NULL
    AND to_char(p.data_nascimento, 'MM-DD')
        = to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'MM-DD')
    AND public.is_member(auth.uid(), _clinica_id)
    AND EXISTS (
      SELECT 1 FROM public.agendamentos a
      WHERE a.paciente_id = p.id
        AND a.clinica_id = _clinica_id
        AND a.inicio >= now() - interval '2 years'
        AND a.inicio <= now()
    )
  ORDER BY p.nome
  LIMIT _limite;
$fn$;

REVOKE ALL ON FUNCTION public.painel_aniversariantes_hoje(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.painel_aniversariantes_hoje(uuid, integer) TO authenticated;
