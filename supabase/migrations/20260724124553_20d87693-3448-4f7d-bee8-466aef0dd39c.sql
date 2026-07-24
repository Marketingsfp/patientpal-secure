-- 1. nfse_emitentes: remover SELECT amplo para membros (mantém view nfse_emitentes_publico sem campos sensíveis)
DROP POLICY IF EXISTS "members select emitentes" ON public.nfse_emitentes;

-- 2. prestadores: recriar policy prest_select restrita a authenticated
DO $$
DECLARE r record;
BEGIN
  SELECT qual INTO r FROM pg_policies
   WHERE schemaname='public' AND tablename='prestadores' AND policyname='prest_select';
  IF FOUND THEN
    DROP POLICY "prest_select" ON public.prestadores;
    EXECUTE format('CREATE POLICY %I ON public.prestadores FOR SELECT TO authenticated USING (%s)',
                   'prest_select', r.qual);
  END IF;
END $$;

-- 3. Recriar todas as policies aplicadas ao role {public} restringindo a {authenticated}
DO $$
DECLARE
  p record;
  cmd_sql text;
  qual_sql text;
  check_sql text;
  tgt_tables text[] := ARRAY[
    'hr_banco_horas','hr_holerites','hr_ferias','hr_contratos','hr_pontos','hr_escalas',
    'unidades','cargos','setores','lms_progresso','lms_certificados','integration_secrets',
    'cb_beneficios','cb_convenio_faixas','cb_convenios','procedimento_cb_convenio_valores',
    'lgpd_consentimentos','lgpd_solicitacoes','perfis_acesso','perfil_permissoes',
    'role_permissions','sistema_planos'
  ];
BEGIN
  FOR p IN
    SELECT tablename, policyname, cmd, qual, with_check
      FROM pg_policies
     WHERE schemaname='public'
       AND tablename = ANY(tgt_tables)
       AND roles = '{public}'
  LOOP
    cmd_sql := CASE p.cmd
      WHEN 'ALL' THEN 'ALL'
      WHEN 'SELECT' THEN 'SELECT'
      WHEN 'INSERT' THEN 'INSERT'
      WHEN 'UPDATE' THEN 'UPDATE'
      WHEN 'DELETE' THEN 'DELETE'
    END;
    qual_sql  := CASE WHEN p.qual       IS NOT NULL THEN ' USING ('       || p.qual       || ')' ELSE '' END;
    check_sql := CASE WHEN p.with_check IS NOT NULL THEN ' WITH CHECK ('  || p.with_check || ')' ELSE '' END;

    EXECUTE format('DROP POLICY %I ON public.%I', p.policyname, p.tablename);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated%s%s',
                   p.policyname, p.tablename, cmd_sql, qual_sql, check_sql);
  END LOOP;
END $$;