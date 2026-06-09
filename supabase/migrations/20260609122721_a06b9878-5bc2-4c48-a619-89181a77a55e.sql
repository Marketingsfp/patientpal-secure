CREATE OR REPLACE FUNCTION public.orcamentos_set_numero()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _ano int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
  _base int := _ano * 100000;
  _seq int;
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('orcamento:' || NEW.clinica_id::text || ':' || _ano::text));
    SELECT COALESCE(MAX(numero), _base) + 1 INTO _seq
      FROM public.orcamentos
     WHERE clinica_id = NEW.clinica_id
       AND numero >= _base AND numero < _base + 100000;
    IF _seq <= _base THEN
      _seq := _base + 1;
    END IF;
    NEW.numero := _seq;
  END IF;
  RETURN NEW;
END;
$function$;