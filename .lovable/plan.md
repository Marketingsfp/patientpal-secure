## Problema

Na aba **Convênios** de "Cartão Benefícios", o lápis de editar (e o ícone de excluir) sumiram visualmente.

## Causa

O código dos botões continua no lugar (`src/routes/_authenticated/app.cartao-beneficios.convenios.tsx`, linhas 507-510) e renderiza corretamente no DOM. O problema é de **layout da tabela**:

- Verifiquei no preview: a coluna **Nome** está com ~2096px de largura, forçando a tabela para ~2423px, muito além dos 1035px da viewport.
- A coluna "Ações" (que contém os botões de lápis e lixeira) fica renderizada fora da área visível à direita, invisível para o usuário.
- A tabela usa layout automático (`table-auto` implícito), então a coluna mais larga naturalmente "come" todo o espaço, e o wrapper interno `overflow-auto` do componente `Table` não impede que o próprio Card cresça horizontalmente.

## Correção

Editar apenas `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx`, na tabela de listagem de convênios (por volta das linhas 484-514):

1. Aplicar `table-fixed w-full` na `<Table>` da listagem para forçar larguras controladas.
2. Definir larguras explícitas nas colunas via `<TableHead>`:
   - Nome: `w-auto` + `truncate` na `<TableCell>` (para não estourar).
   - "A partir de": `w-[140px]`.
   - Descrição: `w-[240px]` + `truncate` na célula.
   - Status: `w-[100px]`.
   - Ações: `w-[110px]` (garante espaço para os dois botões).
3. Adicionar `truncate` nas células de Nome e Descrição (com `title={c.nome}` / `title={c.descricao ?? ""}` para preservar leitura via tooltip nativo).

Isso faz com que:
- A tabela caiba na largura do container.
- Os botões de **lápis (editar)** e **lixeira (excluir)** voltem a ficar visíveis na coluna Ações à direita.
- Nomes longos (ex.: os `[SIM-CV-…]` que aparecem nos dados) sejam truncados com reticências em vez de esticar a tabela.

Nenhuma outra tela é afetada — a mudança fica isolada na tabela desta rota.
