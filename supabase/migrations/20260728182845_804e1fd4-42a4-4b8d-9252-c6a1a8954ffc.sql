CREATE OR REPLACE FUNCTION public.fn_sync_paciente_nome_agendamentos()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.nome IS DISTINCT FROM OLD.nome THEN
    UPDATE public.agendamentos
       SET paciente_nome = NEW.nome
     WHERE paciente_id = NEW.id
       AND paciente_nome IS DISTINCT FROM NEW.nome;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_paciente_nome_agendamentos ON public.pacientes;
CREATE TRIGGER trg_sync_paciente_nome_agendamentos
AFTER UPDATE OF nome ON public.pacientes
FOR EACH ROW
EXECUTE FUNCTION public.fn_sync_paciente_nome_agendamentos();