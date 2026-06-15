CREATE OR REPLACE FUNCTION public.buscar_pacientes_agenda(
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
  numero_pasta text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_termo text := trim(coalesce(_termo, ''));
  v_norm text := upper(public.strip_accents(trim(coalesce(_termo, ''))));
  v_digits text := regexp_replace(coalesce(_termo, ''), '\D', '', 'g');
  v_limite integer := least(greatest(coalesce(_limite, 20), 1), 50);
  v_data date := NULL;
  v_count integer := 0;
  v_added integer := 0;
BEGIN
  IF auth.uid() IS NULL OR array_length(_clinica_ids, 1) IS NULL OR (length(v_norm) < 3 AND length(v_digits) < 3) THEN
    RETURN;
  END IF;

  IF v_termo ~ '^\d{4}-\d{2}-\d{2}$' THEN
    v_data := v_termo::date;
  ELSIF v_termo ~ '^\d{2}[/-]\d{2}[/-]\d{4}$' THEN
    v_data := to_date(replace(v_termo, '-', '/'), 'DD/MM/YYYY');
  ELSIF v_digits ~ '^\d{8}$' THEN
    v_data := to_date(v_digits, 'DDMMYYYY');
  END IF;

  CREATE TEMP TABLE IF NOT EXISTS pg_temp._buscar_pacientes_agenda_result (
    id uuid PRIMARY KEY,
    nome text,
    cpf text,
    telefone text,
    data_nascimento date,
    clinica_id uuid,
    codigo_prontuario text,
    numero_pasta text,
    rank_ord integer
  ) ON COMMIT DROP;
  TRUNCATE pg_temp._buscar_pacientes_agenda_result;

  WITH allowed_clinicas AS (
    SELECT DISTINCT c AS clinica_id
    FROM unnest(_clinica_ids) AS c
    WHERE public.is_member(auth.uid(), c)
  )
  INSERT INTO pg_temp._buscar_pacientes_agenda_result
  SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta, 0
  FROM public.pacientes p
  JOIN allowed_clinicas ac ON ac.clinica_id = p.clinica_id
  WHERE p.ativo = true AND p.nome = v_norm
  ORDER BY p.data_nascimento NULLS LAST, p.cpf NULLS LAST, p.nome
  LIMIT v_limite
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count >= v_limite THEN
    RETURN QUERY
    SELECT r.id, r.nome, r.cpf, r.telefone, r.data_nascimento, r.clinica_id, r.codigo_prontuario, r.numero_pasta
    FROM pg_temp._buscar_pacientes_agenda_result r
    ORDER BY r.rank_ord, r.nome, r.data_nascimento NULLS LAST, r.cpf NULLS LAST
    LIMIT v_limite;
    RETURN;
  END IF;

  WITH allowed_clinicas AS (
    SELECT DISTINCT c AS clinica_id
    FROM unnest(_clinica_ids) AS c
    WHERE public.is_member(auth.uid(), c)
  )
  INSERT INTO pg_temp._buscar_pacientes_agenda_result
  SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta, 1
  FROM public.pacientes p
  JOIN allowed_clinicas ac ON ac.clinica_id = p.clinica_id
  WHERE p.ativo = true AND p.nome LIKE v_norm || '%'
  ORDER BY p.nome, p.data_nascimento NULLS LAST, p.cpf NULLS LAST
  LIMIT (v_limite - v_count)
  ON CONFLICT (id) DO NOTHING;

  GET DIAGNOSTICS v_added = ROW_COUNT;
  v_count := v_count + v_added;
  IF v_count >= v_limite OR v_count > 0 THEN
    RETURN QUERY
    SELECT r.id, r.nome, r.cpf, r.telefone, r.data_nascimento, r.clinica_id, r.codigo_prontuario, r.numero_pasta
    FROM pg_temp._buscar_pacientes_agenda_result r
    ORDER BY r.rank_ord, r.nome, r.data_nascimento NULLS LAST, r.cpf NULLS LAST
    LIMIT v_limite;
    RETURN;
  END IF;

  IF length(v_digits) >= 3 THEN
    WITH allowed_clinicas AS (
      SELECT DISTINCT c AS clinica_id
      FROM unnest(_clinica_ids) AS c
      WHERE public.is_member(auth.uid(), c)
    )
    INSERT INTO pg_temp._buscar_pacientes_agenda_result
    SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta, 3
    FROM public.pacientes p
    JOIN allowed_clinicas ac ON ac.clinica_id = p.clinica_id
    WHERE p.ativo = true
      AND (
        p.cpf_digits LIKE v_digits || '%'
        OR p.codigo_prontuario LIKE v_digits || '%'
        OR p.numero_pasta LIKE v_digits || '%'
      )
    ORDER BY p.nome
    LIMIT v_limite
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS v_added = ROW_COUNT;
    v_count := v_count + v_added;
  END IF;

  IF v_data IS NOT NULL THEN
    WITH allowed_clinicas AS (
      SELECT DISTINCT c AS clinica_id
      FROM unnest(_clinica_ids) AS c
      WHERE public.is_member(auth.uid(), c)
    )
    INSERT INTO pg_temp._buscar_pacientes_agenda_result
    SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta, 4
    FROM public.pacientes p
    JOIN allowed_clinicas ac ON ac.clinica_id = p.clinica_id
    WHERE p.ativo = true AND p.data_nascimento = v_data
    ORDER BY p.nome
    LIMIT v_limite
    ON CONFLICT (id) DO NOTHING;

    GET DIAGNOSTICS v_added = ROW_COUNT;
    v_count := v_count + v_added;
  END IF;

  IF v_count = 0 AND length(v_norm) >= 6 THEN
    WITH allowed_clinicas AS (
      SELECT DISTINCT c AS clinica_id
      FROM unnest(_clinica_ids) AS c
      WHERE public.is_member(auth.uid(), c)
    )
    INSERT INTO pg_temp._buscar_pacientes_agenda_result
    SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta, 2
    FROM public.pacientes p
    JOIN allowed_clinicas ac ON ac.clinica_id = p.clinica_id
    WHERE p.ativo = true AND p.nome ILIKE '%' || v_norm || '%'
    ORDER BY p.nome
    LIMIT v_limite
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN QUERY
  SELECT r.id, r.nome, r.cpf, r.telefone, r.data_nascimento, r.clinica_id, r.codigo_prontuario, r.numero_pasta
  FROM pg_temp._buscar_pacientes_agenda_result r
  ORDER BY r.rank_ord, r.nome, r.data_nascimento NULLS LAST, r.cpf NULLS LAST
  LIMIT v_limite;
END;
$$;

REVOKE ALL ON FUNCTION public.buscar_pacientes_agenda(uuid[], text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buscar_pacientes_agenda(uuid[], text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.buscar_pacientes_agenda(uuid[], text, integer) TO authenticated;