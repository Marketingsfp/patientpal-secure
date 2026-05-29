
-- Trigger: ao renomear uma especialidade, atualizar procedimentos.grupo
CREATE OR REPLACE FUNCTION public.sync_procedimentos_grupo_on_esp_rename()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.nome IS DISTINCT FROM OLD.nome THEN
    UPDATE public.procedimentos
       SET grupo = NEW.nome
     WHERE lower(grupo) = lower(OLD.nome);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_procedimentos_grupo ON public.especialidades;
CREATE TRIGGER trg_sync_procedimentos_grupo
AFTER UPDATE OF nome ON public.especialidades
FOR EACH ROW
EXECUTE FUNCTION public.sync_procedimentos_grupo_on_esp_rename();

-- Trigger: ao renomear um tipo (categoria), atualizar procedimentos.tipo
CREATE OR REPLACE FUNCTION public.sync_procedimentos_tipo_on_tipo_rename()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.nome IS DISTINCT FROM OLD.nome THEN
    UPDATE public.procedimentos
       SET tipo = NEW.nome
     WHERE lower(tipo) = lower(OLD.nome);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_procedimentos_tipo ON public.tipos_servico;
CREATE TRIGGER trg_sync_procedimentos_tipo
AFTER UPDATE OF nome ON public.tipos_servico
FOR EACH ROW
EXECUTE FUNCTION public.sync_procedimentos_tipo_on_tipo_rename();

-- Backfill: corrigir os serviços ainda marcados como "Alergista"/"ALERGISTA"
UPDATE public.procedimentos
   SET grupo = 'ALERGOLOGIA'
 WHERE lower(grupo) = 'alergista';
