## Mudança na aba "Benefícios" do Convênio

Hoje a aba Benefícios já não abre pop-up, mas o formulário só aparece quando você clica em "Novo benefício" ou "Editar" (um Card é montado/desmontado acima da tabela). No vídeo, tudo fica permanentemente na tela, igual ao padrão da aba **Faixas de Preço**: a tabela edita os itens diretamente nas linhas (inline) e um botão "Adicionar" acrescenta uma nova linha vazia.

## Como vai funcionar

- A aba "Benefícios" passa a mostrar **uma única tabela sempre visível**, com as colunas:
  - **Nome** — `<Input>` editável direto na linha
  - **Descrição** — `<Input>` editável direto na linha
  - **Ativo** — `<Switch>` direto na linha
  - **Ações** — botão de excluir (lixeira)
- Botão **"Adicionar benefício"** no topo da aba acrescenta uma nova linha vazia já editável (sem abrir card/modal).
- As alterações ficam em memória enquanto você edita e são **persistidas no banco quando você clica em "Salvar" do convênio** (mesmo fluxo das Faixas de Preço: apaga e reinsere os benefícios do convênio).
- O `AlertDialog` de confirmação de exclusão de benefício deixa de ser necessário — a exclusão remove a linha localmente; só efetiva no banco ao Salvar.
- Mantém a regra atual: enquanto o convênio não foi salvo pela primeira vez (`!editing`), permite editar a lista localmente e ela é salva junto com o convênio na primeira gravação.

## Arquivo afetado

- `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx`

## Detalhes técnicos

- Remover `benForm`, `benSaving`, `benToDelete`, `saveBeneficio`, `confirmDeleteBeneficio` e o `AlertDialog` de exclusão de benefício.
- Trocar o tipo local de benefício para aceitar entrada nova sem id: `{ id?: string; nome: string; descricao: string; ativo: boolean }`.
- `loadBeneficios` continua igual (carrega no `openEdit`); `openNew` zera a lista.
- Renderizar a tabela inline com inputs controlados que atualizam `beneficios[idx]` via `setBeneficios`.
- No `save()` do convênio, após gravar/atualizar `cb_convenios` e reinserir `cb_convenio_faixas`, fazer:
  1. `delete from cb_beneficios where convenio_id = <id>`
  2. `insert` da lista atual (filtrando linhas com `nome` vazio).
- Manter ícone `Gift` no `TabsTrigger`.

Nenhuma migração de banco é necessária.