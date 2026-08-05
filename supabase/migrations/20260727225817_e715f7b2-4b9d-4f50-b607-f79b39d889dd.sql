ALTER TABLE public.orcamento_itens
  ADD COLUMN IF NOT EXISTS sinal_valor numeric,
  ADD COLUMN IF NOT EXISTS valor_pago numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sinal_pago_em timestamptz,
  ADD COLUMN IF NOT EXISTS saldo_pago_em timestamptz;

ALTER TABLE public.orcamento_itens
  DROP CONSTRAINT IF EXISTS orcamento_itens_status_fin_chk;

ALTER TABLE public.orcamento_itens
  ADD CONSTRAINT orcamento_itens_status_fin_chk
  CHECK (status_financeiro = ANY (ARRAY['pendente'::text, 'parcial'::text, 'pago'::text, 'estornado'::text, 'isento'::text, 'nao_aplicavel'::text]));

ALTER TABLE public.orcamento_itens
  ADD CONSTRAINT orcamento_itens_sinal_valor_chk
  CHECK (sinal_valor IS NULL OR (sinal_valor > 0 AND sinal_valor <= valor_total));

COMMENT ON COLUMN public.orcamento_itens.sinal_valor IS 'Valor da entrada (sinal) em R$. NULL = item sem parcelamento (pagamento unico).';
COMMENT ON COLUMN public.orcamento_itens.valor_pago IS 'Total ja recebido do item (sinal + saldo).';