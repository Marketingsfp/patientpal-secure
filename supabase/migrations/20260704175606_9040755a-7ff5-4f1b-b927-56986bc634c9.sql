
CREATE OR REPLACE FUNCTION public.buscar_pacientes_global(
  _clinica_ids uuid[],
  _termo text,
  _limite integer DEFAULT 20
)
RETURNS TABLE (
  id uuid,
  nome text,
  cpf text,
  telefone text,
  data_nascimento date,
  clinica_id uuid,
  codigo_prontuario text,
  codigo_prontuario_anterior text,
  numero_pasta text,
  email text,
  associado_convenio text,
  ultima_consulta date,
  cadastro_incompleto boolean,
  match_score integer,
  match_reason text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_termo   text := trim(coalesce(_termo, ''));
  v_norm    text := upper(public.strip_accents(v_termo));
  v_digits  text := regexp_replace(v_termo, '\D', '', 'g');
  v_limite  int  := least(greatest(coalesce(_limite, 20), 1), 50);
  v_data    date := null;
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
   WHERE m.user_id = auth.uid() AND m.ativo
     AND m.clinica_id = ANY(_clinica_ids);
  IF v_allowed IS NULL THEN RETURN; END IF;

  v_is_num  := (v_termo ~ '^[\d\s\.\-\/\(\)\+]+$') AND length(v_digits) >= 2;
  v_is_text := v_termo ~ '[A-Za-zÀ-ÿ]';

  IF v_termo ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN v_data := v_termo::date; EXCEPTION WHEN OTHERS THEN v_data := null; END;
  ELSIF v_termo ~ '^\d{2}[\/\-]\d{2}[\/\-]\d{4}$' THEN
    BEGIN v_data := to_date(replace(v_termo, '-', '/'), 'DD/MM/YYYY'); EXCEPTION WHEN OTHERS THEN v_data := null; END;
  ELSIF length(v_digits) = 8 AND v_is_num THEN
    BEGIN v_data := to_date(v_digits, 'DDMMYYYY'); EXCEPTION WHEN OTHERS THEN v_data := null; END;
  END IF;

  -- Coleta candidatos em uma temp result set (via UNION ALL condicional
  -- executado somente para o ramo aplicável)
  CREATE TEMP TABLE IF NOT EXISTS _busca_cand (
    id uuid, score int, reason text
  ) ON COMMIT DROP;
  TRUNCATE _busca_cand;

  IF v_is_num THEN
    -- CPF exato
    IF length(v_digits) = 11 THEN
      INSERT INTO _busca_cand
      SELECT p.id, 100, 'CPF exato' FROM public.pacientes p
       WHERE p.ativo AND p.clinica_id = ANY(v_allowed) AND p.cpf_digits = v_digits
       LIMIT v_limite;
    END IF;

    -- Prontuário exato
    INSERT INTO _busca_cand
    SELECT p.id, 95, 'Prontuário exato' FROM public.pacientes p
     WHERE p.ativo AND p.clinica_id = ANY(v_allowed) AND p.codigo_prontuario = v_digits
     LIMIT v_limite;

    -- Código antigo exato
    INSERT INTO _busca_cand
    SELECT p.id, 90, 'Código antigo exato' FROM public.pacientes p
     WHERE p.ativo AND p.clinica_id = ANY(v_allowed) AND p.codigo_prontuario_anterior = v_digits
     LIMIT v_limite;

    -- Pasta exata
    INSERT INTO _busca_cand
    SELECT p.id, 88, 'Pasta exata' FROM public.pacientes p
     WHERE p.ativo AND p.clinica_id = ANY(v_allowed) AND p.numero_pasta = v_digits
     LIMIT v_limite;

    -- Telefone (sufixo — matches "74035853" contra "21740358530")
    IF length(v_digits) BETWEEN 8 AND 11 THEN
      INSERT INTO _busca_cand
      SELECT p.id, 85, 'Telefone' FROM public.pacientes p
       WHERE p.ativo AND p.clinica_id = ANY(v_allowed)
         AND (p.telefone LIKE '%' || v_digits OR p.telefone2 LIKE '%' || v_digits)
       LIMIT v_limite;
    END IF;

    -- CPF parcial
    IF length(v_digits) BETWEEN 3 AND 10 THEN
      INSERT INTO _busca_cand
      SELECT p.id, 20, 'Parcial' FROM public.pacientes p
       WHERE p.ativo AND p.clinica_id = ANY(v_allowed)
         AND p.cpf_digits LIKE v_digits || '%'
       LIMIT v_limite;
    END IF;
  END IF;

  IF v_data IS NOT NULL THEN
    INSERT INTO _busca_cand
    SELECT p.id, 82, 'Data de nascimento' FROM public.pacientes p
     WHERE p.ativo AND p.clinica_id = ANY(v_allowed) AND p.data_nascimento = v_data
     LIMIT v_limite;
  END IF;

  IF v_is_text AND length(v_norm) >= 2 THEN
    -- Nome começa com
    INSERT INTO _busca_cand
    SELECT p.id, 60, 'Nome começa com' FROM public.pacientes p
     WHERE p.ativo AND p.clinica_id = ANY(v_allowed)
       AND upper(public.strip_accents(p.nome)) LIKE v_norm || '%'
     LIMIT v_limite;

    -- Nome contém (fallback)
    IF length(v_norm) >= 3 THEN
      INSERT INTO _busca_cand
      SELECT p.id, 40, 'Nome contém' FROM public.pacientes p
       WHERE p.ativo AND p.clinica_id = ANY(v_allowed)
         AND upper(public.strip_accents(p.nome)) LIKE '%' || v_norm || '%'
       LIMIT v_limite;
    END IF;
  END IF;

  RETURN QUERY
  WITH best AS (
    SELECT c.id, MAX(c.score) AS score,
           (ARRAY_AGG(c.reason ORDER BY c.score DESC))[1] AS reason
      FROM _busca_cand c
     GROUP BY c.id
     ORDER BY MAX(c.score) DESC
     LIMIT v_limite
  ),
  conv AS (
    SELECT DISTINCT ON (c.paciente_id)
           c.paciente_id, cv.nome AS convenio_nome
      FROM public.contratos_assinatura c
      LEFT JOIN public.cb_convenios cv ON cv.id = c.convenio_id
     WHERE c.paciente_id IN (SELECT id FROM best) AND c.status = 'ativo'
     ORDER BY c.paciente_id, c.created_at DESC
  ),
  ult AS (
    SELECT a.paciente_id, MAX(a.data_hora::date) AS ultima
      FROM public.agendamentos a
     WHERE a.paciente_id IN (SELECT id FROM best)
       AND a.status IN ('atendido','concluido','realizado','finalizado')
     GROUP BY a.paciente_id
  )
  SELECT
    p.id, p.nome, p.cpf, p.telefone, p.data_nascimento,
    p.clinica_id, p.codigo_prontuario, p.codigo_prontuario_anterior,
    p.numero_pasta, p.email,
    c.convenio_nome AS associado_convenio,
    u.ultima AS ultima_consulta,
    (p.telefone IS NULL OR p.cpf IS NULL OR p.data_nascimento IS NULL) AS cadastro_incompleto,
    b.score AS match_score,
    b.reason AS match_reason
    FROM best b
    JOIN public.pacientes p ON p.id = b.id
    LEFT JOIN conv c ON c.paciente_id = b.id
    LEFT JOIN ult  u ON u.paciente_id = b.id
   ORDER BY b.score DESC, upper(public.strip_accents(p.nome)) ASC;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.buscar_pacientes_global(uuid[], text, integer) TO authenticated;
