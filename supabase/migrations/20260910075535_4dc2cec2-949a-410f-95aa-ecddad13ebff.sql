ALTER TABLE public.nina_confianca_decisoes
  ADD COLUMN IF NOT EXISTS handoff_decision text,
  ADD COLUMN IF NOT EXISTS handoff_reason text,
  ADD COLUMN IF NOT EXISTS handoff_ocorreu boolean;