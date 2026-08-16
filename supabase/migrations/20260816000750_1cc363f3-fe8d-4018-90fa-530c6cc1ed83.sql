-- 1) Escrita em domínios financeiros/contratuais restrita por papel
DO $$
DECLARE
  t text;
  papeis_fin text := 'ARRAY[''admin''::app_role, ''gestor''::app_role, ''supervisor''::app_role, ''financeiro''::app_role, ''caixa''::app_role]';
  papeis_com_recep text := 'ARRAY[''admin''::app_role, ''gestor''::app_role, ''supervisor''::app_role, ''financeiro''::app_role, ''caixa''::app_role, ''recepcao''::app_role]';
  papeis text;
  ins text;
  upd text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fin_atendimentos','fin_notas_pacientes','boletos','nfse','orcamentos','contratos_assinatura','contrato_mensalidades','pagamento_splits']
  LOOP
    IF t IN ('orcamentos','contratos_assinatura') THEN
      papeis := papeis_com_recep;
    ELSE
      papeis := papeis_fin;
    END IF;

    -- remove políticas de escrita existentes baseadas apenas em is_member
    FOR ins IN
      SELECT policyname FROM pg_policies
      WHERE schemaname='public' AND tablename=t AND cmd IN ('INSERT','UPDATE')
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', ins, t);
    END LOOP;

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (has_any_role(auth.uid(), clinica_id, %s))',
      t || '_insert_roles', t, papeis);

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (has_any_role(auth.uid(), clinica_id, %s)) WITH CHECK (has_any_role(auth.uid(), clinica_id, %s))',
      t || '_update_roles', t, papeis, papeis);
  END LOOP;
END $$;

-- 2) Captura pública de leads: restringir payload
DROP POLICY IF EXISTS "Qualquer um pode capturar lead" ON public.mkt_leads;

CREATE POLICY "Qualquer um pode capturar lead"
ON public.mkt_leads
FOR INSERT
TO anon
WITH CHECK (
  landing_page_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.mkt_landing_pages p
    WHERE p.id = mkt_leads.landing_page_id
      AND p.clinica_id = mkt_leads.clinica_id
      AND p.status = 'publicada'
  )
  AND origem = 'landing_page'
  AND status = 'novo'
  AND paciente_id IS NULL
  AND dados IS NULL
  AND nome IS NOT NULL
  AND length(nome) BETWEEN 1 AND 120
  AND (telefone IS NULL OR length(telefone) <= 30)
  AND (email IS NULL OR length(email) <= 254)
  AND (mensagem IS NULL OR length(mensagem) <= 2000)
);