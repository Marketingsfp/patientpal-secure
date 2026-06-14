ALTER TABLE public.cb_beneficios ADD COLUMN IF NOT EXISTS valor_outros numeric;

ALTER TABLE public.cb_beneficios DROP CONSTRAINT IF EXISTS cb_beneficios_tipo_desconto_chk;
ALTER TABLE public.cb_beneficios ADD CONSTRAINT cb_beneficios_tipo_desconto_chk
  CHECK (tipo_desconto = ANY (ARRAY['percentual'::text, 'valor'::text, 'gratuidade'::text, 'valor_fixo'::text]));

-- Converte regras com valor de consulta R$9,99 (dinheiro) → preço fixo dinheiro 9,99 / outros 12,00
UPDATE public.cb_beneficios
SET tipo_desconto = 'valor_fixo',
    valor_desconto = 9.99,
    valor_outros = 12.00
WHERE convenio_id IN ('4fdce541-5b2b-4816-ba7d-911b36741b7d','36af070b-dad7-4013-b3e7-3ff343535c4f')
  AND tipo_desconto = 'valor'
  AND valor_desconto = 9.99;