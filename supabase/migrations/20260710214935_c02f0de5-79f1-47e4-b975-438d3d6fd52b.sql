DELETE FROM public.caixa_movimentos
WHERE sessao_id='94b0dc10-4236-44e3-aed8-4f524e1eb43a'
  AND descricao='AJUSTE DE TESTE — devolução de saldo acumulado de sessões de teste (solicitado pelo operador)';

INSERT INTO public.caixa_movimentos (sessao_id, clinica_id, user_id, tipo, valor, descricao, forma_pagamento)
SELECT id, clinica_id, user_id, 'sangria', 976.00,
       'AJUSTE DE TESTE — saldo remanescente das sessões de teste zerado a pedido do operador',
       'dinheiro'
FROM public.caixa_sessoes
WHERE id='fd202fff-e8d4-4b63-a6e3-c0392d310c5d';