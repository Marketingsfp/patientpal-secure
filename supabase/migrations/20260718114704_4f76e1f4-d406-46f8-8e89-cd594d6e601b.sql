ALTER TABLE public.contratos_assinatura
  ADD COLUMN IF NOT EXISTS sem_carencia BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sem_carencia_motivo TEXT,
  ADD COLUMN IF NOT EXISTS sem_carencia_por UUID,
  ADD COLUMN IF NOT EXISTS sem_carencia_em TIMESTAMPTZ;