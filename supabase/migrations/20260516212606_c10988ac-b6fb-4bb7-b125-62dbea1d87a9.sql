-- Separa colunas de preço de procedimentos por forma de pagamento
ALTER TABLE public.procedimentos
  ADD COLUMN IF NOT EXISTS valor_dinheiro numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_pix numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_cartao_credito numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS valor_cartao_debito numeric(12,2) NOT NULL DEFAULT 0;

-- Backfill: valores antigos viram base dos novos campos
UPDATE public.procedimentos
SET
  valor_dinheiro = COALESCE(NULLIF(valor_dinheiro,0), valor_dinheiro_pix, 0),
  valor_pix = COALESCE(NULLIF(valor_pix,0), valor_dinheiro_pix, 0),
  valor_cartao_credito = COALESCE(NULLIF(valor_cartao_credito,0), valor_cartao, 0),
  valor_cartao_debito = COALESCE(NULLIF(valor_cartao_debito,0), valor_cartao, 0)
WHERE TRUE;