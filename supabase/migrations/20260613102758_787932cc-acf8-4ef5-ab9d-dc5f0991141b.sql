
-- 1. Bloquear _mj_match_plan (tabela interna sem RLS)
ALTER TABLE public._mj_match_plan ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._mj_match_plan FROM anon, authenticated;
GRANT ALL ON public._mj_match_plan TO service_role;

-- 2. Esconder colunas biométricas em medicos de membros comuns
REVOKE SELECT (face_descriptor, face_atualizado_em) ON public.medicos FROM authenticated;
REVOKE SELECT (face_descriptor, face_atualizado_em) ON public.medicos FROM anon;
GRANT SELECT (face_descriptor, face_atualizado_em) ON public.medicos TO service_role;

-- 3. Esconder credenciais WhatsApp de queries client-side
REVOKE SELECT (access_token, app_secret) ON public.whatsapp_configs FROM authenticated;
REVOKE SELECT (access_token, app_secret) ON public.whatsapp_configs FROM anon;
GRANT SELECT (access_token, app_secret) ON public.whatsapp_configs TO service_role;

-- 4. Reforçar policy de hr_holerites para exigir mesma clínica no self-access
DROP POLICY IF EXISTS hr_hol_select ON public.hr_holerites;
CREATE POLICY hr_hol_select ON public.hr_holerites
  FOR SELECT
  USING (
    can_manage_clinica(auth.uid(), clinica_id)
    OR EXISTS (
      SELECT 1 FROM public.hr_contratos c
      WHERE c.id = hr_holerites.contrato_id
        AND c.user_id = auth.uid()
        AND c.clinica_id = hr_holerites.clinica_id
    )
  );
