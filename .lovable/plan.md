## Problema

Ao tentar registrar um novo pagamento em um agendamento cujo pagamento anterior foi **estornado**, o sistema mostra "Este agendamento já possui um pagamento registrado." e bloqueia.

Causa: em `src/components/financeiro/lancamento-dialog.tsx` (linha ~327), a checagem `jaPago` consulta `fin_lancamentos` por `agendamento_id + tipo=receita` sem filtrar o `status`. Lançamentos estornados ficam com `status = 'cancelado'` (ver `app.financeiro.movimento.tsx` linha 305/356), então continuam sendo detectados como "pagamento existente".

## Correção

Em `src/components/financeiro/lancamento-dialog.tsx`, adicionar `.neq("status", "cancelado")` na query `jaPagoRes` para que apenas lançamentos ativos bloqueiem novo pagamento. Lançamentos estornados passam a permitir novo registro no mesmo agendamento.

Nenhuma outra alteração — apenas o filtro na consulta.