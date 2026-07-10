## Restaurar lançamento REVISAO (DERMATOLOGIA) — SEVERINA TERTO

Alvo: `fin_lancamentos.id = 658c8002-2b05-45dc-b3d0-9e645a35cbca` (ficha 002, agendamento `1951612f-9846-41af-8f4b-da5cdc6dca0d`), atualmente `status='cancelado'`, `repasse_pago=false`. Valor mantido em **R$ 0,01**.

### Ação (via ferramenta de atualização de dados)

Um único UPDATE em `fin_lancamentos`:

- `status` → `confirmado`
- `repasse_pago` → `true`
- `repasse_pago_em` → `2026-07-09`
- `repasse_forma_pagamento` → `Dinheiro`
- `repasse_conta_id` → `c4f7db58-3c38-4e0a-9e97-356c97d5aeee` (mesma conta usada no lançamento original)
- `updated_at` → `now()`

Também marco a solicitação de estorno correspondente como revertida para trilha de auditoria:

- Em `estorno_solicitacoes` id `03999650-71df-4e8a-b8da-189b6b2611d0`:
  - `status` → `revertido`
  - `resposta` → texto atual + " | Revertido a pedido do usuário em <hoje>"

O agendamento `1951612f` não precisa mudar (já está `status='agendado'`, sem executado_por/em — o pagamento em si não altera status médico).

O outro estorno (CONSULTA / ficha 006) fica como está — não foi solicitado.

### Depois
Recarregar a tela de Atendimentos / Repasse para confirmar que o item volta a aparecer como pago com repasse concluído.
