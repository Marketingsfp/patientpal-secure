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
BEGIN
  IF array_length(_clinica_ids, 1) IS NULL OR (length(v_norm) < 3 AND length(v_digits) < 3) THEN
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
  ),
  encontrados AS (
    (SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta,
            0 AS rank_ord
     FROM public.pacientes p
     JOIN allowed_clinicas ac ON ac.clinica_id = p.clinica_id
     WHERE p.ativo = true AND p.nome = v_norm
     LIMIT v_limite)

    UNION ALL

    (SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta,
            1 AS rank_ord
     FROM public.pacientes p
     JOIN allowed_clinicas ac ON ac.clinica_id = p.clinica_id
     WHERE p.ativo = true AND p.nome LIKE v_norm || '%'
     ORDER BY p.nome
     LIMIT v_limite)

    UNION ALL

    (SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta,
            2 AS rank_ord
     FROM public.pacientes p
     JOIN allowed_clinicas ac ON ac.clinica_id = p.clinica_id
     WHERE p.ativo = true AND length(v_norm) >= 6 AND p.nome ILIKE '%' || v_norm || '%'
     LIMIT v_limite)

    UNION ALL

    (SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta,
            3 AS rank_ord
     FROM public.pacientes p
     JOIN allowed_clinicas ac ON ac.clinica_id = p.clinica_id
     WHERE p.ativo = true
       AND length(v_digits) >= 3
       AND (
         p.cpf_digits LIKE v_digits || '%'
         OR p.codigo_prontuario LIKE v_digits || '%'
         OR p.numero_pasta LIKE v_digits || '%'
       )
     LIMIT v_limite)

    UNION ALL

    (SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta,
            4 AS rank_ord
     FROM public.pacientes p
     JOIN allowed_clinicas ac ON ac.clinica_id = p.clinica_id
     WHERE p.ativo = true AND v_data IS NOT NULL AND p.data_nascimento = v_data
     LIMIT v_limite)
  ),
  dedup AS (
    SELECT DISTINCT ON (e.id)
      e.id, e.nome, e.cpf, e.telefone, e.data_nascimento, e.clinica_id, e.codigo_prontuario, e.numero_pasta, e.rank_ord
    FROM encontrados e
    ORDER BY e.id, e.rank_ord, e.nome
  )
  SELECT d.id, d.nome, d.cpf, d.telefone, d.data_nascimento, d.clinica_id, d.codigo_prontuario, d.numero_pasta
  FROM dedup d
  ORDER BY d.rank_ord, d.nome
  LIMIT v_limite;
END;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_pacientes_agenda(uuid[], text, integer) TO authenticated;