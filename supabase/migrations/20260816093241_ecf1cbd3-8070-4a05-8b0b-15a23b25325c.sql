DROP POLICY IF EXISTS qa_cb_casos_select ON public.qa_cb_casos;
CREATE POLICY qa_cb_casos_select ON public.qa_cb_casos
  FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));