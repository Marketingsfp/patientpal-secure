CREATE OR REPLACE FUNCTION public.contratos_assinatura_set_numero()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _ano int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
  _base int := _ano * 10000;
  _seq int;
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = 0 THEN
    PERFORM pg_advisory_xact_lock(hashtext('contrato_assin:'||NEW.clinica_id::text||':'||_ano::text));
    SELECT COALESCE(MAX(numero), _base) + 1 INTO _seq
    FROM public.contratos_assinatura
    WHERE clinica_id = NEW.clinica_id
      AND numero >= _base AND numero < _base + 10000;
    NEW.numero := _seq;
  END IF;
  RETURN NEW;
END;
$function$;