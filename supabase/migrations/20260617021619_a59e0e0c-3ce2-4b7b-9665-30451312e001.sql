
-- RPC otimizada de busca de pacientes com early-exit por tipo de termo
CREATE OR REPLACE FUNCTION public.buscar_pacientes(
  _clinica_id uuid,
  _termo text,
  _limit int DEFAULT 80
)
RETURNS SETOF public.pacientes
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_termo text := COALESCE(trim(_termo), '');
  v_norm  text;
  v_digits text;
  v_tokens text[];
  v_pattern text;
  v_data_iso date;
BEGIN
  -- Autorização: usuário precisa ser membro da clínica
  IF NOT EXISTS (
    SELECT 1 FROM public.clinica_memberships m
    WHERE m.clinica_id = _clinica_id AND m.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF length(v_termo) = 0 THEN
    RETURN QUERY
      SELECT * FROM public.pacientes
      WHERE clinica_id = _clinica_id
      ORDER BY codigo_prontuario ASC NULLS LAST
      LIMIT _limit;
    RETURN;
  END IF;

  v_digits := regexp_replace(v_termo, '\D', '', 'g');
  v_norm := upper(unaccent(v_termo));

  -- Data dd/mm/aaaa → busca exata por data_nascimento
  IF v_termo ~ '^\d{2}/\d{2}/\d{4}$' THEN
    v_data_iso := to_date(v_termo, 'DD/MM/YYYY');
    RETURN QUERY
      SELECT * FROM public.pacientes
      WHERE clinica_id = _clinica_id AND ativo = true
        AND data_nascimento = v_data_iso
      ORDER BY nome
      LIMIT _limit;
    RETURN;
  END IF;

  -- Termo puramente numérico: tenta CPF, prontuário e telefone (sem nome)
  IF v_digits = v_termo AND length(v_digits) >= 3 THEN
    RETURN QUERY
      SELECT * FROM public.pacientes
      WHERE clinica_id = _clinica_id AND ativo = true
        AND (
          cpf LIKE v_digits || '%'
          OR codigo_prontuario LIKE v_digits || '%'
          OR telefone LIKE '%' || v_digits || '%'
        )
      ORDER BY nome
      LIMIT _limit;
    RETURN;
  END IF;

  -- E-mail
  IF v_termo LIKE '%@%' AND length(v_termo) >= 5 THEN
    RETURN QUERY
      SELECT * FROM public.pacientes
      WHERE clinica_id = _clinica_id AND ativo = true
        AND email ILIKE '%' || v_termo || '%'
      ORDER BY nome
      LIMIT _limit;
    RETURN;
  END IF;

  -- Nome (com tokens) — usa trigram via LIKE
  v_tokens := regexp_split_to_array(v_norm, '\s+');
  v_pattern := '%' || array_to_string(v_tokens, '%') || '%';
  RETURN QUERY
    SELECT * FROM public.pacientes
    WHERE clinica_id = _clinica_id AND ativo = true
      AND nome LIKE v_pattern
    ORDER BY nome
    LIMIT _limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.buscar_pacientes(uuid, text, int) TO authenticated;
