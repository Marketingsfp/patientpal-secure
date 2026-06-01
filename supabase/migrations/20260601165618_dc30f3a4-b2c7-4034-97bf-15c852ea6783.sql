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
  SELECT COALESCE(MAX( NULLIF(regexp_replace(codigo_prontuario, '\D', '', 'g'), '')::bigint ), 0) + 1
    INTO _next
    FROM public.pacientes
   WHERE clinica_id = NEW.clinica_id;
  _txt := _next::text;
  IF length(_txt) < 5 THEN
    _txt := lpad(_txt, 5, '0');
  END IF;
  NEW.codigo_prontuario := _txt;
  RETURN NEW;
END;
$function$;