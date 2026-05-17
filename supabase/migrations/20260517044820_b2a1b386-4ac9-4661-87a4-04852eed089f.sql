
CREATE TABLE IF NOT EXISTS public.medico_biometria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id uuid NOT NULL,
  clinica_id uuid NOT NULL,
  user_id uuid,
  descriptor jsonb NOT NULL,
  consentimento_em timestamptz NOT NULL DEFAULT now(),
  revogado_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.medico_biometria ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mb_select ON public.medico_biometria;
DROP POLICY IF EXISTS mb_insert ON public.medico_biometria;
DROP POLICY IF EXISTS mb_update ON public.medico_biometria;
DROP POLICY IF EXISTS mb_delete ON public.medico_biometria;
CREATE POLICY mb_select ON public.medico_biometria FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY mb_insert ON public.medico_biometria FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY mb_update ON public.medico_biometria FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY mb_delete ON public.medico_biometria FOR DELETE TO authenticated USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE INDEX IF NOT EXISTS idx_mb_clinica_ativa ON public.medico_biometria (clinica_id) WHERE revogado_em IS NULL;

DROP FUNCTION IF EXISTS public.pacientes_face_lista(uuid);
DROP FUNCTION IF EXISTS public.medicos_face_lista(uuid);

CREATE FUNCTION public.pacientes_face_lista(_clinica_id uuid)
RETURNS TABLE(id uuid, nome text, descriptor jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id, p.nome, b.descriptor
  FROM public.paciente_biometria b
  JOIN public.pacientes p ON p.id = b.paciente_id
  WHERE b.clinica_id = _clinica_id AND b.revogado_em IS NULL AND p.ativo
    AND is_member(auth.uid(), b.clinica_id);
$$;

CREATE FUNCTION public.medicos_face_lista(_clinica_id uuid)
RETURNS TABLE(medico_id uuid, nome text, email text, user_id uuid, descriptor jsonb)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.id, m.nome, m.email, m.user_id, b.descriptor
  FROM public.medico_biometria b
  JOIN public.medicos m ON m.id = b.medico_id
  WHERE b.clinica_id = _clinica_id AND b.revogado_em IS NULL AND m.ativo
    AND is_member(auth.uid(), b.clinica_id);
$$;
