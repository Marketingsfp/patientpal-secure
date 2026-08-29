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
  -- nome do servico -> categoria operacional. Mesmo bloco de
  -- `painel_executivo_periodo`, para que os dois paineis classifiquem o mesmo
  -- agendamento da mesma forma.
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
  -- Categoria de cada agendamento: menor prioridade numerica vence. Uma ficha
  -- "HEMOGRAMA + RX TORAX" conta como imagem, nao como laboratorio.
  --
  -- Duas tentativas de encontrar o servico, nesta ordem:
  --   p1 = nome INTEIRO como esta na agenda;
  --   p2 = nome sem o ultimo parenteses (a especialidade que a agenda anexa).
  -- A primeira tem prioridade — ver "O QUE MUDOU" no cabecalho.
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
           -- Sem servico preenchido na ficha, cai na heuristica antiga:
           -- medico de laboratorio => laboratorio.
           CASE
             WHEN a.procedimento IS NOT NULL AND a.procedimento <> ''
               THEN coalesce(c.pri, 6) = 5
             ELSE a.medico_id IN (SELECT medico_id FROM lab_med)
           END AS is_lab,
           -- Agrupamento do laboratorio: paciente + dia. Regra aprovada em
           -- 07/07/2026 — N exames de sangue do mesmo paciente no mesmo dia
           -- sao 1 atendimento.
           coalesce(a.paciente_id::text, a.id::text) || '|'
             || (a.inicio AT TIME ZONE 'America/Sao_Paulo')::date::text AS chave_lab,
           (a.status::text = 'realizado' OR a.executado_em IS NOT NULL) AS realizado
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
      -- Total de atendimentos realizados, com a mesma regra de laboratorio.
      -- E a soma exata das quatro fatias acima.
      count(*) FILTER (WHERE realizado AND NOT is_lab)
        + count(DISTINCT chave_lab) FILTER (WHERE realizado AND is_lab) AS total
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
      'semTipo',       a.sem_tipo,
      'total',         a.total
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
-- CONFERENCIA (opcional). Rode logo depois, dentro do sistema nao e preciso:
--
--   SELECT public.dashboard_blocos_periodo(
--     '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'::uuid,
--     date_trunc('month', now()),
--     now()
--   );
--
-- Observacao: rodando pelo SQL editor sem usuario logado a funcao devolve
-- NULO de proposito — ela so responde para quem e membro da clinica. Isso e a
-- protecao funcionando, nao erro. O numero de verdade aparece na tela.
-- ---------------------------------------------------------------------------
