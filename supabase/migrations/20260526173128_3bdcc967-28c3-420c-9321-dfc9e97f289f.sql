ALTER TABLE public.contratos_assinatura
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelamento_motivo text;