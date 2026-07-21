## Objetivo
Aumentar a largura do campo **Cliente** na barra de filtros da Agenda, reduzindo os demais campos (Tipo de agenda, Situação, Data, Especialidade). O campo **Profissional** não será reduzido.

## Escopo
- Arquivo único: `src/routes/_authenticated/app.agenda.tsx`
- Bloco alterado: grid de filtros na linha 6566 (comentário "Linha 1: Filtros principais").
- Apenas ajuste visual / CSS de layout — nenhuma alteração de estado, lógica de busca, RPC ou banco.

## Clínica-alvo
Alteração **visual global** (todas as clínicas — SFP, Menino Jesus e Novo Rumo). Se preferir que valha apenas para uma clínica, me avise antes de aplicar que eu envelopo com feature flag.

## Antes
```
lg:grid-cols-6  → todos os 6 campos com a mesma largura (~16,6% cada)
Ordem: Profissional | Tipo agenda | Situação | Data | Especialidade | Cliente
```

## Depois
```
lg:grid-cols-8  → col-spans desiguais
Profissional  col-span-2   (~25% — não reduz, fica ligeiramente maior)
Tipo agenda   col-span-1   (~12,5%)
Situação      col-span-1   (~12,5%)
Data          col-span-1   (~12,5%)
Especialidade col-span-1   (~12,5%)
Cliente       col-span-2   (~25% — ganha ~50% de largura)
```
Nos breakpoints menores (`grid-cols-2 sm:grid-cols-3 md:grid-cols-4`) mantenho o comportamento atual (cada campo ocupa uma célula), para não quebrar mobile/tablet.

## Riscos e validação
- Risco baixo: mudança puramente de classes Tailwind no container.
- Validação: abrir `/app/agenda` em 1280×720 e 1920×1080, conferir alinhamento e que nada quebra em tablet/mobile.

## Pendências
- Confirmar se a mudança deve ser global ou restrita a uma clínica específica.
