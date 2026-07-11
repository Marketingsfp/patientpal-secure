Todas as mudanças ficam em `src/components/pages/contratos-page.tsx` (frontend). Nenhum arquivo de permissões é tocado.

## 1. Filtro por Tipo de Convênio (cabeçalho da lista)

- Trocar o `<TableHead>TIPO DE CONVÊNIO</TableHead>` estático por um `Select` no mesmo padrão visual dos demais (`INÍCIO`, `TÉRMINO`, `MENSAL`, etc.), com a setinha para baixo e o pontinho azul quando ativo.
- Novo state: `filtroConvenio` (string), default `"todos"`. Opções: `Todos` + um item por convênio ativo carregado em `convenios` (usa `id` como value e `nome` como label). Além disso, uma opção `Sem convênio` para contratos com `convenio_id` nulo.
- Aplicar o filtro dentro do `filtered = useMemo(...)` existente, antes dos demais.

## 2. Paginação — 50 contratos por página

- Novo state: `pagina` (number, default 1). Constante `POR_PAGINA = 50`.
- Derivar `totalPaginas = Math.max(1, Math.ceil(filtered.length / 50))` e `paginados = filtered.slice((pagina-1)*50, pagina*50)`.
- Renderizar `paginados` no `filtered.map(...)` (substituir a variável usada no map por `paginados`).
- Rodapé simples da tabela com: contagem total, controles "Anterior / Próxima" e "Página X de Y". Layout minimalista, consistente com o resto (botões `variant="outline" size="sm"`).
- Resetar `pagina` para 1 sempre que qualquer filtro, busca ou ordenação mudar (`useEffect` com dependências dos filtros).

## 3. Contagem de resultados sempre visível

- Acima da tabela (ou logo abaixo do campo de busca), exibir um resumo: `"Mostrando A–B de N contratos"` quando não há filtro/busca ativo; `"N resultado(s) — filtros ativos: …"` quando houver.
- `filtrosAtivos` = lista das dimensões alteradas (situação, término, início, mensal, parcelas, vendedor, status, convênio, busca). Se pelo menos uma estiver diferente do default, entra no rótulo em PT-BR curto (ex.: `"Convênio", "Situação"`), separada por vírgula. Objetivo é atender o pedido: "sempre que utilizar um filtro quero que apareça a contagem do resultado".
- Botão "Limpar filtros" ao lado da contagem, aparece só quando há pelo menos um filtro ativo. Reseta todos os states de filtro para o default e volta para a página 1.

## 4. Ajustes de detalhe

- `colSpan` dos estados vazios permanece 11 (não muda).
- Contagem também exibida no rodapé junto da paginação, refletindo o total após filtros (`filtered.length`) — evita a impressão de "sumiram registros" quando o usuário está apenas em outra página.

## Fora de escopo

- Não muda nenhum outro filtro existente.
- Não altera lógica de carregamento server-side (busca por termo continua igual, com o limite atual de 500 mais recentes / 200 quando há termo).
- Não persiste a página nem os filtros na URL (mantém comportamento atual em memória).
