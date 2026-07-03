## Objetivo
Adicionar sincronização em tempo real na tela do editor de prontuário (`app.atendimento-ia.$agendamentoId.tsx`) para que mudanças em pagamento, triagem e no próprio agendamento reflitam automaticamente, sem precisar recarregar a página.

## O que muda
Arquivo único: `src/routes/_authenticated/app.atendimento-ia.$agendamentoId.tsx`

Hoje o editor carrega uma vez (`useEffect` no mount) os dados de:
- `agendamentos` (etapa, status, procedimento)
- `triagens_enfermagem` (sinais vitais / queixa)
- status de pagamento via `agendamentoStatusPagamento` (consulta `fin_lancamentos` + `agendamento_orcamento_itens`)

Se o caixa registra pagamento, ou a enfermagem lança triagem, ou a recepção muda a etapa enquanto o médico já abriu o prontuário, nada atualiza até um F5.

## Como fazer
Usar o hook já existente `useRealtimeRefresh` (`src/hooks/use-realtime-refresh.ts`) escutando as tabelas relevantes e disparando a função que recarrega os dados do agendamento atual:

```ts
useRealtimeRefresh(
  ["agendamentos", "triagens_enfermagem", "fin_lancamentos", "agendamento_orcamento_itens"],
  carregarDados,
);
```

Onde `carregarDados` é o mesmo fetch já usado no mount, extraído (se ainda inline) para uma função reutilizável usando `useCallback`.

Notas técnicas:
- O hook filtra por tabela, não por linha — o refetch acontece em qualquer INSERT/UPDATE/DELETE. Como o editor lida com um único agendamento, a função de carga já filtra por `agendamentoId`, então o custo é baixo.
- Realtime precisa estar habilitado nessas tabelas na publicação `supabase_realtime`. Verificar via `supabase--read_query` antes de mergear; se alguma não estiver, adicionar em migration separada (fora do escopo desta tarefa se já estiverem — só reporto).
- Nada muda em `app.atendimento-ia.index.tsx` (fila), nem em auto-promoção de etapa, nem em UI. Apenas realtime no editor.

## Fora do escopo
- Restringir a fila (item 1)
- Corrigir auto-promoção `recepcao → atendimento` (item 2)
- Realtime na fila para badge de pagamento (item 4)
- Redirecionar exame (item 5)

## Validação
1. Abrir prontuário de um agendamento não pago em uma aba.
2. Em outra aba, registrar pagamento no caixa → banner de "Pendente" some sozinho.
3. Enfermagem lança triagem → card de sinais vitais aparece sem F5.
4. Recepção move etapa → estado interno atualiza.
