
CREATE OR REPLACE FUNCTION public.emitir_senha_publica(
  _clinica_id uuid,
  _tipo public.tipo_senha
) RETURNS public.senhas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _proximo integer;
  _prefixo text;
  _row public.senhas;
  _tem_token boolean;
BEGIN
  -- Só clínicas com token público (habilitadas para totem/painel) podem emitir sem login.
  SELECT (token_publico IS NOT NULL) INTO _tem_token
  FROM public.clinicas WHERE id = _clinica_id;

  IF NOT COALESCE(_tem_token, false) THEN
    RAISE EXCEPTION 'Totem público não habilitado para esta clínica';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(_clinica_id::text || ':' || _tipo::text || ':' || _hoje::text)
  );

  SELECT COALESCE(MAX(numero), 0) + 1 INTO _proximo
  FROM public.senhas
  WHERE clinica_id = _clinica_id AND data_dia = _hoje AND tipo = _tipo;

  _prefixo := _tipo::text;

  INSERT INTO public.senhas
    (clinica_id, tipo, numero, codigo, paciente_id, identificado_por_facial, data_dia)
  VALUES
    (_clinica_id, _tipo, _proximo, _prefixo || '-' || lpad(_proximo::text, 3, '0'),
     NULL, false, _hoje)
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE ALL ON FUNCTION public.emitir_senha_publica(uuid, public.tipo_senha) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.emitir_senha_publica(uuid, public.tipo_senha) TO anon, authenticated;
