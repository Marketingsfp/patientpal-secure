## Problema

No pagamento agrupado (Opções → pagar todos juntos na agenda), o `LancamentoDialog` cria **1 lançamento principal com o valor total** e insere **1 movimento no caixa** com esse valor total e a descrição concatenada dos 3 atendimentos.

Em seguida, o handler de agrupamento em `app.agenda.tsx` divide o lançamento principal em N lançamentos rateados (para permitir estorno individual), mas **não ajusta o caixa** — sobra 1 único movimento no caixa com o valor total e a descrição "3 SERVIÇOS".

## Correção

Em `src/routes/_authenticated/app.agenda.tsx`, dentro do bloco de pagamento agrupado (`onSavedWithData` quando `pagamentoExtraIds.length > 0`), após atualizar o principal e inserir os extras de `fin_lancamentos`, ajustar também `caixa_movimentos`:

1. Localizar o `caixa_movimento` criado pelo `LancamentoDialog` filtrando por `lancamento_id = principalRow.id`.
2. Atualizar esse movimento com `valor = valoresRat[0]` e `descricao` individualizada do principal (mesma descrição usada no principal: `PACIENTE — ROTULO (1/N do grupo)`).
3. Inserir N-1 novos `caixa_movimentos` — um para cada `extra` — copiando `sessao_id`, `clinica_id`, `user_id`, `forma_pagamento` do movimento principal, com `tipo = "recebimento"`, `valor = valoresRat[i+1]`, `descricao = PACIENTE — ROTULO (i+2/N do grupo)` e `lancamento_id` apontando para o `id` do respectivo lançamento extra recém-inserido (por isso a inserção dos extras precisa passar a usar `.select("id")` para devolver os ids).

O `LancamentoDialog` continua criando o movimento inicial normalmente — o ajuste é feito só no fluxo agrupado da agenda. Cobranças não agrupadas seguem intactas.

Nenhuma mudança em schema, RLS ou em outros arquivos.