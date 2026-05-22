-- 1) Remove políticas de Realtime baseadas em POSITION (substring) que permitem bypass entre clínicas
DROP POLICY IF EXISTS "Authenticated can broadcast on clinica channels" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can read clinica channels" ON realtime.messages;

-- 2) Corrige WITH CHECK do lgpd_solicitacoes para não permitir inserir em nome de outro usuário
DROP POLICY IF EXISTS lgpd_sol_insert ON public.lgpd_solicitacoes;
CREATE POLICY lgpd_sol_insert ON public.lgpd_solicitacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND (clinica_id IS NULL OR public.is_member(auth.uid(), clinica_id))
  );

-- 3) Restringe leitura de audit_log sem clinica_id
DROP POLICY IF EXISTS "Gestores podem ver auditoria" ON public.audit_log;
CREATE POLICY "Gestores podem ver auditoria" ON public.audit_log
  FOR SELECT TO authenticated
  USING (
    clinica_id IS NOT NULL AND public.can_manage_clinica(auth.uid(), clinica_id)
  );