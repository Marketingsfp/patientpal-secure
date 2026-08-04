# Componente AgendaTable (isolado)

Criar um componente reutilizável de listagem de agendamentos, com visual limpo e premium, sem tocar na Agenda atual.

## O que será criado

**1. `src/components/agenda/agenda-table.tsx`**

Props: `items`, `isLoading`, `onEdit(item)`, `onPayment(item)`.

Tipo do item (exportado): id, ficha, dia (seg/ter…), data, horaInicio, horaFim, profissional, cliente, servico, status (`realizado | agendado | livre | cancelado`).

**Desktop (>= md)** — tabela shadcn, plana, header `bg-slate-50/70`, hover discreto nas linhas:
Checkbox • Ficha • Dia • Data • Intervalo • Profissional • Cliente • Serviço • Alertas • Ações.
- Seleção por linha + "selecionar todos" no header (estado interno do componente).
- Alertas em soft badges (fundo translúcido, texto opaco): verde Realizado, azul Agendado, cinza Livre, rosa Cancelado.
- Ações: ícones minimalistas (`Pencil`, `CreditCard`) + `DropdownMenu` (`MoreHorizontal`) com Ver detalhes / Reagendar / Imprimir guia / Cancelar (apenas visuais neste componente isolado).

**Mobile (< md)** — tabela oculta, lista de cards `rounded-xl border shadow-sm`:
- Nome do cliente em destaque no topo, badge de status à direita.
- Abaixo: horário, dia/data, profissional e serviço em texto secundário.
- Botões de ação alinhados à direita no rodapé do card.

**Estados**: skeletons (linhas/cards) quando `isLoading`; empty state "Nenhum agendamento encontrado." Todo o texto em português.

**2. `src/routes/_authenticated/app.dev-agenda-table.tsx`**

Rota de preview isolada com ~8 registros fictícios para conferir desktop e mobile, com `head()` próprio. Não entra no menu.

## Notas técnicas

- Reutiliza `Table`, `Checkbox`, `Button`, `DropdownMenu`, `Skeleton` já existentes em `src/components/ui`.
- Componente puramente apresentacional: nenhuma chamada ao banco.
- Nenhuma alteração em `app.agenda.tsx` — a integração pode ser feita depois, se você quiser.