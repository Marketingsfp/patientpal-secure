## Objetivo

Na tabela da Agenda (`src/routes/_authenticated/app.agenda.tsx`):

1. Desembolar as colunas **Alertas** e **Ações** — hoje os badges (Agendado / Pago) e os botões ($, check-in, ...) se acumulam num espaço apertado e quebram em duas linhas.
2. Manter um indicador visível de que o paciente **já fez check-in**, em vez de simplesmente sumir com o ícone verde.

## Mudanças

### 1. Coluna **Alertas** (mais larga, badges empilhados)

- Aumentar largura: `w-20` → `w-28`.
- Trocar `inline-flex ... flex-wrap` por `flex flex-col items-center gap-0.5` para empilhar verticalmente Status / Pago / Check-in sem quebra estranha.
- Adicionar novo badge persistente quando `etapaMap.get(a.id)` **não** está em `["aguardando_recepcao","recepcao"]` e o paciente não é "DISPONIVEL":
  - Texto: `Check-in OK` (ou `Em atendimento` / `No caixa` conforme etapa, usando um pequeno mapa).
  - Estilo: badge esmeralda com ícone `BadgeCheck` à esquerda (`bg-emerald-100 text-emerald-700 border-emerald-300`), para diferenciar do "Pago" sólido.

### 2. Coluna **Ações** (mais larga, ícones alinhados)

- Aumentar largura: `w-20` → `w-32` e usar `<div className="flex items-center justify-end gap-1">` envolvendo os 3 botões para garantir linha única.
- Padronizar tamanho dos botões: remover `px-2` extra, usar `size="icon"` consistente (`h-8 w-8`) e `rounded-md` em vez de `rounded-sm`.
- Quando o check-in **já foi feito** (etapa fora de aguardando/recepcao): manter o botão `BadgeCheck` no lugar, porém:
  - `disabled`, sem hover destrutivo;
  - estilo sólido esmeralda preenchido (`bg-emerald-600 text-white border-emerald-600`);
  - `title="Check-in já realizado"`.
- Assim o ícone **não some** — apenas muda de "contorno clicável" para "preenchido travado", deixando claro que está concluído.

### 3. Pequenos ajustes de respiro

- Aumentar a altura da linha de `h-7` para `h-9` (`[&>td]:h-9 [&>td]:py-1`) — hoje `h-7` força textos e badges a se sobreporem visualmente nas duas colunas finais.
- Manter `text-xs` para não estourar largura.

## Fora de escopo

- Sem mudanças em backend, queries, RLS ou no fluxo de check-in.
- Sem mexer nas demais colunas (Ficha, Dia, Profissional, Cliente, Pasta).
