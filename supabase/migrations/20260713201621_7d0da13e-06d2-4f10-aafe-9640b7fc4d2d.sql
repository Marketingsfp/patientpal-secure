
-- 1) chamar_proxima_senha com filtro opcional de tipo
CREATE OR REPLACE FUNCTION public.chamar_proxima_senha_tipo(
  _clinica_id uuid,
  _guiche text,
  _tipo public.tipo_senha DEFAULT NULL
) RETURNS public.senhas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  _row public.senhas;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.is_member(_user_id, _clinica_id) THEN
    RAISE EXCEPTION 'Sem acesso à clínica';
  END IF;
  IF _guiche IS NULL OR length(trim(_guiche)) = 0 OR length(_guiche) > 30 THEN
    RAISE EXCEPTION 'Guichê inválido';
  END IF;

  UPDATE public.senhas
  SET status = 'chamada',
      chamada_em = now(),
      chamada_por = _user_id,
      guiche = _guiche
  WHERE id = (
    SELECT id FROM public.senhas
    WHERE clinica_id = _clinica_id
      AND data_dia = _hoje
      AND status = 'emitida'
      AND (_tipo IS NULL OR tipo = _tipo)
    ORDER BY CASE tipo
        WHEN 'E' THEN 1
        WHEN 'P' THEN 2
        WHEN 'R' THEN 3
        WHEN 'N' THEN 4
      END,
      emitida_em
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING * INTO _row;

  RETURN _row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.chamar_proxima_senha_tipo(uuid, text, public.tipo_senha) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.chamar_proxima_senha_tipo(uuid, text, public.tipo_senha) TO authenticated;

-- 2) rechamar_senha: bumpa chamada_em para o painel falar de novo
CREATE OR REPLACE FUNCTION public.rechamar_senha(
  _id uuid
) RETURNS public.senhas
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid := auth.uid();
  _row public.senhas;
  _clinica_id uuid;
BEGIN
  IF _user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT clinica_id INTO _clinica_id FROM public.senhas WHERE id = _id;
  IF _clinica_id IS NULL THEN RAISE EXCEPTION 'Senha não encontrada'; END IF;
  IF NOT public.is_member(_user_id, _clinica_id) THEN
    RAISE EXCEPTION 'Sem acesso à clínica';
  END IF;

  UPDATE public.senhas
  SET chamada_em = now(),
      chamada_por = _user_id,
      status = 'chamada'
  WHERE id = _id
    AND status IN ('chamada','atendida')
  RETURNING * INTO _row;

  IF _row.id IS NULL THEN
    RAISE EXCEPTION 'Senha não pode ser rechamada';
  END IF;

  RETURN _row;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.rechamar_senha(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rechamar_senha(uuid) TO authenticated;
