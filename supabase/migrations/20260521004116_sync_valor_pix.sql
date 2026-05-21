-- Sincroniza valor_pix com valor do cartão (regra: pix = débito = crédito)
UPDATE public.procedimentos
SET valor_pix = COALESCE(NULLIF(valor_cartao_credito,0), NULLIF(valor_cartao_debito,0), valor_pix)
WHERE COALESCE(valor_cartao_credito,0) > 0
  AND valor_pix IS DISTINCT FROM valor_cartao_credito;
