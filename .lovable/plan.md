## Objetivo

Restaurar no menu lateral atual (MenuV2) o cabeçalho com o nome "ClinicaOS" no topo e o botão para recolher/expandir a sidebar — recurso que existia no menu antigo e sumiu na migração para o MenuV2.

## O que muda

Apenas o componente `src/components/menu-v2/menu-v2.tsx` (visual/UX da sidebar). Nada de layout global, rotas, dados, wizard, drawer, KPIs ou regras de negócio.

### 1. Cabeçalho no topo da sidebar
- Adicionar uma barra no topo do `<aside>` com:
  - Ícone + texto **"ClinicaOS"** à esquerda (mesma tipografia usada antes: `font-semibold tracking-tight`).
  - Botão fantasma à direita com `ChevronLeft` (quando expandido) / `ChevronRight` (quando recolhido), com `title` "Recolher menu" / "Expandir menu".
- Separador inferior sutil (`border-b border-sidebar-border`).

### 2. Estado recolhido
- Estado local `collapsed` persistido em `localStorage` na chave `menuv2:collapsed` (mesmo padrão do shell antigo, mas chave separada para não conflitar).
- Largura do aside:
  - Expandido: `w-64` (atual).
  - Recolhido: `w-16`.
- Transição suave `transition-all duration-200`.
- Quando `collapsed`:
  - Esconder o texto "ClinicaOS" no header (mantém só o ícone).
  - Esconder títulos de seção (Fixados, Recentes, Favoritos) e labels dos itens.
  - Esconder o input de busca, se houver.
  - Nas linhas de item, exibir apenas o ícone centralizado, com `Tooltip` (já disponível via `TooltipProvider`) mostrando o label ao passar o mouse.
  - Ocultar botões de fixar/favoritar/expandir subgrupo quando recolhido (voltam ao expandir).
- Auto-collapse em telas estreitas (`window.innerWidth < 1024`) na primeira montagem, igual ao comportamento anterior.

### 3. Sem mudanças de cor
- Continuar usando os tokens `bg-sidebar` / `text-sidebar-foreground` das paletas já aplicadas (Classic Azure, Ocean, Slate, Emerald). O header herda a mesma cor da sidebar.

## Fora de escopo
- Não alterar cards da agenda, layout, densidade, wizard, drawer, KPIs, tipografia, temas, ou qualquer coisa em `styles.css` / `app-shell.tsx`.
- Não mexer no menu antigo (`app-shell.tsx`) — ele já tem o comportamento correto e permanece como fallback.

## Verificação
- Ao abrir `/app/agenda`, o topo da sidebar mostra ícone + "ClinicaOS" e o botão de seta.
- Clicar no botão alterna entre `w-64` e `w-16`, com tooltips nos ícones no modo recolhido.
- Recarregar a página preserva o último estado (localStorage).
