DROP FUNCTION IF EXISTS public.coach_registrar_uso_ia(uuid, text, integer, integer, numeric, text);

CREATE OR REPLACE FUNCTION public.coach_registrar_uso_ia(
  _clinica_id uuid,
  _funcao text,
  _tokens_in integer DEFAULT 0,
  _tokens_out integer DEFAULT 0,
  _custo numeric DEFAULT 0,
  _atendente text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_lim_user integer;
  v_lim_clin integer;
  v_qtd_user integer;
  v_qtd_clin integer;
  v_id uuid;
BEGIN
  IF v_user IS NULL THEN
    RAISE EXCEPTION 'Sessão expirada. Entre novamente.';
  END IF;
  IF NOT has_module_access(v_user, _clinica_id, 'coach', 'read') THEN
    RAISE EXCEPTION 'Sem acesso ao Coach nesta clínica.';
  END IF;

  SELECT COALESCE(limite_ia_usuario, 60), COALESCE(limite_ia_clinica, 600)
    INTO v_lim_user, v_lim_clin
    FROM coach_config_clinica WHERE clinica_id = _clinica_id;
  v_lim_user := COALESCE(v_lim_user, 60);
  v_lim_clin := COALESCE(v_lim_clin, 600);

  SELECT count(*) INTO v_qtd_user FROM coach_uso_ia
   WHERE clinica_id = _clinica_id AND user_id = v_user
     AND created_at >= (now() AT TIME ZONE 'America/Sao_Paulo')::date::timestamptz;
  IF v_lim_user > 0 AND v_qtd_user >= v_lim_user THEN
    RAISE EXCEPTION 'Você atingiu o limite de uso da IA do Coach por hoje. Tente amanhã ou fale com a gestão.';
  END IF;

  SELECT count(*) INTO v_qtd_clin FROM coach_uso_ia
   WHERE clinica_id = _clinica_id
     AND created_at >= (now() AT TIME ZONE 'America/Sao_Paulo')::date::timestamptz;
  IF v_lim_clin > 0 AND v_qtd_clin >= v_lim_clin THEN
    RAISE EXCEPTION 'A clínica atingiu o limite de uso da IA do Coach por hoje.';
  END IF;

  INSERT INTO coach_uso_ia (clinica_id, user_id, atendente, funcao, tokens_in, tokens_out, custo_estimado)
  VALUES (_clinica_id, v_user, _atendente, _funcao, COALESCE(_tokens_in,0), COALESCE(_tokens_out,0), COALESCE(_custo,0))
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.coach_registrar_uso_ia(uuid, text, integer, integer, numeric, text) FROM public;
GRANT EXECUTE ON FUNCTION public.coach_registrar_uso_ia(uuid, text, integer, integer, numeric, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.coach_fechar_uso_ia(
  _id uuid,
  _tokens_in integer,
  _tokens_out integer,
  _custo numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE coach_uso_ia
     SET tokens_in = GREATEST(COALESCE(_tokens_in, 0), 0),
         tokens_out = GREATEST(COALESCE(_tokens_out, 0), 0),
         custo_estimado = GREATEST(COALESCE(_custo, 0), 0)
   WHERE id = _id AND user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.coach_fechar_uso_ia(uuid, integer, integer, numeric) FROM public;
GRANT EXECUTE ON FUNCTION public.coach_fechar_uso_ia(uuid, integer, integer, numeric) TO authenticated;