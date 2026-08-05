ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS repasse_pago_at timestamptz;
ALTER TABLE public.fin_atendimentos ADD COLUMN IF NOT EXISTS repasse_pago_at timestamptz;
UPDATE public.fin_lancamentos SET repasse_pago_at = repasse_pago_em::timestamptz WHERE repasse_pago = true AND repasse_pago_at IS NULL AND repasse_pago_em IS NOT NULL;
UPDATE public.fin_atendimentos SET repasse_pago_at = repasse_pago_em::timestamptz WHERE repasse_pago = true AND repasse_pago_at IS NULL AND repasse_pago_em IS NOT NULL;