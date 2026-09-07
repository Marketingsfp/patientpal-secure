ALTER TABLE public.nina_teste_ciclos ADD COLUMN IF NOT EXISTS memory_reset_at timestamptz;
UPDATE public.nina_teste_ciclos SET memory_reset_at = COALESCE(ended_at, resolved_at) WHERE memory_reset_at IS NULL AND status <> 'ativo';
CREATE INDEX IF NOT EXISTS nina_teste_ciclos_lead_started_idx ON public.nina_teste_ciclos (lead_id, started_at DESC);