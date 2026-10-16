ALTER TABLE public.agendamentos
  ADD COLUMN IF NOT EXISTS ficha_encaixe boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ficha_encaixe_numero integer;

COMMENT ON COLUMN public.agendamentos.ficha_encaixe IS
  'Linha que não ocupa vaga própria da grade (encaixe, ficha extra, horário empurrado +1s). Ganha número fixo no fim da fila.';
COMMENT ON COLUMN public.agendamentos.ficha_encaixe_numero IS
  'Número da ficha do encaixe, gravado na criação (próximo depois da maior ficha do dia/médico/agenda). Nulo = ficha calculada pela posição.';

-- Mesma função de 0027; única mudança: quando precisou somar segundos, marca como encaixe.
CREATE OR REPLACE FUNCTION public.fn_agendamento_inicio_sem_repetir()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _passos int := 0;
BEGIN
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
  IF _passos > 0 THEN
    NEW.ficha_encaixe := true;
  END IF;
  RETURN NEW;
END;
$$;

-- Roda DEPOIS de trg_agendamento_inicio_sem_repetir (ordem alfabética do nome).
CREATE OR REPLACE FUNCTION public.fn_agendamento_ficha_encaixe()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _dia date;
  _ini timestamptz;
  _fim timestamptz;
  _grade int;
  _enc_qtd int;
  _enc_max int;
BEGIN
  IF NOT NEW.ficha_encaixe OR NEW.ficha_encaixe_numero IS NOT NULL
     OR NEW.agenda_id IS NULL OR NEW.medico_id IS NULL OR NEW.inicio IS NULL THEN
    RETURN NEW;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('agenda_inicio:' || NEW.agenda_id::text, 0));

  _dia := (NEW.inicio AT TIME ZONE 'America/Sao_Paulo')::date;
  _ini := (_dia::timestamp) AT TIME ZONE 'America/Sao_Paulo';
  _fim := ((_dia + 1)::timestamp) AT TIME ZONE 'America/Sao_Paulo';

  SELECT
    count(*) FILTER (WHERE a.ficha_encaixe_numero IS NULL),
    count(*) FILTER (WHERE a.ficha_encaixe_numero IS NOT NULL),
    coalesce(max(a.ficha_encaixe_numero), 0)
  INTO _grade, _enc_qtd, _enc_max
  FROM public.agendamentos a
  WHERE a.clinica_id = NEW.clinica_id
    AND a.medico_id = NEW.medico_id
    AND a.agenda_id = NEW.agenda_id
    AND a.inicio >= _ini AND a.inicio < _fim
    AND a.id IS DISTINCT FROM NEW.id;

  NEW.ficha_encaixe_numero := greatest(_grade + _enc_qtd, _enc_max) + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_agendamento_inicio_sem_repetir_ficha
BEFORE INSERT OR UPDATE OF inicio, agenda_id, medico_id, ficha_encaixe ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_agendamento_ficha_encaixe();