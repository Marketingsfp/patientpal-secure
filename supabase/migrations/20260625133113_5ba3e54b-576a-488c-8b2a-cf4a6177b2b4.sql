
CREATE INDEX IF NOT EXISTS idx_pacientes_clinica_codigo_num
  ON public.pacientes (clinica_id, ((codigo_prontuario)::bigint) DESC)
  WHERE codigo_prontuario ~ '^\d+$';

CREATE OR REPLACE FUNCTION public.pacientes_set_codigo_prontuario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  _next bigint;
  _txt  text;
BEGIN
  IF NEW.codigo_prontuario IS NOT NULL AND length(trim(NEW.codigo_prontuario)) > 0 THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('pac_codigo:'||NEW.clinica_id::text));
  SELECT (codigo_prontuario)::bigint
    INTO _next
    FROM public.pacientes
   WHERE clinica_id = NEW.clinica_id
     AND codigo_prontuario ~ '^\d+$'
   ORDER BY (codigo_prontuario)::bigint DESC
   LIMIT 1;
  _next := COALESCE(_next, 0) + 1;
  _txt := _next::text;
  IF length(_txt) < 5 THEN
    _txt := lpad(_txt, 5, '0');
  END IF;
  NEW.codigo_prontuario := _txt;
  RETURN NEW;
END;
$function$;
