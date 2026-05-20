ALTER TABLE public.fin_atendimentos
  ADD COLUMN IF NOT EXISTS repasse_pago boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS repasse_pago_em date,
  ADD COLUMN IF NOT EXISTS repasse_forma_pagamento text,
  ADD COLUMN IF NOT EXISTS repasse_conta_id uuid,
  ADD COLUMN IF NOT EXISTS repasse_pago_por uuid,
  ADD COLUMN IF NOT EXISTS repasse_lancamento_id uuid;

ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS repasse_pago boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS repasse_pago_em date,
  ADD COLUMN IF NOT EXISTS repasse_forma_pagamento text,
  ADD COLUMN IF NOT EXISTS repasse_conta_id uuid,
  ADD COLUMN IF NOT EXISTS repasse_pago_por uuid,
  ADD COLUMN IF NOT EXISTS repasse_lancamento_id uuid;

CREATE INDEX IF NOT EXISTS idx_fin_atend_repasse_pago ON public.fin_atendimentos(clinica_id, medico_id, repasse_pago);
CREATE INDEX IF NOT EXISTS idx_fin_lanc_repasse_pago ON public.fin_lancamentos(clinica_id, medico_id, repasse_pago);