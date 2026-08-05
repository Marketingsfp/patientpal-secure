-- 1) Limpeza dos registros espelhados existentes
DELETE FROM public.fin_atendimentos fa
 WHERE fa.lancamento_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.fin_lancamentos l WHERE l.id = fa.lancamento_id);

-- 2) Constraint parcial para impedir dois fin_atendimentos com o mesmo lancamento_id
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_atend_lancamento_id
  ON public.fin_atendimentos(lancamento_id)
  WHERE lancamento_id IS NOT NULL;

-- 3) Trigger BEFORE INSERT: descarta silenciosamente quando já existe
--    um fin_lancamentos apontando para o mesmo pagamento/agendamento.
CREATE OR REPLACE FUNCTION public.fn_fin_atend_evita_duplicidade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Caso 1: já foi vinculado explicitamente a um lançamento
  IF NEW.lancamento_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.fin_lancamentos l WHERE l.id = NEW.lancamento_id) THEN
    RETURN NULL;
  END IF;

  -- Caso 2: existe fin_lancamentos para o mesmo agendamento (evita espelho sem lancamento_id)
  IF NEW.agendamento_id IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM public.fin_lancamentos l
        WHERE l.agendamento_id = NEW.agendamento_id
          AND l.tipo = 'receita'
          AND l.status <> 'cancelado'
     ) THEN
    RETURN NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fin_atend_evita_duplicidade ON public.fin_atendimentos;
CREATE TRIGGER trg_fin_atend_evita_duplicidade
  BEFORE INSERT ON public.fin_atendimentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_fin_atend_evita_duplicidade();