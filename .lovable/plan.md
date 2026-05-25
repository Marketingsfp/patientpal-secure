## Objetivo
Em cada subpágina de "Cartão Benefícios", mostrar apenas a aba correspondente à página atual (em vez das três abas sempre visíveis).

## Mudança
Arquivo: `src/routes/_authenticated/app.cartao-beneficios.tsx`

No `CartaoBeneficiosLayout`, filtrar o array `tabs` para renderizar somente a aba cuja rota corresponde ao `loc.pathname` atual:

- `/app/cartao-beneficios/contratos` → mostra só "Novo contrato"
- `/app/cartao-beneficios/modelos` → mostra só "Modelo de contrato"
- `/app/cartao-beneficios/relatorios` → mostra só "Relatórios"

A aba ativa continua estilizada como ativa (borda inferior primary). O cabeçalho com ícone e título "Cartão Benefícios" permanece. Nenhuma outra alteração de comportamento ou navegação.
