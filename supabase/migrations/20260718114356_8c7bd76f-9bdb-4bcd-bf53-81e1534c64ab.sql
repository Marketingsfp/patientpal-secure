ALTER TABLE public.contratos_assinatura
  ADD COLUMN IF NOT EXISTS sem_carencia boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sem_carencia_motivo text,
  ADD COLUMN IF NOT EXISTS sem_carencia_por uuid,
  ADD COLUMN IF NOT EXISTS sem_carencia_em timestamptz;