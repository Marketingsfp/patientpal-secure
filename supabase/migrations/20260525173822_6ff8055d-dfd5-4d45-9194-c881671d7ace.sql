ALTER TABLE public.cb_convenios
  ADD COLUMN IF NOT EXISTS valor_mensal numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxa_adesao numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS num_parcelas integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS max_dependentes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fidelidade_meses integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vigencia_meses integer NOT NULL DEFAULT 12,
  ADD COLUMN IF NOT EXISTS beneficios text,
  ADD COLUMN IF NOT EXISTS modelo_contrato text;