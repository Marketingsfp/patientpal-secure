-- 1) mkt_leads: tighten anonymous lead capture validation
DROP POLICY IF EXISTS "Qualquer um pode capturar lead" ON public.mkt_leads;
CREATE POLICY "Qualquer um pode capturar lead"
ON public.mkt_leads FOR INSERT TO anon
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
  AND btrim(nome) <> ''
  AND length(nome) BETWEEN 2 AND 120
  AND nome !~ '[[:cntrl:]]'
  AND (telefone IS NULL OR (length(telefone) BETWEEN 8 AND 30 AND telefone ~ '^[0-9()+\-\s.]+$'))
  AND (email IS NULL OR (length(email) <= 254 AND email ~* '^[^@\s]+@[^@\s.]+\.[^@\s]+$'))
  AND (mensagem IS NULL OR (length(mensagem) <= 2000 AND mensagem !~ '<\s*script'))
  AND (telefone IS NOT NULL OR email IS NOT NULL)
);

-- 2) prontuarios: INSERT must reference a patient of the same clinic
DROP POLICY IF EXISTS pron_insert ON public.prontuarios;
CREATE POLICY pron_insert
ON public.prontuarios FOR INSERT TO authenticated
WITH CHECK (
  has_any_role(auth.uid(), clinica_id, ARRAY['admin'::app_role,'gestor'::app_role,'medico'::app_role,'enfermeiro'::app_role])
  AND EXISTS (
    SELECT 1 FROM public.pacientes pa
    WHERE pa.id = prontuarios.paciente_id
      AND pa.clinica_id = prontuarios.clinica_id
  )
);

-- 3) staging/import tables: hard lock (fail-closed + no grants)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['_mj_dedup','_mj_import_csv','_mj_match_plan','_tmp_import_pacientes'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;