
-- 1) Repasse: tipo (percentual/valor) e valor fixo opcional
ALTER TABLE public.medicos
  ADD COLUMN IF NOT EXISTS tipo_repasse text NOT NULL DEFAULT 'percentual'
    CHECK (tipo_repasse IN ('percentual','valor')),
  ADD COLUMN IF NOT EXISTS valor_repasse_padrao numeric(12,2);

-- Relaxar constraint antiga (permitir 0 quando for valor)
ALTER TABLE public.medicos DROP CONSTRAINT IF EXISTS medicos_repasse_range;
ALTER TABLE public.medicos
  ADD CONSTRAINT medicos_repasse_range
  CHECK (percentual_repasse_padrao >= 0 AND percentual_repasse_padrao <= 100);

-- 2) Junction table: médicos x especialidades (N:N)
CREATE TABLE IF NOT EXISTS public.medico_especialidades (
  medico_id uuid NOT NULL REFERENCES public.medicos(id) ON DELETE CASCADE,
  especialidade_id uuid NOT NULL REFERENCES public.especialidades(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (medico_id, especialidade_id)
);

CREATE INDEX IF NOT EXISTS idx_medico_esp_medico ON public.medico_especialidades(medico_id);
CREATE INDEX IF NOT EXISTS idx_medico_esp_esp ON public.medico_especialidades(especialidade_id);

ALTER TABLE public.medico_especialidades ENABLE ROW LEVEL SECURITY;

CREATE POLICY "medico_esp_select" ON public.medico_especialidades
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.medicos m
    WHERE m.id = medico_id AND is_member(auth.uid(), m.clinica_id)));

CREATE POLICY "medico_esp_insert" ON public.medico_especialidades
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.medicos m
    WHERE m.id = medico_id AND can_manage_clinica(auth.uid(), m.clinica_id)));

CREATE POLICY "medico_esp_delete" ON public.medico_especialidades
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.medicos m
    WHERE m.id = medico_id AND can_manage_clinica(auth.uid(), m.clinica_id)));

-- Migrar especialidade_id existente para a junção
INSERT INTO public.medico_especialidades (medico_id, especialidade_id)
SELECT id, especialidade_id FROM public.medicos
WHERE especialidade_id IS NOT NULL
ON CONFLICT DO NOTHING;
