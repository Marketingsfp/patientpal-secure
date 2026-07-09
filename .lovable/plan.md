## Objetivo

Deixar visualmente óbvio, na coluna **Ações**, quais atendimentos ainda precisam de baixa e quais já foram baixados — e também sinalizar quais estão marcados para baixa em lote.

## Estados visuais do botão "Dar baixa"

Substituir o atual botão fantasma (ícone verde discreto que só aparece quando pendente) por um **botão-pílula pequeno** sempre visível, com 3 estados:

| Estado | Condição | Visual |
|---|---|---|
| **Pendente** | `!repasse_pago && status !== "realizado"` | Fundo amarelo (`bg-amber-100 text-amber-800 border-amber-300`) + ícone `Clock` + texto "Baixar" |
| **Selecionado p/ baixa em lote** | pendente **E** linha marcada no checkbox | Fundo amarelo mais forte (`bg-amber-500 text-white`) + ícone `CheckCircle2` preenchido + anel (`ring-2 ring-amber-600`) — indica "vai ser baixado ao clicar em Pagar repasse" |
| **Baixado** | `repasse_pago \|\| status === "realizado"` | Fundo verde (`bg-emerald-100 text-emerald-800 border-emerald-300`) + ícone `CheckCircle2` + texto "Baixado" (não clicável) |

Aplicar a mesma lógica nas duas branches (`origem === "agenda"` e demais) em `src/routes/_authenticated/app.financeiro.atendimentos.tsx` (linhas ~1807–1817 e ~1855–1865).

## Reforço visual da seleção em lote

Além do check-visual no botão, quando a linha está selecionada e é elegível para baixa (pendente):
- Manter o checkbox marcado (já existe).
- Aplicar um `bg-amber-50/60` sutil na linha inteira (via `rowBg` condicional) para o usuário "ver de longe" o grupo que será baixado.

## Detalhes técnicos

- Trocar `<Button variant="ghost" size="icon">` por `<Button size="sm" className="h-6 px-2 text-[10px] ...">` com classes condicionais montadas por helper local `baixaBtnClass(pendente, selecionado)`.
- Ícones já importados (`CheckCircle2`, `Clock` de lucide-react — adicionar `Clock` no import se faltar).
- `selecionado` = `selectedIds.has(a.id)` (variável já existente no escopo do render).
- Botão em estado "Baixado" fica com `disabled` e sem `onClick`, mantendo `title="Repasse já baixado"`.

## Fora de escopo

- Não altera a lógica de `darBaixa()` nem o fluxo do rodapé "Pagar repasse (N)".
- Não muda a coluna Status/Pgto — só a coluna Ações.
