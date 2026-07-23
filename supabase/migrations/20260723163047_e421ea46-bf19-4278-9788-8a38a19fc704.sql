ALTER TABLE public.cb_convenio_regras
  ADD COLUMN IF NOT EXISTS valor_cartao numeric,
  ADD COLUMN IF NOT EXISTS percentual_cartao numeric;

UPDATE public.cb_convenio_regras
   SET valor_cartao = valor
 WHERE valor_cartao IS NULL AND valor IS NOT NULL;

UPDATE public.cb_convenio_regras
   SET percentual_cartao = percentual
 WHERE percentual_cartao IS NULL AND percentual IS NOT NULL;

COMMENT ON COLUMN public.cb_convenio_regras.valor_cartao IS 'Valor fixo cobrado quando o pagamento é em cartão/PIX (não-dinheiro). Se nulo, cai no campo valor (dinheiro).';
COMMENT ON COLUMN public.cb_convenio_regras.percentual_cartao IS 'Percentual de desconto aplicado quando o pagamento é em cartão/PIX. Se nulo, cai no campo percentual (dinheiro).';