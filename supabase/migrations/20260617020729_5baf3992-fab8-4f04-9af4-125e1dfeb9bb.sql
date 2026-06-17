
DO $$
DECLARE
  v_clinica uuid := '7570ddde-8c1c-4b55-ba72-cf12b2a6c940';
  v_next bigint;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('pac_codigo:'||v_clinica::text));

  SELECT COALESCE(MAX(codigo_prontuario::bigint), 0) + 1
    INTO v_next
    FROM public.pacientes
   WHERE clinica_id = v_clinica
     AND codigo_prontuario ~ '^\d+$';

  WITH tmp AS (
    SELECT id,
           row_number() OVER (ORDER BY created_at, id) - 1 AS rn
      FROM public.pacientes
     WHERE clinica_id = v_clinica
       AND codigo_prontuario LIKE '\_TMP\_%'
  )
  UPDATE public.pacientes p
     SET codigo_prontuario = (v_next + tmp.rn)::text
    FROM tmp
   WHERE p.id = tmp.id;
END $$;
