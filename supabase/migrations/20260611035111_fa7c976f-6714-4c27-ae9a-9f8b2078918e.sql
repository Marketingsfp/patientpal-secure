
-- 1) Restringir leitura de biometria facial dos médicos a gestores ou ao próprio médico
DROP POLICY IF EXISTS mb_select ON public.medico_biometria;
CREATE POLICY mb_select ON public.medico_biometria
  FOR SELECT TO authenticated
  USING (
    public.can_manage_clinica(auth.uid(), clinica_id)
    OR EXISTS (
      SELECT 1 FROM public.medicos m
      WHERE m.id = medico_biometria.medico_id AND m.user_id = auth.uid()
    )
  );

-- Também restringir UPDATE a gestores (estava aberto para qualquer membro)
DROP POLICY IF EXISTS mb_update ON public.medico_biometria;
CREATE POLICY mb_update ON public.medico_biometria
  FOR UPDATE TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

-- 2) Ocultar paytime_recipient_id de membros (apenas service_role pode ler)
REVOKE SELECT (paytime_recipient_id) ON public.clinicas FROM authenticated, anon;
REVOKE SELECT (paytime_recipient_id) ON public.medicos  FROM authenticated, anon;
-- service_role continua com acesso (GRANT ALL já existente)
