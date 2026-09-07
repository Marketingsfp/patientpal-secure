ALTER TABLE public.nina_confianca_decisoes
  ADD COLUMN IF NOT EXISTS modo text NOT NULL DEFAULT 'shadow',
  ADD COLUMN IF NOT EXISTS teria_permitido boolean;

CREATE INDEX IF NOT EXISTS idx_nina_confianca_decisoes_modo
  ON public.nina_confianca_decisoes (clinica_id, modo, created_at DESC);