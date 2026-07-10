
DROP TRIGGER IF EXISTS trg_audit_fin_lancamentos ON public.fin_lancamentos;
CREATE TRIGGER trg_audit_fin_lancamentos
AFTER INSERT OR UPDATE OR DELETE ON public.fin_lancamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();
