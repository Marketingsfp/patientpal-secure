CREATE TABLE public.enfermagem_recurso_disponibilidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  recurso_id uuid NOT NULL REFERENCES public.enfermagem_recursos(id) ON DELETE CASCADE,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio time NOT NULL,
  hora_fim time NOT NULL,
  limite_pacientes integer,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.enfermagem_recurso_disponibilidades TO authenticated;
GRANT ALL ON public.enfermagem_recurso_disponibilidades TO service_role;

ALTER TABLE public.enfermagem_recurso_disponibilidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "membros leem horarios enfermagem"
  ON public.enfermagem_recurso_disponibilidades FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

CREATE POLICY "gestores gerenciam horarios enfermagem"
  ON public.enfermagem_recurso_disponibilidades FOR ALL TO authenticated
  USING (public.can_manage_clinica(auth.uid(), clinica_id))
  WITH CHECK (public.can_manage_clinica(auth.uid(), clinica_id));

CREATE INDEX idx_enf_disp_recurso ON public.enfermagem_recurso_disponibilidades(recurso_id, dia_semana);

CREATE TRIGGER trg_enf_disp_updated_at
  BEFORE UPDATE ON public.enfermagem_recurso_disponibilidades
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();