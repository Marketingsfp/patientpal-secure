# Inspiração visual + nova visão da Agenda

## 1) Inspiração visual (App Health do mockup)

Aplicar de forma sutil em todo o app, sem quebrar a identidade por clínica (cor da sidebar continua mudando conforme clínica selecionada — São Francisco verde, Menino Jesus azul, Consulta Hoje roxo).

Mudanças em `src/styles.css` e `src/components/app-shell.tsx`:

- **Sidebar**: aumentar o arredondamento dos itens ativos/hover para um pill mais marcado (já é `rounded-full`, refinar padding e sombra).
- **Cabeçalho da clínica**: card branco com logo continua, adicionar um título "Horário de Atendimento" / contexto no topo da sidebar quando estiver na Agenda.
- **Header superior**: pílulas arredondadas para "Encaixes", "Salas", botões de navegação (←/→) e sino — estilo cápsula escura como na foto.
- **Tokens**: introduzir um tom creme/off-white de fundo (`--surface-cream`) para a área principal, dando o respiro do mockup; tabelas e cards ganham cantos `rounded-2xl` e bordas mais suaves.
- **Tipografia**: títulos um pouco maiores e mais "soft" (peso 600, tracking ligeiramente negativo).

Sem trocar a paleta primária por clínica — apenas refinar shape, espaçamento e o creme de fundo.

## 2) Nova visão da Agenda: "Por médico — vários dias"

Hoje a Agenda tem visão por dia. Adicionar um seletor de modo de visualização no topo da página:

- **Dia** (atual)
- **Por médico — 3/5/7 dias** (nova)

Quando o usuário selecionar "Por médico":

- Mostra um seletor de **médico** (1 por vez) e um seletor de **quantidade de dias** (3, 5 ou 7).
- Renderiza uma grade tipo planilha como na foto:
  - Coluna fixa à esquerda: **Hora início**.
  - Para cada dia no intervalo: duas colunas — **Hora fim** + **Coluna do dia** (`DD/MM — DIA DA SEMANA` no header).
  - Linhas: slots de horário gerados a partir das disponibilidades do médico (`disponibilidades` por dia da semana) ou, na ausência, slots padrão de 30 min entre 07h00 e 19h00.
  - Cada célula com agendamento mostra hora fim + nome do paciente, pintada na cor do status (mesmas cores já existentes em `STATUS_COR`).
  - Clique na célula vazia → abre o diálogo "Novo agendamento" já com data/hora/médico preenchidos.
  - Clique no agendamento → abre o menu já existente (editar, status, copiar link, auditoria, etc.).
- Navegação ←/→ avança o intervalo em N dias.
- "Mini-calendário" e "Filtros" do mockup ficam para uma iteração futura; nesta entrega o filtro de status existente continua valendo.

## 3) Arquivos afetados

- `src/styles.css` — novos tokens (`--surface-cream`, raios), refinos de header.
- `src/components/app-shell.tsx` — header em pílulas, ajustes de espaçamento.
- `src/routes/_authenticated/app.agenda.tsx` — adicionar estado `view: "dia" | "medico"`, seletor de modo, e novo componente `AgendaPorMedico` com a grade multi-dia. Reaproveita o diálogo de criação/edição e o `DropdownMenu` já existentes.

## Fora do escopo

- Não mexer no fluxo de auditoria, financeiro, ou outras telas.
- Não trocar a cor primária por clínica.
- Mini-calendário lateral e chips de filtro coloridos do mockup ficam para depois.
