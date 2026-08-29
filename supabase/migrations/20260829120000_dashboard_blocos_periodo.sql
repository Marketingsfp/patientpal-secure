
CREATE OR REPLACE FUNCTION public.dashboard_blocos_periodo(
  p_clinica uuid,
  p_ini timestamptz,
  p_fim timestamptz
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
  -- nome do procedimento -> categoria operacional.
  -- Copia fiel do mesmo bloco de `painel_executivo_periodo`, para que os dois
  -- paineis classifiquem o mesmo agendamento da mesma forma. Se um dia a regra
  -- mudar, tem que mudar nos dois.
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
    ORDER BY chave, (cat = 'outro'), cat
  ),
  lab_med AS (
    SELECT DISTINCT me.medico_id
    FROM public.medico_especialidades me
    JOIN public.especialidades e ON e.id = me.especialidade_id
    WHERE lower(coalesce(e.nome, '')) LIKE '%laborat%'
  ),
  -- Marcacoes de verdade no periodo: horario livre ("DISPONIVEL" sem paciente)
  -- nao e atendimento.
  ags AS (
    SELECT a.id, a.status::text AS status, a.medico_id, a.paciente_id,
           a.inicio, a.executado_em, a.procedimento
    FROM public.agendamentos a
    WHERE a.clinica_id = p_clinica
      AND a.inicio >= p_ini
      AND a.inicio <= p_fim
      AND NOT (a.paciente_id IS NULL
               AND upper(btrim(coalesce(a.paciente_nome, ''))) = 'DISPONIVEL')
  ),
  -- categoria resolvida por agendamento: menor prioridade numerica vence.
  -- Uma ficha "HEMOGRAMA + RX TORAX" conta como imagem, nao como laboratorio.
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
           CASE coalesce(c.pri, 0)
             WHEN 1 THEN 'cirurgia'
             WHEN 2 THEN 'imagem'
             WHEN 3 THEN 'procedimento'
             WHEN 4 THEN 'consulta'
             WHEN 5 THEN 'laboratorio'
             ELSE NULL
           END AS cat,
           -- Sem procedimento cadastrado na ficha, cai na heuristica antiga:
           -- medico de laboratorio => laboratorio.
           CASE
             WHEN a.procedimento IS NOT NULL AND a.procedimento <> ''
               THEN coalesce(c.pri, 6) = 5
             ELSE a.medico_id IN (SELECT medico_id FROM lab_med)
           END AS is_lab,
           -- chave de agrupamento do laboratorio: paciente + dia. Regra
           -- aprovada em 07/07/2026 — N exames de sangue do mesmo paciente no
           -- mesmo dia sao 1 atendimento.
           coalesce(a.paciente_id::text, a.id::text) || '|'
             || (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date::text AS chave_lab,
           (a.status::text = 'realizado' OR a.executado_em IS NOT NULL) AS realizado
    FROM ags a
    LEFT JOIN cat_ag c ON c.id = a.id
  ),
  -- Consultas x Exames, contando so o que foi REALIZADO.
  -- "Exames" = imagem (1 por linha) + laboratorio (1 por paciente/dia).
  atend AS (
    SELECT
      count(*) FILTER (WHERE realizado AND NOT is_lab AND cat = 'consulta') AS consultas,
      count(*) FILTER (WHERE realizado AND NOT is_lab AND cat = 'imagem')
        + count(DISTINCT chave_lab) FILTER (WHERE realizado AND is_lab) AS exames,
      count(*) FILTER (WHERE realizado AND NOT is_lab AND cat IN ('procedimento', 'cirurgia')) AS procedimentos,
      count(*) FILTER (WHERE realizado AND NOT is_lab AND (cat IS NULL OR cat NOT IN ('consulta','imagem','procedimento','cirurgia'))) AS outros
    FROM base
  ),
  -- Aniversariantes. Mesma regra da funcao ja existente
  -- `pacientes_aniversariantes_hoje`: paciente ativo, com data de nascimento
  -- preenchida, comparando so dia e mes.
  aniver AS (
    SELECT
      count(*) FILTER (
        WHERE to_char(data_nascimento, 'MM-DD')
            = to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'MM-DD')
      ) AS hoje,
      count(*) FILTER (
        WHERE to_char(data_nascimento, 'MM')
            = to_char((now() AT TIME ZONE 'America/Sao_Paulo')::date, 'MM')
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
      'outros',        a.outros,
      'total',         a.consultas + a.exames
    ),
    'aniversariantes', jsonb_build_object(
      'hoje', n.hoje,
      'mes',  n.mes
    )
  )
  INTO v_resultado
  FROM atend a CROSS JOIN aniver n;

  RETURN coalesce(v_resultado, '{}'::jsonb);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.dashboard_blocos_periodo(uuid, timestamptz, timestamptz)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- CONFERENCIA RAPIDA (opcional). Troque o UUID pelo da clinica e rode:
--
--   SELECT public.dashboard_blocos_periodo(
--     'COLE-AQUI-O-ID-DA-CLINICA'::uuid,
--     date_trunc('month', now()),
--     now()
--   );
--
-- Esperado: um JSON com "atendimentos" (consultas, exames, total) e
-- "aniversariantes" (hoje, mes).
-- ---------------------------------------------------------------------------
