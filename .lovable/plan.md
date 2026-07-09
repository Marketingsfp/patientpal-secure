## Diagnóstico

O erro vem da constraint do banco `ux_fin_lancamentos_agendamento_receita`.

Hoje ela impede mais de um lançamento de receita para o mesmo `agendamento_id`, mesmo quando o lançamento anterior foi **estornado/cancelado**. Por isso, ao reutilizar um slot/agendamento que já teve pagamento estornado, o sistema ainda bloqueia o novo pagamento com “Já existe um registro com esses dados”.

## Correção

Criar uma migration para trocar o índice único atual por um índice parcial que só bloqueia receitas **ativas/confirmadas**, ignorando lançamentos cancelados/estornados:

1. Remover o índice atual `ux_fin_lancamentos_agendamento_receita`.
2. Recriar o índice com filtro incluindo `status <> 'cancelado'`.
3. Manter a proteção contra pagamento duplicado ativo no mesmo agendamento.
4. Permitir novo pagamento quando o pagamento anterior estiver cancelado por estorno.

## Resultado esperado

Quando um agendamento for desmarcado e/ou tiver o pagamento estornado, o slot poderá ser reutilizado para outro paciente e o novo pagamento será salvo normalmente.