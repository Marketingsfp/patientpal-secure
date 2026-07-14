
# Redesign da Tela de Agendas — Plano Faseado

## Contexto e riscos (leitura obrigatória)

A tela atual `src/routes/_authenticated/app.agenda.tsx` tem **6.068 linhas** e concentra: filtros, KPIs, tabela, ações em massa, encaixe, Agenda Express, criar horários, encerrar expediente, exportar, opções, modais, atalhos de teclado, contadores, realtime, integração com WhatsApp/Financeiro/Prontuário, permissões e regras de negócio sensíveis (agenda, financeiro, clínico).

Um "redesign completo em um único passo" nesse arquivo tem alto risco de:
- Quebrar filtros, contadores, paginação server-side e realtime.
- Quebrar permissões / RLS por reordenar condicionais de render.
- Perder atalhos de teclado e comportamentos sutis.
- Deixar regressões em modais e ações que hoje funcionam.

Por isso, **este é um trabalho puramente de apresentação (frontend/UI)**. Nenhuma regra de negócio, query, mutation, permissão, contagem, filtro server-side ou fluxo será alterada. O escopo é: estilos, layout, hierarquia visual, componentização visual, microinterações.

Sidebar, header global, busca universal, notificações, seletor de clínica e avatar do usuário **já existem** em `src/components/app-shell.tsx` / `menu-v2` — não vou recriá-los aqui; se houver ajuste visual, vira uma fase separada para não misturar com a Agenda.

---

## Fases

### Fase 1 — Design System local da Agenda (baixo risco)
Criar componentes visuais reutilizáveis **sem tocar em `app.agenda.tsx` ainda**, em `src/components/agenda-v2/ui/`:

- `PageHeader` — título "Agendas" + subtítulo, slot de ações à direita.
- `ActionToolbar` — agrupa ações primárias (Adicionar Encaixe, Agenda Express) e secundárias (Criar Horários, Encerrar Expediente, Exportar Excel, Opções) com hierarquia visual (primário sólido azul, secundário ghost).
- `FilterCard` — card único "Filtros" com grid responsivo (4 / 3 / 2 colunas conforme linha) + botões Exibir/Limpar ancorados à direita.
- `KpiCard` — ícone, número grande tabular, label, hover sutil, estado ativo.
- `StatusBadge` — Confirmado (azul), Realizado (verde), Livre (cinza), Cancelado (vermelho), Pendente (âmbar), etc. Mapeia os status já usados.
- `ServiceBadge` — cores por categoria (Consulta, Retorno, Enfermagem, Exames, Odonto, Laboratório).
- `ClienteCell` — nome em destaque + CPF/telefone em muted.
- `ProfissionalCell` — avatar + nome + especialidade abaixo.
- `RowActions` — atalhos WhatsApp/Financeiro/Prontuário + menu `...` (Visualizar, Editar, Confirmar, Cancelar, Financeiro, Excluir) usando `DropdownMenu` shadcn.
- `TablePagination` — rodapé com "X de Y", page-size, Anterior/Próximo.
- `EmptyState` / `TableSkeleton`.

Tokens: reutilizar os tokens semânticos existentes em `src/styles.css`. Nada de cores hardcoded — apenas `bg-background`, `bg-card`, `text-muted-foreground`, `border-border`, `primary`, e as tonalidades já definidas no HHP design system. Se faltar um tom claro (#F7F9FC como fundo de página) adiciono como token semântico novo, não como classe arbitrária.

### Fase 2 — Aplicar na tela de Agendas
Refatorar **somente a camada de renderização** de `app.agenda.tsx`:
- Substituir o header atual pelo `PageHeader` + `ActionToolbar`.
- Substituir o bloco de filtros pelo `FilterCard` (mesmos estados, mesmos handlers).
- Substituir os 4 indicadores pelos `KpiCard`.
- Trocar a tabela por um wrapper visual: cabeçalho sticky, linhas maiores, hover, badges, células compostas, `RowActions`. **Sem trocar a fonte de dados**, sem TanStack Table por enquanto (evita regressão de ordenação/seleção que já funciona hoje). Se a tabela atual já é uma `<table>` simples, faço restilização + composição de células.
- Trocar paginação pelo `TablePagination` (mesma lógica, novo visual).
- Estados de carregamento vazios: Skeleton + EmptyState amigável.

Todas as ações, permissões, atalhos de teclado, modais, contadores, hooks de realtime e chamadas a `createServerFn`/RPC ficam intactos.

### Fase 3 — Microinterações e responsivo
- Framer Motion sutil em: entrada dos KPIs, aparição de linhas (stagger leve, respeitando `prefers-reduced-motion`).
- Hover states nas linhas e cards.
- Responsivo: filtros reempilham (grid → 2 col → 1 col), tabela com scroll-x em telas <1024px, toolbar quebra em menu compacto no tablet.
- Acessibilidade: `aria-label` em botões-ícone, foco visível `focus-visible:ring`, contraste AA nos badges.

### Fora de escopo (não farei sem novo pedido)
- Reescrever `app.agenda.tsx` para reduzir as 6.068 linhas.
- Trocar sidebar / header global do app.
- Alterar RPC, filtros server-side, contadores, permissões, realtime.
- Reescrever Agenda V2 (`agenda-v2-shell.tsx`) — é outra tela.
- Substituir a tabela por TanStack Table (risco de regressão em seleção/ordenação). Posso avaliar em fase separada.

---

## Validação por fase
- Fase 1: build passa; componentes renderizam em isolamento (nenhum consumidor ainda).
- Fase 2: abro a rota `/app/agenda` no preview, confirmo visualmente que todos filtros/ações/contadores continuam funcionais em uma passagem manual dos principais fluxos (aplicar filtro, paginar, abrir menu de ações, abrir modais principais).
- Fase 3: verificação visual em 3 larguras (1440, 1024, 768).

## Detalhes técnicos
- Stack: React + TS + Tailwind v4 + shadcn/ui + Lucide + Framer Motion (já instalada? confirmar; se não, `bun add framer-motion`).
- Sem TanStack Table nesta rodada (justificado acima).
- Tokens em `src/styles.css`; nenhum `text-white`/`bg-[#...]` em componentes.
- Componentes ficam em `src/components/agenda-v2/ui/` (não confundir com Agenda V2 shell).

## O que preciso confirmar antes de começar
1. **Autoriza começar pela Fase 1** (criar componentes visuais isolados) e depois seguir para Fase 2 sob sua confirmação, ou prefere que eu faça 1+2 direto?
2. **Sidebar/header global**: mantenho como está nesta rodada, ou você quer que eu abra uma fase específica para eles depois?
3. **TanStack Table**: fica de fora agora (risco de regressão). OK ou você quer que eu inclua já?
