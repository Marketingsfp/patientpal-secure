ALTER TABLE public.atend_conversas
  ADD COLUMN IF NOT EXISTS identidade_confirmada boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS identidade_perguntada_em timestamptz,
  ADD COLUMN IF NOT EXISTS identidade_tentativas integer NOT NULL DEFAULT 0;