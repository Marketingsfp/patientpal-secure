DROP FUNCTION IF EXISTS public.buscar_pacientes_global(uuid[], text, integer);

CREATE OR REPLACE FUNCTION public.buscar_pacientes_global(_clinica_ids uuid[], _termo text, _limite integer DEFAULT 20)
 RETURNS TABLE(id uuid, nome text, cpf text, telefone text, data_nascimento date, clinica_id uuid, codigo_prontuario text, codigo_prontuario_anterior text, numero_pasta text, email text, associado_convenio text, associado_tipo text, ultima_consulta date, cadastro_incompleto boolean, match_score integer, match_reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_termo   text := trim(coalesce(_termo, ''));
  v_norm    text := upper(public.strip_accents(trim(coalesce(_termo, ''))));
  v_digits  text := regexp_replace(trim(coalesce(_termo, '')), '\D', '', 'g');
  v_limite  int  := least(greatest(coalesce(_limite, 20), 1), 50);
  v_data    date := null;
  v_dia     text := null;
  v_mes     text := null;
  v_allowed uuid[];
  v_is_num  boolean;
  v_is_text boolean;
BEGIN
  IF auth.uid() IS NULL
     OR _clinica_ids IS NULL
     OR array_length(_clinica_ids, 1) IS NULL
     OR (length(v_norm) < 2 AND length(v_digits) < 2) THEN
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT m.clinica_id) INTO v_allowed
    FROM public.clinica_memberships m
   WHERE m.user_id = auth.uid()
     AND m.ativo
     AND m.clinica_id = ANY(_clinica_ids);

  IF v_allowed IS NULL THEN
    RETURN;
  END IF;

  v_is_num  := (v_termo ~ '^[\d\s\.\-\/\(\)\+]+$') AND length(v_digits) >= 2;
  v_is_text := v_termo ~ '[A-Za-zÀ-ÿ]';

  IF v_termo ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN v_data := v_termo::date; EXCEPTION WHEN OTHERS THEN v_data := null; END;
  ELSIF v_termo ~ '^\d{2}[\/\-]\d{2}[\/\-]\d{4}$' THEN
    BEGIN v_data := to_date(replace(v_termo, '-', '/'), 'DD/MM/YYYY'); EXCEPTION WHEN OTHERS THEN v_data := null; END;
  ELSIF length(v_digits) = 8 AND v_is_num THEN
    BEGIN v_data := to_date(v_digits, 'DDMMYYYY'); EXCEPTION WHEN OTHERS THEN v_data := null; END;
  END IF;

  IF v_termo ~ '^\d{1,2}[\/\-]\d{1,2}$' THEN
    v_dia := lpad(split_part(replace(v_termo, '-', '/'), '/', 1), 2, '0');
    v_mes := lpad(split_part(replace(v_termo, '-', '/'), '/', 2), 2, '0');
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS _busca_cand (
    pid uuid, score int, reason text
  ) ON COMMIT DROP;
  TRUNCATE _busca_cand;

  IF v_is_num THEN
    IF length(v_digits) = 11 THEN
      INSERT INTO _busca_cand
      SELECT p.id, 100, 'CPF exato'
        FROM public.pacientes p
       WHERE p.clinica_id = ANY(v_allowed)
         AND p.cpf_digits = v_digits
         AND p.ativo
       LIMIT v_limite;
    END IF;

    INSERT INTO _busca_cand
    SELECT p.id, 95, 'Prontuário exato'
      FROM public.pacientes p
     WHERE p.clinica_id = ANY(v_allowed)
       AND p.codigo_prontuario = v_digits
       AND p.ativo
     LIMIT v_limite;

    INSERT INTO _busca_cand
    SELECT p.id, 90, 'Código antigo exato'
      FROM public.pacientes p
     WHERE p.clinica_id = ANY(v_allowed)
       AND p.codigo_prontuario_anterior = v_digits
       AND p.ativo
     LIMIT v_limite;

    INSERT INTO _busca_cand
    SELECT p.id, 88, 'Pasta exata'
      FROM public.pacientes p
     WHERE p.clinica_id = ANY(v_allowed)
       AND p.numero_pasta = v_digits
       AND p.ativo
     LIMIT v_limite;

    IF length(v_digits) BETWEEN 8 AND 13 THEN
      INSERT INTO _busca_cand
      SELECT p.id, 85, 'Telefone'
        FROM public.pacientes p
       WHERE p.clinica_id = ANY(v_allowed)
         AND p.ativo
         AND (
           regexp_replace(coalesce(p.telefone, ''),  '\D', '', 'g') = v_digits
           OR regexp_replace(coalesce(p.telefone2, ''), '\D', '', 'g') = v_digits
           OR regexp_replace(coalesce(p.telefone, ''),  '\D', '', 'g') LIKE v_digits || '%'
           OR regexp_replace(coalesce(p.telefone2, ''), '\D', '', 'g') LIKE v_digits || '%'
         )
       LIMIT v_limite;
    END IF;

    IF length(v_digits) BETWEEN 3 AND 10 THEN
      INSERT INTO _busca_cand
      SELECT p.id, 20, 'CPF parcial'
        FROM public.pacientes p
       WHERE p.clinica_id = ANY(v_allowed)
         AND p.cpf_digits <> ''
         AND p.cpf_digits LIKE v_digits || '%'
         AND p.ativo
       LIMIT v_limite;
    END IF;
  END IF;

  IF v_data IS NOT NULL THEN
    INSERT INTO _busca_cand
    SELECT p.id, 82, 'Data de nascimento'
      FROM public.pacientes p
     WHERE p.clinica_id = ANY(v_allowed)
       AND p.data_nascimento = v_data
       AND p.ativo
     LIMIT v_limite;
  ELSIF v_dia IS NOT NULL AND v_mes IS NOT NULL THEN
    INSERT INTO _busca_cand
    SELECT p.id, 78, 'Nascimento dia/mês'
      FROM public.pacientes p
     WHERE p.clinica_id = ANY(v_allowed)
       AND p.ativo
       AND to_char(p.data_nascimento, 'DD') = v_dia
       AND to_char(p.data_nascimento, 'MM') = v_mes
     LIMIT v_limite;
  END IF;

  IF v_is_text AND length(v_norm) >= 2 THEN
    INSERT INTO _busca_cand
    SELECT p.id, 60, 'Nome começa com'
      FROM public.pacientes p
     WHERE p.clinica_id = ANY(v_allowed)
       AND p.ativo
       AND upper(public.strip_accents(p.nome)) LIKE v_norm || '%'
     LIMIT v_limite;

    IF length(v_norm) >= 3 THEN
      INSERT INTO _busca_cand
      SELECT p.id, 40, 'Nome contém'
        FROM public.pacientes p
       WHERE p.clinica_id = ANY(v_allowed)
         AND p.ativo
         AND upper(public.strip_accents(p.nome)) LIKE '%' || v_norm || '%'
       LIMIT v_limite;
    END IF;
  END IF;

  RETURN QUERY
  WITH best AS (
    SELECT c.pid AS pid,
           MAX(c.score) AS score,
           (ARRAY_AGG(c.reason ORDER BY c.score DESC))[1] AS reason
      FROM _busca_cand c
     GROUP BY c.pid
     ORDER BY MAX(c.score) DESC
     LIMIT v_limite
  ),
  conv_all AS (
    -- Titular
    SELECT ca.paciente_id AS pid,
           cv.nome        AS convenio_nome,
           'titular'::text AS tipo,
           ca.created_at  AS ord
      FROM public.contratos_assinatura ca
      LEFT JOIN public.cb_convenios cv ON cv.id = ca.convenio_id
     WHERE ca.paciente_id IN (SELECT b.pid FROM best b)
       AND ca.status = 'ativo'
    UNION ALL
    -- Dependente
    SELECT cd.paciente_id AS pid,
           cv.nome        AS convenio_nome,
           'dependente'::text AS tipo,
           ca.created_at  AS ord
      FROM public.contrato_dependentes cd
      JOIN public.contratos_assinatura ca ON ca.id = cd.contrato_id
      LEFT JOIN public.cb_convenios cv ON cv.id = ca.convenio_id
     WHERE cd.paciente_id IN (SELECT b.pid FROM best b)
       AND cd.ativo
       AND ca.status = 'ativo'
  ),
  conv AS (
    SELECT DISTINCT ON (pid)
           pid, convenio_nome, tipo
      FROM conv_all
     -- Prioriza titular em cima de dependente; depois mais recente.
     ORDER BY pid, CASE WHEN tipo = 'titular' THEN 0 ELSE 1 END, ord DESC
  ),
  ult AS (
    SELECT a.paciente_id, MAX(a.inicio::date) AS ultima
      FROM public.agendamentos a
     WHERE a.paciente_id IN (SELECT b.pid FROM best b)
       AND a.status = 'realizado'
     GROUP BY a.paciente_id
  )
  SELECT
    p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id,
    p.codigo_prontuario, p.codigo_prontuario_anterior, p.numero_pasta, p.email,
    cn.convenio_nome AS associado_convenio,
    cn.tipo          AS associado_tipo,
    u.ultima         AS ultima_consulta,
    (p.telefone IS NULL OR p.cpf IS NULL OR p.data_nascimento IS NULL) AS cadastro_incompleto,
    b.score AS match_score,
    b.reason AS match_reason
    FROM best b
    JOIN public.pacientes p ON p.id = b.pid
    LEFT JOIN conv cn ON cn.pid = b.pid
    LEFT JOIN ult u ON u.paciente_id = b.pid
   ORDER BY b.score DESC, upper(public.strip_accents(p.nome)) ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.buscar_pacientes_global(uuid[], text, integer) TO authenticated;