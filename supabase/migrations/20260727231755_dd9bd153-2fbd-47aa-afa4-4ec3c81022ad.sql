ALTER TABLE public.orcamentos ADD COLUMN IF NOT EXISTS serie text NOT NULL DEFAULT '';

CREATE UNIQUE INDEX IF NOT EXISTS orcamentos_clinica_serie_numero_uidx
  ON public.orcamentos (clinica_id, serie, numero);

CREATE OR REPLACE FUNCTION public.orcamentos_set_numero()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  _ano int := EXTRACT(YEAR FROM (now() AT TIME ZONE 'America/Sao_Paulo'))::int;
  _serie text := COALESCE(NEW.serie, '');
  _base int := _ano * 100000;
  _seq int;
  _max_global int;
BEGIN
  IF NEW.numero IS NULL OR NEW.numero = 0 THEN
    PERFORM pg_advisory_xact_lock(
      hashtext('orcamento:' || NEW.clinica_id::text || ':' || _serie || ':' || _ano::text)
    );

    SELECT COALESCE(MAX(numero), _base) + 1 INTO _seq
      FROM public.orcamentos
     WHERE clinica_id = NEW.clinica_id
       AND COALESCE(serie, '') = _serie
       AND numero >= _base AND numero < _base + 100000;

    IF _seq <= _base THEN
      _seq := _base + 1;
    END IF;

    -- Faixa do ano esgotada: continua de onde parou (não reinicia).
    IF _seq >= _base + 100000 THEN
      SELECT COALESCE(MAX(numero), _base) + 1 INTO _max_global
        FROM public.orcamentos
       WHERE clinica_id = NEW.clinica_id
         AND COALESCE(serie, '') = _serie;
      _seq := _max_global;
    END IF;

    NEW.numero := _seq;
  END IF;
  RETURN NEW;
END;
$function$;