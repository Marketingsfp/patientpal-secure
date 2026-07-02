
## Objetivo
Deixar as colunas da tela `/app/fluxo` visualmente mais respiráveis, com margens, paddings e bordas consistentes entre si e com o restante do app.

## Situação atual
Em `src/routes/_authenticated/app.fluxo.tsx`:
- O container das colunas usa `flex gap-2` — colunas praticamente coladas.
- Cada coluna é uma `div` sem borda/fundo próprio; só o badge do título aparece flutuando.
- Os cards usam `Card` com `p-2` e `space-y-1.5` entre eles, sem separação visual da coluna.
- Cabeçalho da coluna (badge + contador) fica solto, sem alinhamento com o corpo.
- Estado "vazio" é um retângulo tracejado fino sem altura mínima.

## Mudanças propostas (apenas visuais, em `app.fluxo.tsx`)

1. **Container das colunas**
   - Trocar `gap-2` por `gap-3` para separar visualmente as colunas.
   - Manter `overflow-x-auto` e `snap-x`.

2. **Coluna (wrapper de cada etapa)**
   - Envolver cada coluna em um bloco com:
     - `rounded-lg border bg-muted/30`
     - `p-2` (padding interno uniforme)
     - `min-w-[210px]` (um pouco mais larga para o card respirar)
     - `flex flex-col`
   - Cabeçalho da coluna dentro desse bloco com `px-1 pb-2 border-b border-border/60 mb-2` para separar do corpo.

3. **Lista de cards dentro da coluna**
   - `space-y-2` (em vez de `space-y-1.5`) para dar respiro entre cards.
   - Manter `max-h-[78vh] overflow-auto`, com `pr-1` para não colar a scrollbar.

4. **Card do paciente**
   - Subir padding para `p-2.5` e `space-y-1.5`.
   - Adicionar `border border-border/70 shadow-sm hover:shadow-md hover:border-border transition-colors` para dar profundidade sutil e feedback ao passar o mouse.
   - Faixa lateral de prioridade: `border-l-2` colorida conforme prioridade (`border-l-rose-500` urgente, `border-l-amber-500` prioritário, `border-l-transparent` normal) para reforçar hierarquia sem poluir.

5. **Estado vazio**
   - `text-[11px] text-muted-foreground text-center py-4 border border-dashed rounded-md bg-background/40` para parecer intencional, não um resto de layout.

6. **Barra de ações do card**
   - Trocar `gap-0.5 pt-0.5` por `gap-1 pt-1` e adicionar `border-t border-border/50 -mx-2.5 px-2.5 mt-1 pt-1.5` para separar ações do conteúdo do card.

## Fora de escopo
- Nenhuma mudança de lógica (ordenação por prioridade, realtime, handlers de etapa/chamada/prioridade permanecem iguais).
- Nenhuma alteração em tokens globais (`src/styles.css`) — só classes utilitárias já existentes.

## Arquivos afetados
- `src/routes/_authenticated/app.fluxo.tsx` (apenas JSX/classes).
