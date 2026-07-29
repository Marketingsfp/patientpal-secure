## Objetivo

Na tela **Financeiro → Atendimentos**, as linhas de atendimentos externos devem aparecer com fundo vermelho bem claro.

## Situação atual (verificada)

- A tabela é renderizada em `src/routes/_authenticated/app.financeiro.atendimentos.tsx` (linhas ~2607-2624).
- A cor da linha hoje é decidida pela variável `rowBg`: âmbar quando selecionada e pendente, senão zebrado (`bg-background` / `bg-slate-50 dark:bg-slate-900/40`).
- Atendimentos externos são gravados em `fin_atendimentos` com `forma_pagamento = "externo"` (ver `src/lib/agenda/atendimento-externo.functions.ts`), e esse campo já vem no `select` e é mapeado no item (`forma_pagamento`), tanto na origem `manual` quanto na de agenda.

## O que será feito

1. No cálculo de `rowBg`, adicionar a detecção de externo: `a.forma_pagamento === "externo"` (comparação sem diferenciar maiúsculas/acentos).
2. Precedência: seleção pendente (âmbar) continua vencendo; logo abaixo entra o vermelho claro, e só depois o zebrado padrão.
3. Cor: `bg-rose-50 dark:bg-rose-950/30`, mantendo o `hover:bg-muted/30` e a coluna fixa acompanhando (a variável `rowBg` já é usada pela célula fixa, então o destaque fica consistente na linha inteira).

## Detalhes técnicos

- Mudança puramente visual, num único arquivo, sem alteração de consulta, banco ou regra de negócio.
- Se houver células com fundo próprio dentro da linha que quebrem o tom, elas reutilizam `rowBg` — verificarei durante a implementação para o vermelho cobrir a linha completa.
