
ALTER TABLE public.fin_atendimentos ADD COLUMN IF NOT EXISTS repasse_lock_id uuid;
ALTER TABLE public.fin_lancamentos  ADD COLUMN IF NOT EXISTS repasse_lock_id uuid;

CREATE OR REPLACE FUNCTION public.prevent_double_repasse_pago()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Só interessa quando NEW.repasse_pago = true.
  IF NEW.repasse_pago IS DISTINCT FROM TRUE THEN
    RETURN NEW;
  END IF;
  -- Se já estava pago e alguém tenta marcar de novo com um lançamento
  -- de despesa diferente, bloqueia. Reimpressão/2ª via reusa o mesmo
  -- repasse_lancamento_id e passa livre.
  IF OLD.repasse_pago = TRUE
     AND OLD.repasse_lancamento_id IS NOT NULL
     AND NEW.repasse_lancamento_id IS DISTINCT FROM OLD.repasse_lancamento_id
  THEN
    RAISE EXCEPTION 'Repasse já foi pago para este atendimento (id=%)', OLD.id
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_double_repasse_atend ON public.fin_atendimentos;
CREATE TRIGGER trg_prevent_double_repasse_atend
BEFORE UPDATE OF repasse_pago, repasse_lancamento_id ON public.fin_atendimentos
FOR EACH ROW EXECUTE FUNCTION public.prevent_double_repasse_pago();

DROP TRIGGER IF EXISTS trg_prevent_double_repasse_lanc ON public.fin_lancamentos;
CREATE TRIGGER trg_prevent_double_repasse_lanc
BEFORE UPDATE OF repasse_pago, repasse_lancamento_id ON public.fin_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.prevent_double_repasse_pago();
