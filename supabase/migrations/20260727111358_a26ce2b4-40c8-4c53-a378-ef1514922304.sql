DROP TRIGGER IF EXISTS trg_audit_cb_convenios ON public.cb_convenios;
CREATE TRIGGER trg_audit_cb_convenios
AFTER INSERT OR UPDATE OR DELETE ON public.cb_convenios
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_cb_convenio_regras ON public.cb_convenio_regras;
CREATE TRIGGER trg_audit_cb_convenio_regras
AFTER INSERT OR UPDATE OR DELETE ON public.cb_convenio_regras
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_cb_convenio_faixas ON public.cb_convenio_faixas;
CREATE TRIGGER trg_audit_cb_convenio_faixas
AFTER INSERT OR UPDATE OR DELETE ON public.cb_convenio_faixas
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();

DROP TRIGGER IF EXISTS trg_audit_procedimento_cb_convenio_valores ON public.procedimento_cb_convenio_valores;
CREATE TRIGGER trg_audit_procedimento_cb_convenio_valores
AFTER INSERT OR UPDATE OR DELETE ON public.procedimento_cb_convenio_valores
FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger();