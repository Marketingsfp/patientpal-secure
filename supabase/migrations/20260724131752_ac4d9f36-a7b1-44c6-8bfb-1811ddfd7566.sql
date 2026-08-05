ALTER TABLE public.cb_convenio_regras ADD COLUMN valor_outros numeric(12,2);

COMMENT ON COLUMN public.cb_convenio_regras.valor_outros IS
  'Valor cobrado em Pix/débito/crédito quando difere do valor em dinheiro (coluna "valor"). Nulo = usa "valor" para ambos (com acréscimo global do convênio, se configurado).';