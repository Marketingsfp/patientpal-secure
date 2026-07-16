ALTER TABLE public.fin_lancamentos
  ADD COLUMN IF NOT EXISTS autorizacao_cartao text,
  ADD COLUMN IF NOT EXISTS valor_liquido_cartao numeric(14,2),
  ADD COLUMN IF NOT EXISTS data_cartao date;