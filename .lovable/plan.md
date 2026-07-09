## Problema

Ao clicar em "Cobrar" num agendamento de **REVISÃO** (procedimento cadastrado sem valor / valor zero), o sistema abre o diálogo de forma de pagamento com todas as opções em R$ 0,00, e ao escolher uma forma abre o `LancamentoDialog` com `initialValor=""` (linha 3015 de `app.agenda.tsx`: `valorFinal > 0 ? valorFinal.toFixed(2) : ""`). O `LancamentoDialog.handleSave` então dispara `toast.error("Descrição e valor são obrigatórios")` (linha 255 de `lancamento-dialog.tsx`).

Ou seja, o fluxo de cobrança está sendo executado para um procedimento que **não deve ser cobrado**.

## Ajuste proposto

Interceptar o `cobrarAgendamento` em `src/routes/_authenticated/app.agenda.tsx` (por volta da linha 2944-2949, após calcular `opcoes`): quando o total de todas as formas de pagamento for **zero** e não houver orçamento vinculado (`opcoesOrc == null`), tratar como **atendimento sem cobrança** em vez de abrir o diálogo de forma de pagamento.

Nesse caso:

1. Inserir um `fin_lancamentos` com:
   - `tipo: "receita"`, `status: "confirmado"`, `valor: 0`
   - `descricao: "{paciente} — {procedimento} — SEM COBRANÇA"` (mantém a descrição automática já usada hoje)
   - `agendamento_id: a.id`, `clinica_id`, `data: hoje`
   - sem `forma_pagamento`
   
   Isso segue o mesmo padrão já usado no código para "linhas-sombra" de pagamentos agrupados (linhas 3865-3876), então não polui o caixa nem duplica receita, e ao mesmo tempo garante que o agendamento apareça como pago/quitado para as próximas checagens (`jaPagos` na linha 2919 e o `pagosSet`).

2. Atualizar `pagosSet` adicionando `a.id`.

3. Executar o mesmo avanço de fluxo que ocorre após um pagamento normal (auto check-in no mesmo dia → triagem), reusando o bloco de código existente em `onSavedWithData` (linhas 3887+). Extrair essa lógica para uma função local `avancarFluxoAposPagamento(ids: string[])` para reaproveitar sem duplicar.

4. Exibir um `toast.success("Revisão registrada sem cobrança.")` no lugar do fluxo de escolha de forma.

## Escopo do que NÃO muda

- Não altera `LancamentoDialog`, `criarAgendamento`, tabelas, RLS, ou orçamentos.
- Não muda o comportamento quando o procedimento tem valor > 0.
- Não muda o comportamento quando o agendamento vem de um orçamento (`opcoesOrc` continua mandando).
- Não muda o fluxo de convênio com gratuidade (o `descSuffix` já cuida disso, mas se `opcoes` também zerar para gratuidade, o mesmo atalho se aplica — o que é o comportamento correto).

## Arquivo tocado

- `src/routes/_authenticated/app.agenda.tsx` — 1 função nova (`avancarFluxoAposPagamento`) + short-circuit no `cobrarAgendamento`.
