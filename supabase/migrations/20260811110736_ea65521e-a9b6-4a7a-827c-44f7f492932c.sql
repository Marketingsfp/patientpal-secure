DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['documentos_emitidos','fin_categorias','fin_contas','prontuario_modelos','role_permissions']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$I', t);
    EXECUTE format('CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger()', t);
  END LOOP;
END $$;