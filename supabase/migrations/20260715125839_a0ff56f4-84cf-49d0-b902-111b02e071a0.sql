
UPDATE public.caixa_movimentos
SET tipo = 'estorno'
WHERE tipo = 'sangria'
  AND lower(coalesce(descricao, '')) LIKE 'estorno%';
