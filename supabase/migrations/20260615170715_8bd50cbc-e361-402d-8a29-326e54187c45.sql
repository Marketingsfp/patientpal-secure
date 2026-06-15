
CREATE OR REPLACE FUNCTION public._do_fix_prontuario_oldest_mj()
RETURNS TABLE(atualizados integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  _clin uuid := '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'::uuid;
  _n integer;
BEGIN
  SET LOCAL statement_timeout = 0;

  WITH src AS (
    SELECT id,
           codigo_prontuario_anterior,
           prontuarios_anteriores,
           (
             SELECT MIN(x::bigint)::text
             FROM regexp_split_to_table(prontuarios_anteriores, '\s*,\s*') AS x
             WHERE x ~ '^[0-9]+$'
           ) AS oldest
    FROM public.pacientes
    WHERE clinica_id = _clin
      AND prontuarios_anteriores IS NOT NULL
      AND prontuarios_anteriores <> ''
  )
  UPDATE public.pacientes p
     SET codigo_prontuario_anterior = src.oldest,
         updated_at = now()
  FROM src
  WHERE p.id = src.id
    AND src.oldest IS NOT NULL
    AND COALESCE(p.codigo_prontuario_anterior,'') <> src.oldest;

  GET DIAGNOSTICS _n = ROW_COUNT;
  RETURN QUERY SELECT _n;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public._do_fix_prontuario_oldest_mj() FROM PUBLIC;
