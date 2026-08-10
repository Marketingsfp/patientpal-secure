CREATE OR REPLACE FUNCTION public.fn_sync_agendamento_data_pagamento()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ag uuid := COALESCE(NEW.agendamento_id, OLD.agendamento_id);
  _tem boolean;
BEGIN
  IF _ag IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.fin_lancamentos l
    WHERE l.agendamento_id = _ag
      AND l.tipo = 'receita'
      AND l.status = 'confirmado'
  ) INTO _tem;

  IF _tem THEN
    UPDATE public.agendamentos a
       SET data_pagamento = COALESCE(a.data_pagamento, now())
     WHERE a.id = _ag AND a.data_pagamento IS NULL;
  ELSE
    UPDATE public.agendamentos a
       SET data_pagamento = NULL
     WHERE a.id = _ag AND a.data_pagamento IS NOT NULL;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_agendamento_data_pagamento ON public.fin_lancamentos;
CREATE TRIGGER trg_sync_agendamento_data_pagamento
AFTER INSERT OR UPDATE OR DELETE ON public.fin_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_sync_agendamento_data_pagamento();

UPDATE public.agendamentos a
   SET data_pagamento = now()
 WHERE a.data_pagamento IS NULL
   AND EXISTS (
     SELECT 1 FROM public.fin_lancamentos l
      WHERE l.agendamento_id = a.id
        AND l.tipo = 'receita'
        AND l.status = 'confirmado'
   );