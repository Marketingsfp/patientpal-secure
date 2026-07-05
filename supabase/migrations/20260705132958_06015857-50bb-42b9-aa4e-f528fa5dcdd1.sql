ALTER TABLE public.fin_atendimentos
  ADD COLUMN IF NOT EXISTS nfse_id uuid NULL
  REFERENCES public.nfse(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_fin_atendimentos_nfse_id
  ON public.fin_atendimentos(nfse_id)
  WHERE nfse_id IS NOT NULL;