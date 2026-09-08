ALTER TABLE public.nina_feedback_erros
  ADD COLUMN IF NOT EXISTS ambiente text NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS nina_session_id text;

ALTER TABLE public.nina_feedback_erros
  DROP CONSTRAINT IF EXISTS nina_feedback_erros_ambiente_check;

ALTER TABLE public.nina_feedback_erros
  ADD CONSTRAINT nina_feedback_erros_ambiente_check
  CHECK (ambiente IN ('production', 'homologation', 'automated_test'));

CREATE INDEX IF NOT EXISTS nina_feedback_erros_ambiente_idx
  ON public.nina_feedback_erros (clinica_id, ambiente, created_at DESC);