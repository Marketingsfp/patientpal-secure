CREATE TABLE public.hiperdia_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  paciente_id uuid NOT NULL REFERENCES public.pacientes(id) ON DELETE CASCADE,
  medico_id uuid REFERENCES public.medicos(id) ON DELETE SET NULL,
  registrado_por uuid,
  data_registro timestamptz NOT NULL DEFAULT now(),
  pressao_sistolica integer,
  pressao_diastolica integer,
  glicemia_jejum integer,
  glicemia_pos_prandial integer,
  peso numeric(6,2),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hiperdia_registros TO authenticated;
GRANT ALL ON public.hiperdia_registros TO service_role;

ALTER TABLE public.hiperdia_registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY hr_select ON public.hiperdia_registros FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));
CREATE POLICY hr_insert ON public.hiperdia_registros FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), clinica_id));
CREATE POLICY hr_update ON public.hiperdia_registros FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid(), clinica_id))
  WITH CHECK (public.is_member(auth.uid(), clinica_id));
CREATE POLICY hr_delete ON public.hiperdia_registros FOR DELETE TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

CREATE INDEX idx_hiperdia_paciente ON public.hiperdia_registros (paciente_id, data_registro DESC);
CREATE INDEX idx_hiperdia_clinica_data ON public.hiperdia_registros (clinica_id, data_registro DESC);

CREATE TRIGGER trg_hiperdia_updated_at BEFORE UPDATE ON public.hiperdia_registros
  FOR EACH ROW EXECUTE FUNCTION public._touch_updated_at();