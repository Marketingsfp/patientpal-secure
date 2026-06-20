
CREATE OR REPLACE FUNCTION public.buscar_pacientes_agenda(_clinica_ids uuid[], _termo text, _limite integer DEFAULT 20)
 RETURNS TABLE(id uuid, nome text, cpf text, telefone text, data_nascimento date, clinica_id uuid, codigo_prontuario text, numero_pasta text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_termo text := trim(coalesce(_termo, ''));
  v_norm  text := upper(public.strip_accents(v_termo));
  v_digits text := regexp_replace(v_termo, '\D', '', 'g');
  v_limite integer := least(greatest(coalesce(_limite, 20), 1), 50);
  v_data date := NULL;
BEGIN
  IF auth.uid() IS NULL
     OR array_length(_clinica_ids, 1) IS NULL
     OR (length(v_norm) < 2 AND length(v_digits) < 2) THEN
    RETURN;
  END IF;

  IF v_termo ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN v_data := v_termo::date; EXCEPTION WHEN OTHERS THEN v_data := NULL; END;
  ELSIF v_termo ~ '^\d{2}[/-]\d{2}[/-]\d{4}$' THEN
    BEGIN v_data := to_date(replace(v_termo, '-', '/'), 'DD/MM/YYYY'); EXCEPTION WHEN OTHERS THEN v_data := NULL; END;
  ELSIF v_digits ~ '^\d{8}$' THEN
    BEGIN v_data := to_date(v_digits, 'DDMMYYYY'); EXCEPTION WHEN OTHERS THEN v_data := NULL; END;
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
  WHERE p.ativo = true
    AND (
      (length(v_norm) >= 2 AND p.nome LIKE v_norm || '%')
      OR (v_data IS NOT NULL AND p.data_nascimento = v_data)
      OR (length(v_digits) >= 3 AND (
            p.cpf_digits LIKE v_digits || '%'
            OR p.codigo_prontuario LIKE v_digits || '%'
            OR p.numero_pasta LIKE v_digits || '%'
          ))
    )
  ORDER BY
    CASE WHEN length(v_norm) >= 2 AND p.nome = v_norm THEN 0 ELSE 1 END,
    p.nome
  LIMIT v_limite;
END;
$function$;
