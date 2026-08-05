UPDATE public.contrato_mensalidades SET vencimento = (DATE '2025-06-10' + (numero_parcela || ' months')::interval)::date
WHERE contrato_id = (SELECT id FROM public.contratos_assinatura WHERE numero = 20260915)
  AND numero_parcela BETWEEN 1 AND 12;