ALTER TABLE public.cb_convenio_regras
  ADD COLUMN IF NOT EXISTS procedimento_id uuid REFERENCES public.procedimentos(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_cb_convenio_regras_procedimento
  ON public.cb_convenio_regras (convenio_id, procedimento_id)
  WHERE procedimento_id IS NOT NULL;