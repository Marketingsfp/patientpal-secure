## Objetivo
Reduzir tamanho de textos, cards e colunas em `/app/fluxo` para mostrar mais pacientes simultaneamente e melhorar a organização visual.

## Mudanças (apenas UI em `src/routes/_authenticated/app.fluxo.tsx`)

### Colunas
- `min-w-[220px]` → `min-w-[180px]`
- Gap entre colunas: `gap-3` → `gap-2`
- Badge de título da coluna em fonte menor (`text-[11px]`), e contador também menor
- Aumentar altura útil: `max-h-[70vh]` → `max-h-[78vh]`

### Cards de paciente
- Padding: `p-2.5` → `p-2`
- Texto base do card: `text-sm` → `text-xs`
- Espaçamento interno: `space-y-1.5` → `space-y-1`
- Nome do paciente: `font-medium leading-tight` em `text-[12px]` com `truncate` (uma linha só)
- Hora: `text-[10px]` ao invés de `text-xs`
- Linha "procedimento · médico": `text-[11px]` e `line-clamp-1` (em vez de 2)
- Badge de prioridade: já está `text-[10px]`; manter, mas reduzir padding (`px-1.5 py-0`)
- Botões: altura `h-7` → `h-6`, ícones `h-3 w-3`, texto `text-[11px]`, gap entre botões `gap-1` → `gap-0.5`

### Cabeçalho da página
- Reduzir respiro: `space-y-5` → `space-y-3`
- Subtítulo `text-sm` → `text-xs`

### Estado vazio
- `py-4` → `py-2` e `text-[11px]`

## Resultado esperado
Cards ~25% menores em altura, colunas mais estreitas (cabem 6 colunas confortáveis no viewport atual de 1075px), permitindo ver mais pacientes por coluna sem rolar.

Sem mudanças de lógica, banco ou comportamento — apenas refinamento visual.