CREATE OR REPLACE FUNCTION public.fn_cancelar_laudo_ao_cancelar_lanc()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'cancelado'
     AND (OLD.status IS DISTINCT FROM 'cancelado')
     AND NEW.laudo_lancamento_id IS NOT NULL THEN
    UPDATE public.fin_atendimentos
       SET status = 'cancelado',
           observacoes = COALESCE(observacoes,'') || ' [auto: lançamento origem cancelado]'
     WHERE id = NEW.laudo_lancamento_id
       AND status <> 'cancelado';
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_cancelar_laudo_ao_cancelar_lanc ON public.fin_lancamentos;
CREATE TRIGGER trg_cancelar_laudo_ao_cancelar_lanc
  AFTER UPDATE OF status ON public.fin_lancamentos
  FOR EACH ROW EXECUTE FUNCTION public.fn_cancelar_laudo_ao_cancelar_lanc();