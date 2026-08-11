DO $$
DECLARE
  t text;
  alvos text[] := ARRAY[
    'pacientes','prontuarios','odonto_prontuarios','odonto_evolucoes',
    'exame_resultados','anamnese_respostas','triagens_enfermagem',
    'pagamentos','caixa_movimentos','caixa_sessoes','boletos',
    'estorno_solicitacoes','fin_atendimentos','nfse','medico_repasse_laudo',
    'perfis_acesso','perfil_permissoes','user_roles','clinica_memberships'
  ];
BEGIN
  FOREACH t IN ARRAY alvos LOOP
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = t
    ) THEN
      EXECUTE format('DROP TRIGGER IF EXISTS trg_audit_%1$s ON public.%1$I', t);
      EXECUTE format(
        'CREATE TRIGGER trg_audit_%1$s AFTER INSERT OR UPDATE OR DELETE ON public.%1$I FOR EACH ROW EXECUTE FUNCTION public.fn_audit_trigger()',
        t
      );
    END IF;
  END LOOP;
END $$;