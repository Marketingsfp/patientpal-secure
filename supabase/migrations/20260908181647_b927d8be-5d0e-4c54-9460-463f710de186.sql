ALTER TABLE public.nina_confianca_decisoes
  ADD COLUMN IF NOT EXISTS evidence_coverage integer,
  ADD COLUMN IF NOT EXISTS conflitos jsonb;