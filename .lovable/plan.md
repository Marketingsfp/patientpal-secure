## Paginação, botão Pesquisar e ordenação em "Item"

Alterações apenas em `src/routes/_authenticated/app.procedimentos.tsx` (aba "Item").

### 1. Botão "Pesquisar" (aplicar filtros sob demanda)
- Remover o debounce automático em `busca`. Os três filtros (`busca`, `filtroTipo`, `filtroGrupo`) passam a alimentar apenas estado "rascunho".
- Criar estado aplicado: `buscaAplicada`, `tipoAplicado`, `grupoAplicado`. O `useMemo filtrados` passa a depender desses valores aplicados.
- Adicionar botão **Pesquisar** (ícone lupa) na barra de filtros que copia os valores rascunho para os aplicados e reseta a página para 1.
- Adicionar botão **Limpar** ao lado, que zera filtros e aplica.
- Pressionar Enter no campo de busca também dispara "Pesquisar".

### 2. Ordenação por coluna (Nome, Especialidade, Tipo)
- Novo estado: `sort: { col: "nome" | "grupo" | "tipo"; dir: "asc" | "desc" } | null`.
- Cabeçalhos das três colunas viram botões clicáveis com ícone de seta (↑ / ↓) indicando estado atual; clique alterna asc → desc → sem ordenação (cai no padrão atual: grupo asc + nome asc).
- Aplicar a ordenação via `useMemo` em cima de `filtrados`, usando `localeCompare("pt-BR", { sensitivity: "base" })` para Nome/Especialidade e label do tipo para Tipo. Nulos vão para o fim.

### 3. Paginação (20 por página)
- Constante `PAGE_SIZE = 20` e estado `pagina` (1-based).
- `paginados = ordenados.slice((pagina-1)*PAGE_SIZE, pagina*PAGE_SIZE)`; a tabela renderiza `paginados`.
- Resetar `pagina` para 1 sempre que filtros aplicados ou ordenação mudarem.
- Adicionar rodapé na tabela com:
  - Texto "Mostrando X–Y de N itens"
  - Controles: « Primeira · ‹ Anterior · "Página P de T" · Próxima › · Última »
  - Usar componentes `Button` existentes (sem adicionar dependências); desabilitar nos extremos.

### Fora deste passo
- Sem mudanças em outras abas (Cartões, etc.), no schema, nas queries Supabase ou em outras telas.
- Sem mudanças visuais no diálogo de cadastro/edição.