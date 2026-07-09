## Objetivo

Permitir dar baixa em vários atendimentos de uma vez, com a ação organizada dentro de um novo botão "Opções" no topo da tela de Atendimentos (Financeiro).

## Mudanças em `src/routes/_authenticated/app.financeiro.atendimentos.tsx`

1. **Novo botão "Opções" no toolbar do topo** (ao lado de "Pagar repasse"):
   - Componente: `DropdownMenu` do shadcn (já usado no projeto).
   - Rótulo: `Opções` com ícone `MoreHorizontal` / `Settings2`.
   - Sempre habilitado; os itens internos é que ficam habilitados/desabilitados conforme a seleção.

2. **Itens dentro do dropdown "Opções":**
   - **Dar baixa (N)** — executa `darBaixaLote()` que já existe. Desabilitado quando `selectedNaoBaixados.length === 0`. Rótulo mostra a quantidade.
   - **Imprimir 2ª via (N)** — move o botão atual de reimpressão para dentro do dropdown, para desafogar a barra superior. Desabilitado quando não há atendimentos pagos selecionados.
   - Cada item mostra um `title`/descrição curta explicando o requisito de seleção quando desabilitado.

3. **Remover os botões soltos** "Dar baixa" e "Imprimir 2ª via" da barra superior (desktop e mobile) — passam a viver dentro de "Opções". Mantém-se na barra: `Exportar Excel`, `Pagar repasse`, `Opções`, `Novo atendimento`.

4. **Seleção múltipla já existente permanece:** a checkbox no cabeçalho da tabela seleciona/deseleciona todos os itens visíveis; a checkbox de cada linha alterna o item. Nenhuma alteração na lógica de `selectedItems` / `selectedNaoBaixados` / `selectedPagos`.

5. **Confirmação e fluxo do "Dar baixa" em lote (inalterados, apenas revisados):**
   - Confirmação `confirm("Dar baixa em N atendimento(s)?")` antes de rodar.
   - `UPDATE agendamentos SET status='realizado' WHERE id IN (...)` para itens origem `agenda`.
   - `UPDATE fin_atendimentos SET status='realizado' WHERE id IN (...)` para itens origem `manual`.
   - Toast de sucesso + `load()` para recarregar a lista.

## Fora de escopo

- Não altera RLS, tabelas, ou funções server-side.
- Não altera a ação individual por linha (ícone de baixa em cada linha continua).
- Não altera "Pagar repasse", Caixa, nem cálculos de repasse.
