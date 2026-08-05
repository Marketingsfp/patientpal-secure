CREATE TRIGGER trg_audit_agendamentos
AFTER INSERT OR UPDATE OR DELETE ON public.agendamentos
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();