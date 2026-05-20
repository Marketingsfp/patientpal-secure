# Refinamento visual inspirado na referência

A imagem mostra um sistema clean com sidebar colorida (verde da clínica), área principal branca/cinza claríssimo, cantos generosos, cápsulas/pílulas como botões de filtro, ícones laterais minimalistas e blocos de horário coloridos suaves. Vamos aproximar nosso visual sem mudar as cores fixas de cada clínica.

## O que aproximar do design de referência

**1. Sidebar mais "premium"**
- Bordas internas arredondadas nos itens ativos (estilo pílula com leve glow).
- Espaçamento vertical maior entre grupos; títulos de grupo (Operação / Inteligência / Gestão) menores e mais discretos.
- Logo da clínica num "card" branco com cantos arredondados e leve sombra (já temos, mas refinar padding/raio).
- Rodapé com avatar circular do usuário (inicial colorida) + nome + botão sair, em vez de só texto.
- Modo recolhido: ícones centralizados com tooltip e indicador lateral fino na cor branca quando ativo.

**2. Topbar / header da página**
- Adicionar uma barra de busca global no topo da área principal (estilo "Pesquisar..." da referência), com ícone de lupa à esquerda e atalho ⌘K à direita.
- Botões de ação rápida no canto (notificações, encaixes, atalho de salas) como pílulas escuras com ícone.
- Avatar do usuário no canto superior direito.

**3. Conteúdo / cards**
- Aumentar border-radius geral (de `rounded-md` para `rounded-xl` nos cards principais).
- Sombras mais suaves (`shadow-sm` em vez de bordas marcadas) — substituir bordas pretas por sombra + fundo branco.
- Espaçamento interno mais generoso (p-6 em vez de p-4).
- Separadores discretos em `border-muted/40` no lugar de linhas escuras.

**4. Agenda — blocos de horário**
- Pintar células de agendamento com tons pastel suaves derivados do status (lilás, azul claro, pêssego, verde menta), com texto escuro — igual à referência.
- Linhas de hora cinza muito claras, sem bordas pretas.
- Coluna fixa "Hora Início / Hora Fim" com fundo cinza-claro.
- Hover do bloco: leve elevação + borda na cor da clínica (já fizemos algo parecido nos filtros).

**5. Filtros e botões**
- Botões primários como pílulas (`rounded-full`) na cor da clínica, ícone + texto.
- Botões secundários em outline cinza-claro arredondado.
- Toggles de "Lista de espera" / "3 dias" como pílulas com estado ativo na cor da clínica.

**6. Tipografia**
- Aumentar o peso dos títulos de página (h1/h2) e diminuir o tracking.
- Subtítulos em `text-muted-foreground` consistentes.
- Mais "respiro" no topo das páginas.

**7. Paleta de apoio (sem mexer nas cores das clínicas)**
- Background da área principal: cinza off-white levemente mais quente (`oklch(0.985 0.005 250)`).
- Cards: branco puro com sombra suave.
- Tons pastel para badges/status (lilás, azul, pêssego, menta, rosa) — só para chips, eventos e tags.

## Onde mexer (técnico)

- `src/styles.css` — ajustar `--background`, `--card`, `--radius` (subir para `0.875rem`), e adicionar tokens pastel (`--pastel-lilac`, `--pastel-peach`, `--pastel-mint`, `--pastel-sky`).
- `src/components/app-shell.tsx` — refinar sidebar (pílulas ativas, avatar no rodapé, espaçamento), adicionar topbar global com busca + ações rápidas.
- `src/routes/_authenticated/app.agenda.tsx` — substituir cores fortes dos blocos por pastel suaves; remover bordas pretas restantes; arredondar mais; coluna de hora com fundo neutro.
- Componentes de botão/badge — adicionar variantes `pill` (rounded-full) e `pastel-*`.

## Sugestão de ordem

1. Tokens de cor e raio em `styles.css` (base de tudo).
2. Sidebar refinada + topbar global no `app-shell`.
3. Agenda: blocos pastel, hora neutra, sem bordas pretas.
4. Passada geral nos cards/filtros das outras páginas para herdar o novo raio/sombra.

Posso aplicar tudo de uma vez ou ir por etapas — recomendo etapas (1+2 primeiro, depois 3, depois 4) pra você acompanhar visualmente.
