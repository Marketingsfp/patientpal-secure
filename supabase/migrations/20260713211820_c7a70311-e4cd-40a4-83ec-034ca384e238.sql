
-- 1) Renomeia o valor do enum
ALTER TYPE public.tipo_senha RENAME VALUE 'E' TO 'C';

-- 2) Atualiza códigos já emitidos
UPDATE public.senhas
SET codigo = 'C' || substring(codigo from 2)
WHERE codigo LIKE 'E%';

-- 3) Recria função de chamada com o novo literal
CREATE OR REPLACE FUNCTION public.chamar_proxima_senha_tipo(_clinica_id uuid, _guiche text, _tipo tipo_senha DEFAULT NULL::tipo_senha)
 RETURNS senhas
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
        WHEN 'C' THEN 1
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
$function$;
