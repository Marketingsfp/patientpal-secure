CREATE OR REPLACE FUNCTION public.buscar_pacientes(_clinica_id uuid, _termo text, _limit integer DEFAULT 80)
RETURNS SETOF public.pacientes
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_termo text := COALESCE(trim(_termo), '');
  v_norm text;
  v_digits text;
  v_tokens text[];
  v_pattern text;
  v_data_iso date;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.clinica_memberships m
    WHERE m.clinica_id = _clinica_id
      AND m.user_id = auth.uid()
      AND m.ativo = true
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF length(v_termo) = 0 THEN
    RETURN QUERY
      SELECT *
      FROM public.pacientes
      WHERE clinica_id = _clinica_id
        AND ativo = true
      ORDER BY nome
      LIMIT LEAST(GREATEST(_limit, 1), 120);
    RETURN;
  END IF;

  v_digits := regexp_replace(v_termo, '\D', '', 'g');
  v_norm := upper(public.strip_accents(v_termo));

  IF v_termo ~ '^\d{2}/\d{2}/\d{4}$' THEN
    v_data_iso := to_date(v_termo, 'DD/MM/YYYY');
    RETURN QUERY
      SELECT *
      FROM public.pacientes
      WHERE clinica_id = _clinica_id
        AND ativo = true
        AND data_nascimento = v_data_iso
      ORDER BY nome
      LIMIT LEAST(GREATEST(_limit, 1), 120);
    RETURN;
  END IF;

  IF v_digits = v_termo AND length(v_digits) >= 3 THEN
    RETURN QUERY
      SELECT *
      FROM (
        SELECT *
        FROM public.pacientes
        WHERE clinica_id = _clinica_id
          AND ativo = true
          AND (
            cpf_digits LIKE v_digits || '%'
            OR codigo_prontuario LIKE v_digits || '%'
            OR telefone LIKE '%' || v_digits || '%'
            OR telefone2 LIKE '%' || v_digits || '%'
          )
        LIMIT LEAST(GREATEST(_limit, 1), 120) * 3
      ) p
      ORDER BY nome
      LIMIT LEAST(GREATEST(_limit, 1), 120);
    RETURN;
  END IF;

  IF v_termo LIKE '%@%' AND length(v_termo) >= 5 THEN
    RETURN QUERY
      SELECT *
      FROM (
        SELECT *
        FROM public.pacientes
        WHERE clinica_id = _clinica_id
          AND ativo = true
          AND email ILIKE '%' || v_termo || '%'
        LIMIT LEAST(GREATEST(_limit, 1), 120) * 3
      ) p
      ORDER BY nome
      LIMIT LEAST(GREATEST(_limit, 1), 120);
    RETURN;
  END IF;

  v_tokens := regexp_split_to_array(v_norm, '\s+');
  v_pattern := '%' || array_to_string(v_tokens, '%') || '%';

  RETURN QUERY
    SELECT *
    FROM (
      SELECT *
      FROM public.pacientes
      WHERE clinica_id = _clinica_id
        AND ativo = true
        AND upper(public.strip_accents(nome)) LIKE v_pattern
      LIMIT LEAST(GREATEST(_limit, 1), 120) * 4
    ) p
    ORDER BY nome
    LIMIT LEAST(GREATEST(_limit, 1), 120);
END;
$function$;