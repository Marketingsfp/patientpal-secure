ALTER TABLE public.nina_teste_ciclos
  ADD COLUMN IF NOT EXISTS nina_session_id text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS end_reason text;

UPDATE public.nina_teste_ciclos SET started_at = created_at WHERE started_at IS DISTINCT FROM created_at;
UPDATE public.nina_teste_ciclos SET ended_at = resolved_at WHERE ended_at IS NULL AND resolved_at IS NOT NULL;

ALTER TABLE public.nina_teste_ciclos DROP CONSTRAINT IF EXISTS nina_teste_ciclos_status_check;
ALTER TABLE public.nina_teste_ciclos ADD CONSTRAINT nina_teste_ciclos_status_check
  CHECK (status = ANY (ARRAY['ativo','resolvido','encerrado_handoff','cancelado','falhou']));

CREATE UNIQUE INDEX IF NOT EXISTS nina_teste_ciclos_um_ativo_por_lead
  ON public.nina_teste_ciclos (lead_id) WHERE status = 'ativo';

CREATE INDEX IF NOT EXISTS nina_teste_ciclos_lead_started_idx
  ON public.nina_teste_ciclos (lead_id, started_at DESC);