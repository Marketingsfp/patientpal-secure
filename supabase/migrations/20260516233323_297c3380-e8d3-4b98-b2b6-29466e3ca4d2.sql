
CREATE TABLE public.medico_convenios (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  medico_id uuid NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  nome text NOT NULL,
  tipo_repasse text NOT NULL DEFAULT 'percentual' CHECK (tipo_repasse IN ('percentual','valor')),
  percentual numeric(5,2) DEFAULT 0,
  valor numeric(12,2),
  ativo boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_medico_convenios_medico ON public.medico_convenios(medico_id);

ALTER TABLE public.medico_convenios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Membros podem ver convenios dos medicos da clinica"
ON public.medico_convenios FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.medicos m WHERE m.id = medico_convenios.medico_id AND public.is_member(auth.uid(), m.clinica_id)));

CREATE POLICY "Gestores podem gerenciar convenios"
ON public.medico_convenios FOR ALL TO authenticated
USING (EXISTS (SELECT 1 FROM public.medicos m WHERE m.id = medico_convenios.medico_id AND public.can_manage_clinica(auth.uid(), m.clinica_id)))
WITH CHECK (EXISTS (SELECT 1 FROM public.medicos m WHERE m.id = medico_convenios.medico_id AND public.can_manage_clinica(auth.uid(), m.clinica_id)));

CREATE TRIGGER tg_medico_convenios_updated BEFORE UPDATE ON public.medico_convenios
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
