CREATE TABLE public.enfermagem_recurso_atendentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  recurso_id uuid NOT NULL REFERENCES public.enfermagem_recursos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, recurso_id)
);

CREATE INDEX idx_enf_atend_user ON public.enfermagem_recurso_atendentes(user_id);
CREATE INDEX idx_enf_atend_recurso ON public.enfermagem_recurso_atendentes(recurso_id);
CREATE INDEX idx_enf_atend_clinica ON public.enfermagem_recurso_atendentes(clinica_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enfermagem_recurso_atendentes TO authenticated;
GRANT ALL ON public.enfermagem_recurso_atendentes TO service_role;

ALTER TABLE public.enfermagem_recurso_atendentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ver atendentes de enfermagem"
  ON public.enfermagem_recurso_atendentes FOR SELECT
  TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY "Gestores podem inserir atendentes de enfermagem"
  ON public.enfermagem_recurso_atendentes FOR INSERT
  TO authenticated
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "Gestores podem atualizar atendentes de enfermagem"
  ON public.enfermagem_recurso_atendentes FOR UPDATE
  TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE POLICY "Gestores podem remover atendentes de enfermagem"
  ON public.enfermagem_recurso_atendentes FOR DELETE
  TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id));