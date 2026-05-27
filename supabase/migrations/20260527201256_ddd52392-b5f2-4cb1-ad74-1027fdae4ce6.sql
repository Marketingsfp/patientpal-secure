
ALTER TABLE public.pacientes ADD COLUMN IF NOT EXISTS codigo_prontuario text;

CREATE UNIQUE INDEX IF NOT EXISTS pacientes_codigo_prontuario_unq
  ON public.pacientes (clinica_id, codigo_prontuario);

CREATE OR REPLACE FUNCTION public.pacientes_set_codigo_prontuario()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _next bigint;
BEGIN
  IF NEW.codigo_prontuario IS NOT NULL AND length(trim(NEW.codigo_prontuario)) > 0 THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('pac_codigo:'||NEW.clinica_id::text));
  SELECT COALESCE(MAX( NULLIF(regexp_replace(codigo_prontuario, '\D', '', 'g'), '')::bigint ), 0) + 1
    INTO _next
    FROM public.pacientes
   WHERE clinica_id = NEW.clinica_id;
  NEW.codigo_prontuario := lpad(_next::text, 5, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pacientes_set_codigo_prontuario ON public.pacientes;
CREATE TRIGGER trg_pacientes_set_codigo_prontuario
BEFORE INSERT ON public.pacientes
FOR EACH ROW EXECUTE FUNCTION public.pacientes_set_codigo_prontuario();

-- Backfill por clínica, ordem de criação
DO $$
DECLARE
  r record;
  i bigint;
BEGIN
  FOR r IN SELECT DISTINCT clinica_id FROM public.pacientes LOOP
    i := 0;
    FOR r IN
      SELECT id FROM public.pacientes
       WHERE clinica_id = r.clinica_id AND (codigo_prontuario IS NULL OR codigo_prontuario = '')
       ORDER BY created_at, id
    LOOP
      -- pega o próximo número considerando códigos já existentes
      SELECT COALESCE(MAX( NULLIF(regexp_replace(codigo_prontuario, '\D', '', 'g'), '')::bigint ), 0) + 1
        INTO i
        FROM public.pacientes p2
       WHERE p2.clinica_id = (SELECT clinica_id FROM public.pacientes WHERE id = r.id);
      UPDATE public.pacientes
         SET codigo_prontuario = lpad(i::text, 5, '0')
       WHERE id = r.id;
    END LOOP;
  END LOOP;
END $$;
