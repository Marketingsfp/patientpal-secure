ALTER TABLE public.medicos
  ADD COLUMN IF NOT EXISTS cb_tipo_repasse text,
  ADD COLUMN IF NOT EXISTS cb_percentual_repasse numeric,
  ADD COLUMN IF NOT EXISTS cb_valor_repasse numeric;