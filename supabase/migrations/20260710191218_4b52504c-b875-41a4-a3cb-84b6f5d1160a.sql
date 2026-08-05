
-- Recalcular vencimentos: parcela N -> 2026-02-06 + (N-1) meses
UPDATE public.contrato_mensalidades
SET vencimento = (DATE '2026-02-06' + ((numero_parcela - 1) || ' months')::interval)::date,
    updated_at = now()
WHERE contrato_id = '9cf00f18-94c7-48d3-876b-de108696986f';

-- Marcar parcelas 1..5 como pagas (pago_em = vencimento)
UPDATE public.contrato_mensalidades
SET status = 'pago',
    valor_pago = valor,
    forma_pagamento = COALESCE(forma_pagamento, 'dinheiro'),
    pago_em = vencimento,
    updated_at = now()
WHERE contrato_id = '9cf00f18-94c7-48d3-876b-de108696986f'
  AND numero_parcela BETWEEN 1 AND 5;

-- Parcela 6 paga em 07/07/2026
UPDATE public.contrato_mensalidades
SET status = 'pago',
    valor_pago = valor,
    forma_pagamento = COALESCE(forma_pagamento, 'dinheiro'),
    pago_em = DATE '2026-07-07',
    updated_at = now()
WHERE contrato_id = '9cf00f18-94c7-48d3-876b-de108696986f'
  AND numero_parcela = 6;
