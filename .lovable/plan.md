## Objetivo
Na tela `/app/fluxo`, ordenar os cards dentro de cada coluna por **nível de prioridade** (mais crítico no topo) e, em caso de empate, pelo horário de início.

## Ordem desejada
1. `urgente` (topo)
2. `prioritario`
3. `normal` (base)

Dentro do mesmo nível: `inicio` ascendente (como já é hoje).

## Alteração
Arquivo único: `src/routes/_authenticated/app.fluxo.tsx`

No `useMemo` `colunas`, após distribuir cada `Ag` na sua etapa, ordenar cada lista:

```ts
const peso = { urgente: 0, prioritario: 1, normal: 2 } as const;
for (const [, lista] of m) {
  lista.sort((a, b) => {
    const pa = peso[a.prioridade ?? "normal"];
    const pb = peso[b.prioridade ?? "normal"];
    if (pa !== pb) return pa - pb;
    return a.inicio.localeCompare(b.inicio);
  });
}
```

## Escopo
- Nenhuma mudança em banco, RLS ou outras telas.
- Nenhuma alteração de layout/visual — só a ordem dos cards.
- Efeito imediato ao clicar no botão de prioridade (já está com atualização otimista).