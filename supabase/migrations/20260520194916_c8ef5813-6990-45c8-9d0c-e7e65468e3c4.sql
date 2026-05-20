CREATE TABLE public.triagens_enfermagem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id uuid NOT NULL,
  agendamento_id uuid,
  paciente_id uuid,
  enfermeira_id uuid,
  enfermeira_nome text,
  peso_kg numeric(5,2),
  altura_cm numeric(5,2),
  imc numeric(5,2),
  pa_sistolica integer,
  pa_diastolica integer,
  freq_cardiaca integer,
  temperatura numeric(4,2),
  saturacao integer,
  glicemia integer,
  queixa_principal text,
  doencas text[] DEFAULT '{}'::text[],
  medicamentos text,
  alergias text,
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_triagens_enf_clinica ON public.triagens_enfermagem(clinica_id, created_at DESC);
CREATE INDEX idx_triagens_enf_ag ON public.triagens_enfermagem(agendamento_id);

ALTER TABLE public.triagens_enfermagem ENABLE ROW LEVEL SECURITY;

CREATE POLICY te_select ON public.triagens_enfermagem FOR SELECT TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY te_insert ON public.triagens_enfermagem FOR INSERT TO authenticated WITH CHECK (is_member(auth.uid(), clinica_id));
CREATE POLICY te_update ON public.triagens_enfermagem FOR UPDATE TO authenticated USING (is_member(auth.uid(), clinica_id));
CREATE POLICY te_delete ON public.triagens_enfermagem FOR DELETE TO authenticated USING (is_member(auth.uid(), clinica_id));

CREATE TRIGGER te_touch BEFORE UPDATE ON public.triagens_enfermagem
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();