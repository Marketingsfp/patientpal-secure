CREATE TABLE public.medico_procedimentos (
  medico_id uuid NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  procedimento_id uuid NOT NULL REFERENCES public.procedimentos(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (medico_id, procedimento_id)
);

CREATE INDEX idx_medico_proc_medico ON public.medico_procedimentos(medico_id);
CREATE INDEX idx_medico_proc_proc ON public.medico_procedimentos(procedimento_id);

ALTER TABLE public.medico_procedimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "medico_proc_select" ON public.medico_procedimentos
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.medicos m WHERE m.id = medico_procedimentos.medico_id AND is_member(auth.uid(), m.clinica_id)));

CREATE POLICY "medico_proc_insert" ON public.medico_procedimentos
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.medicos m WHERE m.id = medico_procedimentos.medico_id AND can_manage_clinica(auth.uid(), m.clinica_id)));

CREATE POLICY "medico_proc_delete" ON public.medico_procedimentos
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.medicos m WHERE m.id = medico_procedimentos.medico_id AND can_manage_clinica(auth.uid(), m.clinica_id)));

GRANT SELECT, INSERT, DELETE ON public.medico_procedimentos TO authenticated;