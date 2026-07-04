# Sincronizar sinal de triagem — Atendimento médico × Fluxo do paciente

## Problema

Na aba **Atendimento médico**, a coluna "Triagem" da fila mostra ✓ (verde) apenas quando existe um registro na tabela `triagens_enfermagem` para o agendamento. Já a aba **Fluxo do paciente** trata a triagem como concluída sempre que o paciente avançou da coluna "Triagem" para "Atendimento" (independentemente de existir ou não formulário de triagem preenchido).

Resultado: pacientes que a recepção/enfermagem moveram para "Atendimento" no fluxo aparecem com ✗ vermelho ("Triagem pendente") na aba Atendimento médico — as duas telas ficam contando coisas diferentes.

## O que ajustar

Na aba **Atendimento médico** (`src/routes/_authenticated/app.atendimento-ia.index.tsx`), passar a considerar a triagem como **concluída** quando **qualquer uma** das condições for verdadeira:

1. Existe um registro em `triagens_enfermagem` para o agendamento (comportamento atual), **ou**
2. O paciente já está na etapa `atendimento` do fluxo (ou seja, ultrapassou a coluna "Triagem" no Fluxo do paciente).

Para as etapas anteriores (`aguardando_recepcao`, `recepcao`, `caixa`, `triagem`) sem registro de triagem, continua exibindo ✗ "Triagem pendente".

## Detalhes técnicos

- Introduzir helper `triagemFeita(it)` que retorna `true` se `triagens[it.id]` existir **ou** `it.fluxo_etapa === "atendimento"`.
- Usar esse helper na célula da coluna Triagem (ícone Check/X + tooltip).
- Manter o HoverCard de prioridade exibindo os dados de `triagens[it.id]` quando existir; quando o paciente está em `atendimento` sem registro formal, mostrar mensagem "Paciente avançou sem registro de triagem no sistema."
- Nenhuma mudança de schema, RLS ou lógica de backend. Apenas frontend, na tela de Atendimento médico.

## Fora de escopo

- Não alterar a aba Fluxo do paciente nem a aba Triagem de enfermagem.
- Não criar registros retroativos em `triagens_enfermagem`.
- Não mexer nos dados de teste (`[TESTE FLUXO 2]`).
