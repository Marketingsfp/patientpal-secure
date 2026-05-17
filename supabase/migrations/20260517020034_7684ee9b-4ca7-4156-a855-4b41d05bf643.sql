CREATE OR REPLACE FUNCTION public.procedimentos_uppercase_nome()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.nome IS NOT NULL THEN
    NEW.nome := upper(trim(NEW.nome));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_procedimentos_uppercase ON public.procedimentos;
CREATE TRIGGER trg_procedimentos_uppercase
BEFORE INSERT OR UPDATE OF nome ON public.procedimentos
FOR EACH ROW EXECUTE FUNCTION public.procedimentos_uppercase_nome();