## Problema

Em `recalcularParcelasAbertas` (`src/routes/_authenticated/app.contratos.tsx`), a busca da faixa é:

```ts
faixas.find(fx => totalVidas >= fx.vidas_de && (fx.vidas_ate == null || totalVidas <= fx.vidas_ate))
```

Quando todas as faixas do convênio são abertas (`vidas_ate = NULL` — modelo "1+", "2+", "3+"…), qualquer total ≥ 1 satisfaz a condição da primeira faixa, então sempre cai em "1 pessoa" e o valor nunca sobe.

No contrato da Ednalda (3 vidas: titular + 2 dependentes) o valor ficou em R$ 120 quando deveria ser R$ 210 (faixa "3+").

## Correção

Trocar `find` por uma seleção da faixa mais específica:

1. Filtrar faixas elegíveis: `totalVidas >= vidas_de && (vidas_ate == null || totalVidas <= vidas_ate)`.
2. Entre as elegíveis, escolher a de maior `vidas_de` (faixa mais alta aplicável). Isso funciona tanto para faixas fechadas (1–2, 3–4, …) quanto abertas (1+, 2+, 3+, …).

Aplicar a mesma lógica também em `faixaAtual` (linha ~723), que hoje compara só por valor — assim o seletor de faixa do formulário de venda exibe corretamente a faixa atual.

## Correção retroativa

Após a fix, recalcular o contrato da Ednalda (id `5e6e9c0c…`) atualizando `valor_mensal` para 210 e as 12 parcelas pendentes para R$ 210.

## Arquivos

- `src/routes/_authenticated/app.contratos.tsx` — ajustar seleção da faixa em `recalcularParcelasAbertas` e em `faixaAtual`.
- Migração de dados (insert) para corrigir o contrato existente já afetado.