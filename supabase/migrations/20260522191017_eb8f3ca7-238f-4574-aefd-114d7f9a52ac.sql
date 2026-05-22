DROP POLICY IF EXISTS "Qualquer um pode capturar lead" ON public.mkt_leads;

CREATE POLICY "Qualquer um pode capturar lead"
ON public.mkt_leads
FOR INSERT
TO anon, authenticated
WITH CHECK (
  landing_page_id IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.mkt_landing_pages lp
    WHERE lp.id = mkt_leads.landing_page_id
      AND lp.clinica_id = mkt_leads.clinica_id
  )
  AND nome IS NOT NULL AND length(nome) BETWEEN 1 AND 200
  AND (email IS NULL OR length(email) <= 200)
  AND (telefone IS NULL OR length(telefone) <= 40)
  AND (mensagem IS NULL OR length(mensagem) <= 4000)
  AND (origem IS NULL OR length(origem) <= 50)
);