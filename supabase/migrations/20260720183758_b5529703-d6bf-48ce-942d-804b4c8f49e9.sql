CREATE TABLE IF NOT EXISTS public.clima_diario (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinica_id UUID NOT NULL REFERENCES public.clinicas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  choveu BOOLEAN NOT NULL DEFAULT false,
  precipitacao_mm NUMERIC(6,1),
  temp_max NUMERIC(4,1),
  temp_min NUMERIC(4,1),
  weather_code INT,
  fonte TEXT NOT NULL DEFAULT 'open-meteo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinica_id, data)
);

CREATE INDEX IF NOT EXISTS idx_clima_diario_clinica_data ON public.clima_diario(clinica_id, data);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.clima_diario TO authenticated;
GRANT ALL ON public.clima_diario TO service_role;

ALTER TABLE public.clima_diario ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "clima_diario_select" ON public.clima_diario;
CREATE POLICY "clima_diario_select" ON public.clima_diario FOR SELECT TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));

DROP POLICY IF EXISTS "clima_diario_insert" ON public.clima_diario;
CREATE POLICY "clima_diario_insert" ON public.clima_diario FOR INSERT TO authenticated
  WITH CHECK (public.is_member(auth.uid(), clinica_id));

DROP POLICY IF EXISTS "clima_diario_update" ON public.clima_diario;
CREATE POLICY "clima_diario_update" ON public.clima_diario FOR UPDATE TO authenticated
  USING (public.is_member(auth.uid(), clinica_id))
  WITH CHECK (public.is_member(auth.uid(), clinica_id));

DROP POLICY IF EXISTS "clima_diario_delete" ON public.clima_diario;
CREATE POLICY "clima_diario_delete" ON public.clima_diario FOR DELETE TO authenticated
  USING (public.is_member(auth.uid(), clinica_id));