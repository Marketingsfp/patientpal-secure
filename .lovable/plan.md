## Objetivo
Mostrar, na Fila de atendimento do médico, um indicador claro de pagamento (pago/pendente) para cada paciente.

## O que muda

Na página `src/routes/_authenticated/app.atendimento-ia.index.tsx` (Fila de atendimento):

1. Nova coluna **"Pagamento"** na tabela, entre "Serviço" e "Triagem":
   - Pago no caixa → badge verde "Pago" (com tooltip "Pago no caixa")
   - Pago via orçamento → badge azul "Pago (orçamento)"
   - Pendente → badge âmbar "Pendente" com ícone de alerta
   - Carregando → traço "—"

2. Linha do paciente pendente ganha faixa lateral âmbar sutil (`border-l-4 border-amber-400`) e o botão **Atender** fica desabilitado com tooltip "Pagamento pendente — envie ao caixa antes do atendimento", coerente com a regra já aplicada no editor de atendimento.

3. Recarrega o status em tempo real:
   - `agendamentosStatusPagamento(ids)` é chamado sempre que a fila muda
   - Realtime já escuta `agendamentos`; adicionar assinatura para `fin_lancamentos` e `agendamento_orcamento_itens` para atualizar o badge assim que o caixa recebe o pagamento

## Detalhes técnicos

- Usar `agendamentosStatusPagamento` de `src/lib/pagamento-status.ts` (retorna `{ pago, motivo }` em lote — já é a fonte de verdade usada no editor).
- Adicionar `useState<Record<string, StatusPagamento>>` para o mapa e um `useEffect` disparado por `filaIdsKey`, no mesmo padrão do carregamento de triagens.
- Estender o canal realtime existente com dois `on("postgres_changes")` extras para `fin_lancamentos` e `agendamento_orcamento_itens` que apenas re-executam o fetch de pagamentos (sem recarregar a fila inteira).
- Nenhuma alteração de schema, RLS ou server function.

## Fora do escopo

- Não altera a fila da recepção nem outras telas.
- Não muda ordenação da fila (paciente pago não "pula" fila).