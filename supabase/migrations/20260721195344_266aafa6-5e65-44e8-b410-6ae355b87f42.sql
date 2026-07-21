CREATE POLICY "members select emitentes"
  ON public.nfse_emitentes
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clinica_memberships m
      WHERE m.user_id = auth.uid()
        AND m.clinica_id = nfse_emitentes.clinica_id
        AND m.ativo = true
    )
  );