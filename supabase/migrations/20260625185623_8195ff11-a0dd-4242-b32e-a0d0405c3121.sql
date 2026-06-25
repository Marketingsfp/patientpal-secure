
CREATE OR REPLACE FUNCTION public.buscar_pacientes_agenda(_clinica_ids uuid[], _termo text, _limite integer DEFAULT 20)
 RETURNS TABLE(id uuid, nome text, cpf text, telefone text, data_nascimento date, clinica_id uuid, codigo_prontuario text, numero_pasta text)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_termo  text := trim(coalesce(_termo, ''));
  v_norm   text := upper(public.strip_accents(v_termo));
  v_digits text := regexp_replace(v_termo, '\D', '', 'g');
  v_limite integer := least(greatest(coalesce(_limite, 20), 1), 50);
  v_data   date := NULL;
  v_allowed uuid[];
BEGIN
  IF auth.uid() IS NULL
     OR _clinica_ids IS NULL
     OR array_length(_clinica_ids, 1) IS NULL
     OR (length(v_norm) < 2 AND length(v_digits) < 2) THEN
    RETURN;
  END IF;

  -- Valida acesso de uma só vez (sem chamar is_member dentro do JOIN)
  SELECT array_agg(DISTINCT m.clinica_id)
    INTO v_allowed
  FROM public.clinica_memberships m
  WHERE m.user_id = auth.uid()
    AND m.ativo = true
    AND m.clinica_id = ANY(_clinica_ids);

  IF v_allowed IS NULL THEN RETURN; END IF;

  -- Detecta data de nascimento
  IF v_termo ~ '^\d{4}-\d{2}-\d{2}$' THEN
    BEGIN v_data := v_termo::date; EXCEPTION WHEN OTHERS THEN v_data := NULL; END;
  ELSIF v_termo ~ '^\d{2}[/-]\d{2}[/-]\d{4}$' THEN
    BEGIN v_data := to_date(replace(v_termo, '-', '/'), 'DD/MM/YYYY'); EXCEPTION WHEN OTHERS THEN v_data := NULL; END;
  ELSIF v_digits ~ '^\d{8}$' THEN
    BEGIN v_data := to_date(v_digits, 'DDMMYYYY'); EXCEPTION WHEN OTHERS THEN v_data := NULL; END;
  END IF;

  -- Branch 1: busca por data de nascimento
  IF v_data IS NOT NULL THEN
    RETURN QUERY
    SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta
    FROM public.pacientes p
    WHERE p.ativo = true
      AND p.clinica_id = ANY(v_allowed)
      AND p.data_nascimento = v_data
    ORDER BY p.nome
    LIMIT v_limite;
    RETURN;
  END IF;

  -- Branch 2: termo é numérico (CPF/prontuário/pasta)
  IF length(v_norm) < 2 AND length(v_digits) >= 2 THEN
    RETURN QUERY
    SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta
    FROM public.pacientes p
    WHERE p.ativo = true
      AND p.clinica_id = ANY(v_allowed)
      AND (
        p.cpf_digits LIKE v_digits || '%'
        OR p.codigo_prontuario LIKE v_digits || '%'
        OR p.numero_pasta LIKE v_digits || '%'
      )
    ORDER BY p.nome
    LIMIT v_limite;
    RETURN;
  END IF;

  -- Branch 3 (padrão): busca por prefixo de nome usando idx_pacientes_nome_prefix
  RETURN QUERY
  SELECT p.id, p.nome, p.cpf, p.telefone, p.data_nascimento, p.clinica_id, p.codigo_prontuario, p.numero_pasta
  FROM public.pacientes p
  WHERE p.ativo = true
    AND p.clinica_id = ANY(v_allowed)
    AND p.nome LIKE v_norm || '%'
  ORDER BY
    CASE WHEN p.nome = v_norm THEN 0 ELSE 1 END,
    p.nome
  LIMIT v_limite;
END;
$function$;
