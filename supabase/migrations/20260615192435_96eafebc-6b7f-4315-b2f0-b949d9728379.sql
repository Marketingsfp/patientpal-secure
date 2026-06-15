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

  RETURN QUERY
  WITH allowed_clinicas AS (
    SELECT DISTINCT c AS clinica_id
    FROM unnest(_clinica_ids) AS c
    WHERE public.is_member(auth.uid(), c)
  )
  SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta
  FROM public.pacientes p
  JOIN allowed_clinicas ac ON ac.clinica_id = p.clinica_id
  WHERE p.ativo = true AND p.nome = v_norm
  ORDER BY p.data_nascimento NULLS LAST, p.cpf NULLS LAST, p.nome
  LIMIT v_limite;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH allowed_clinicas AS (
    SELECT DISTINCT c AS clinica_id
    FROM unnest(_clinica_ids) AS c
    WHERE public.is_member(auth.uid(), c)
  )
  SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta
  FROM public.pacientes p
  JOIN allowed_clinicas ac ON ac.clinica_id = p.clinica_id
  WHERE p.ativo = true AND p.nome LIKE v_norm || '%'
  ORDER BY p.nome, p.data_nascimento NULLS LAST, p.cpf NULLS LAST
  LIMIT v_limite;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count > 0 THEN
    RETURN;
  END IF;

  IF v_data IS NOT NULL THEN
    RETURN QUERY
    WITH allowed_clinicas AS (
      SELECT DISTINCT c AS clinica_id
      FROM unnest(_clinica_ids) AS c
      WHERE public.is_member(auth.uid(), c)
    )
    SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta
    FROM public.pacientes p
    JOIN allowed_clinicas ac ON ac.clinica_id = p.clinica_id
    WHERE p.ativo = true AND p.data_nascimento = v_data
    ORDER BY p.nome
    LIMIT v_limite;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RETURN;
    END IF;
  END IF;

  IF length(v_digits) >= 3 THEN
    RETURN QUERY
    WITH allowed_clinicas AS (
      SELECT DISTINCT c AS clinica_id
      FROM unnest(_clinica_ids) AS c
      WHERE public.is_member(auth.uid(), c)
    )
    SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta
    FROM public.pacientes p
    JOIN allowed_clinicas ac ON ac.clinica_id = p.clinica_id
    WHERE p.ativo = true
      AND (
        p.cpf_digits LIKE v_digits || '%'
        OR p.codigo_prontuario LIKE v_digits || '%'
        OR p.numero_pasta LIKE v_digits || '%'
      )
    ORDER BY p.nome
    LIMIT v_limite;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      RETURN;
    END IF;
  END IF;

  IF length(v_norm) >= 6 THEN
    RETURN QUERY
    WITH allowed_clinicas AS (
      SELECT DISTINCT c AS clinica_id
      FROM unnest(_clinica_ids) AS c
      WHERE public.is_member(auth.uid(), c)
    )
    SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta
    FROM public.pacientes p
    JOIN allowed_clinicas ac ON ac.clinica_id = p.clinica_id
    WHERE p.ativo = true AND p.nome ILIKE '%' || v_norm || '%'
    ORDER BY p.nome
    LIMIT v_limite;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.buscar_pacientes_agenda(uuid[], text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buscar_pacientes_agenda(uuid[], text, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.buscar_pacientes_agenda(uuid[], text, integer) TO authenticated;