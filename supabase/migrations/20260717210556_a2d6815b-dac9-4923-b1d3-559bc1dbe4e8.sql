WITH c AS (SELECT id FROM public.contratos_assinatura WHERE numero = 20260551)
UPDATE public.contrato_mensalidades m
SET vencimento = (DATE '2026-07-10' + ((m.numero_parcela - 1) || ' months')::interval)::date
FROM c
WHERE m.contrato_id = c.id AND m.numero_parcela BETWEEN 1 AND 12;