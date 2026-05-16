
CREATE TABLE IF NOT EXISTS public.medico_disponibilidades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  medico_id uuid NOT NULL,
  dia_semana smallint NOT NULL CHECK (dia_semana BETWEEN 0 AND 6),
  hora_inicio time NOT NULL,
  hora_fim time NOT NULL,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (hora_fim > hora_inicio)
);

CREATE INDEX IF NOT EXISTS idx_md_clinica ON public.medico_disponibilidades(clinica_id);
CREATE INDEX IF NOT EXISTS idx_md_medico ON public.medico_disponibilidades(medico_id);

ALTER TABLE public.medico_disponibilidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY md_select ON public.medico_disponibilidades FOR SELECT TO authenticated
  USING (is_member(auth.uid(), clinica_id));
CREATE POLICY md_insert ON public.medico_disponibilidades FOR INSERT TO authenticated
  WITH CHECK (can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY md_update ON public.medico_disponibilidades FOR UPDATE TO authenticated
  USING (can_manage_clinica(auth.uid(), clinica_id));
CREATE POLICY md_delete ON public.medico_disponibilidades FOR DELETE TO authenticated
  USING (can_manage_clinica(auth.uid(), clinica_id));

CREATE TRIGGER trg_md_updated BEFORE UPDATE ON public.medico_disponibilidades
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
