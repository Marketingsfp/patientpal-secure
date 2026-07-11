## Objetivo

Compactar a tabela de Regras de Preço em `src/components/cartao-beneficios/regras-tab.tsx` para caber em 100% de zoom, sem alterar comportamento.

## Mudanças

1. **Tabela mais estreita** — remover `min-w-[1400px]` da `<Table>` e o `min-w-[200px]`/`min-w-[220px]` dos cabeçalhos. Deixar a tabela usar 100% da largura disponível.

2. **Especialidade (coluna)** — reduzir o `SearchableSelect` para largura fixa menor (`w-32`) com truncamento; placeholder passa a "Qualquer".

3. **Categoria (Tipo)** — trocar `SelectTrigger` de `w-36` para `w-24 h-8 text-xs`.

4. **Modo** — trocar `SelectTrigger` de `w-40` para `w-28 h-8 text-xs`.

5. **Valor / %** — alinhar consistente à direita:
   - `<TableHead>` já é `text-right`.
   - Reduzir CurrencyInput/Input para `w-24 h-8 text-right text-xs` e envolver a célula em `flex justify-end` para alinhar todos os campos (fixo e percentual) na mesma borda direita.

6. **Prioridade** — Input `w-14 h-8 text-xs` (era `w-16`).

7. **Carência (coluna e labels)** — abreviar rótulos:
   - Novo helper `carenciaShort(n)`: `0 → "Imediato"`, `n → "Após ${n}ª"`.
   - Usar no `SelectItem` da linha (mantém valores 0/1/2/3/6/12).
   - `SelectTrigger` passa de `w-40` para `w-24 h-8 text-xs`.
   - Filtro de topo (bar de filtros) também abrevia para "Após 1ª", "Após 2ª"… (mantém `CARENCIA_GROUPS` só para os values; label curto derivado do helper). Trigger do filtro reduz de `w-52` para `w-32`.

8. **Limite** — botão `h-7 text-[11px] px-2` (mais estreito) e texto sem alterações.

9. **Cabeçalhos** — manter estilo destacado atual; apenas remover `min-w-*` para permitir compactação.

## Escopo

- Somente `src/components/cartao-beneficios/regras-tab.tsx`.
- Sem mudanças em dados, filtros, ordenação, dialogs (Nova regra / Limite) nem no salvar.
