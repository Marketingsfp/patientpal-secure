CREATE OR REPLACE FUNCTION public.fn_agendamento_inicio_sem_repetir()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _passos int := 0;
BEGIN
  -- Mesma regra do "+ Ficha extra": se já existe outro agendamento não cancelado
  -- na mesma clínica/médico/agenda com o mesmo início, soma 1 segundo até ficar livre.
  IF NEW.agenda_id IS NULL OR NEW.medico_id IS NULL OR NEW.inicio IS NULL
     OR NEW.status = 'cancelado' THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.inicio IS NOT DISTINCT FROM OLD.inicio
     AND NEW.agenda_id IS NOT DISTINCT FROM OLD.agenda_id
     AND NEW.medico_id IS NOT DISTINCT FROM OLD.medico_id THEN
    RETURN NEW;
  END IF;

  -- Serializa gravações da mesma agenda para dois encaixes simultâneos não pegarem o mesmo segundo.
  PERFORM pg_advisory_xact_lock(hashtextextended('agenda_inicio:' || NEW.agenda_id::text, 0));

  WHILE EXISTS (
    SELECT 1 FROM public.agendamentos a
    WHERE a.clinica_id = NEW.clinica_id
      AND a.medico_id = NEW.medico_id
      AND a.agenda_id = NEW.agenda_id
      AND a.inicio = NEW.inicio
      AND a.status <> 'cancelado'
      AND a.id IS DISTINCT FROM NEW.id
  ) AND _passos < 3600 LOOP
    NEW.inicio := NEW.inicio + interval '1 second';
    IF NEW.fim IS NOT NULL AND NEW.fim <= NEW.inicio THEN
      NEW.fim := NEW.inicio + interval '1 second';
    END IF;
    _passos := _passos + 1;
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agendamento_inicio_sem_repetir
BEFORE INSERT OR UPDATE OF inicio, agenda_id, medico_id ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_agendamento_inicio_sem_repetir();