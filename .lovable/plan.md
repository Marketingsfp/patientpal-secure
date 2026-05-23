## Objetivo

Ao abrir a tela `Agenda`, exibir apenas os agendamentos do dia atual. A faixa só deve mudar quando o usuário alterar manualmente a data ou desmarcar o filtro "Exibir apenas a data selecionada".

## Causa atual

Em `src/routes/_authenticated/app.agenda.tsx`:

- `dataRef` já inicia com hoje (linha 113).
- Porém `apenasData` inicia como `false` (linha 115).
- Por isso o `load()` (linhas 311–321) entra no ramo `else if (!statusEspecifico)` e busca de `dataRef` até `dataRef + 30 dias`, trazendo datas futuras como `17/06/2026` mesmo quando hoje é `23/05/2026`.

## Mudança

Arquivo: `src/routes/_authenticated/app.agenda.tsx`

- Linha 115: trocar `useState(false)` por `useState(true)` no estado `apenasData`.

Efeitos:

- Na primeira carga o ramo `if (apenasData)` é usado e a query fica restrita a `dataRef 00:00:00` até `dataRef 23:59:59` (somente hoje).
- O checkbox "Exibir apenas a data selecionada" passa a vir marcado por padrão.
- O usuário pode:
  - Mudar a data (`dataRef`) → recarrega para o novo dia.
  - Desmarcar o checkbox → volta ao comportamento de janela ampla.
- O `useEffect` em `load()` já depende de `dataRef`, `dataFim`, `apenasData` e `filtroStatus`, então nenhuma outra mudança é necessária.

Sem mudanças em backend, dados ou outras telas.
