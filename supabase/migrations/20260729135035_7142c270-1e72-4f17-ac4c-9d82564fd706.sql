DROP POLICY IF EXISTS qa_cb_casos_insert ON public.qa_cb_casos;
DROP POLICY IF EXISTS qa_cb_casos_update ON public.qa_cb_casos;
DROP POLICY IF EXISTS qa_cb_casos_delete ON public.qa_cb_casos;

CREATE POLICY qa_cb_casos_insert ON public.qa_cb_casos
  FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY qa_cb_casos_update ON public.qa_cb_casos
  FOR UPDATE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY qa_cb_casos_delete ON public.qa_cb_casos
  FOR DELETE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));