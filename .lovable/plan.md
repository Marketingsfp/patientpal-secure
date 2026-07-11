## Objetivo

Padronizar visualmente as tabelas do Cartão Benefícios (mesmo cabeçalho azul em negrito/caixa alta, separadores verticais entre colunas, sem "molduras arredondadas" nos inputs) e transformar a edição de regras em popup, reaproveitando o dialog "Adicionar regra".

## Mudanças

### 1. Coluna "Exemplo" removida (aba Benefícios)
Arquivo: `src/components/cartao-beneficios/regras-tab.tsx`
- Remover o `<TableHead>` "Exemplo" (índice 6) do array de cabeçalhos.
- Remover a `<TableCell>` correspondente que renderiza `sample(r)`.
- Ajustar `colSpan` das linhas de estado vazio/loading de `11` para `10`.
- A função helper `sample()` fica obsoleta e é removida.

### 2. Aba "Vendas" — cabeçalho "PACIENTE" em caixa alta
Arquivo: `src/components/pages/contratos-page.tsx` (linha ~320)
- O botão de ordenação dentro do `<TableHead>` renderiza o texto "Paciente" com `<span>`. Trocar o texto para "PACIENTE" (fixo em caixa alta), garantindo consistência com os demais cabeçalhos do sistema (que agora usam `uppercase` pelo `TableHead` base).

### 3. Cabeçalho da aba "Benefícios" com o mesmo estilo dos demais
Arquivo: `src/components/cartao-beneficios/regras-tab.tsx`
- Hoje o `<TableHeader>` usa overrides locais (`bg-muted`, `text-foreground`, `text-[11px]`) que sobrepõem o estilo base azul da tabela.
- Remover esses overrides para herdar o cabeçalho padrão (`bg-primary/10`, `text-primary`, `font-bold uppercase tracking-wide`, borda inferior azul) definido em `src/components/ui/table.tsx`, ficando idêntico às abas Convênios e Faixas de Preço.

### 4. Separadores verticais entre colunas (padrão da lista de Convênios como referência)
Arquivo: `src/components/ui/table.tsx`
- Adicionar no `TableHead` e `TableCell` uma borda direita sutil (`border-r border-border/40 last:border-r-0`) para criar linhas verticais entre colunas em **todas** as tabelas do sistema — inclui a lista de Convênios (foto 4), Faixas de Preço (foto 5) e Benefícios (foto 6), atendendo o pedido "para dividir as colunas crie uma linha entre elas".

### 5. Aba "Faixas de Preço" — sem "molduras arredondadas"
Arquivo: `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx` (bloco da tabela de faixas, linhas ~620–664)
- Nos `<Input>` de "Quantidade de pessoas" e no `<CurrencyInput>` de "Valor Mensal", adicionar classes que removam a borda e o arredondamento (`border-0 rounded-none shadow-none focus-visible:ring-0 bg-transparent`), deixando visualmente só a célula da tabela (com o separador vertical do item 4).
- Mantém as validações e o comportamento atual dos inputs.

### 6. Aba "Benefícios" — sem "molduras arredondadas" + edição via popup
Arquivo: `src/components/cartao-beneficios/regras-tab.tsx`

**6a. Remover molduras dos controles nas linhas da tabela**
- Aplicar `border-0 rounded-none shadow-none focus-visible:ring-0 bg-transparent` nos inputs/selects usados dentro das `<TableCell>`: `SearchableSelect` (Especialidade e Serviço), `Select` (Categoria, Modo, Carência), `CurrencyInput`/`Input` (Valor/%), `Input` (Prioridade). O botão "Limite/Sem limite" e o `Checkbox` de Gratuito permanecem como estão.
- Como os controles ficam sem borda visível, o modo "somente-leitura" (fora de edição) segue funcionando: os campos continuam `disabled` até o usuário clicar no lápis — mas agora o clique no lápis abre o popup (ver 6b), então os campos da linha ficam sempre `disabled` (a linha vira apenas exibição).

**6b. Editar via popup reaproveitando o dialog "Adicionar regra"**
- Renomear internamente o componente `NovaRegraDialog` para aceitar uma regra inicial opcional: nova prop `regra?: CbRegra | null`. Quando `regra` é passada, o dialog abre com os campos preenchidos e o título muda para "Editar regra"; ao salvar, executa `UPDATE` em `cb_convenio_regras` pelo `id`, em vez de `INSERT`.
- Adicionar estado `editRegra: CbRegra | null` em `RegrasConvenioTab`.
- O botão de lápis da linha passa a fazer `setEditRegra(r)` (não alterna mais `editingIdx`); o estado `editingIdx` e o ícone `Check` são removidos.
- Passar `editRegra` para o dialog; ao fechar, `setEditRegra(null)` e recarregar (`load()`).
- O botão da lixeira continua funcionando normalmente na linha.

## Arquivos afetados

- `src/components/ui/table.tsx` — separadores verticais entre colunas.
- `src/components/cartao-beneficios/regras-tab.tsx` — remover coluna Exemplo, herdar cabeçalho base, remover molduras dos controles, edição via popup (reuso do NovaRegraDialog em modo edição).
- `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx` — remover molduras dos inputs da tabela de Faixas de Preço.
- `src/components/pages/contratos-page.tsx` — cabeçalho "PACIENTE" em caixa alta fixa.

## Fora de escopo

- Não altero regras de negócio, migrations, cálculo de preços, filtros, salvar/reaplicar.
- Não mexo em outras telas/módulos além dos citados acima.
