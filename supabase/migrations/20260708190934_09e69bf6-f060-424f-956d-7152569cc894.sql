CREATE OR REPLACE FUNCTION public.fn_fin_atend_evita_duplicidade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.lancamento_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.fin_lancamentos l WHERE l.id = NEW.lancamento_id) THEN
    RETURN NULL;
  END IF;
  RETURN NEW;
END;
$$;