## Problema
Ao pagar uma mensalidade do contrato (botão **Pagar** na lista de mensalidades), abre o diálogo "Nova Receita" com a categoria editável e padrão `PARTICULAR`. O correto é fixar a categoria como **MENSALIDADE CARTAO CONSULTA**, sem permitir alteração.

## Plano

1. **`src/components/financeiro/lancamento-dialog.tsx`**
   - Adicionar duas novas props opcionais:
     - `categoriaFixaNome?: string` — nome exato da categoria a usar (ex.: `"MENSALIDADE CARTAO CONSULTA"`).
     - quando definida, após carregar `categorias`, localizar pelo nome normalizado e setar `categoriaId`, ignorando a lógica de PARTICULAR/convênio.
   - No bloco da Categoria (linhas 640–648), quando `categoriaFixaNome` estiver setado, renderizar o `Select` com `disabled` (mantém o visual atual mas bloqueado).
   - Se a categoria não existir no banco, mostrar o nome em um Input read-only como fallback informativo (sem quebrar o submit — `categoria_id` fica null nesse caso, mas isso é raríssimo).

2. **`src/components/pages/contratos-page.tsx`** (no `<LancamentoDialog>` da linha 2061)
   - Passar `categoriaFixaNome="MENSALIDADE CARTAO CONSULTA"` quando o diálogo é aberto para pagamento de mensalidade (sempre que `pagMens` estiver definido — que é o único caso desse `LancamentoDialog` no arquivo).

## Observações
- Não altero a lógica de outros lançamentos (financeiro, agenda, etc.).
- Mantém compatibilidade total: prop é opcional.
- Caso a categoria "MENSALIDADE CARTAO CONSULTA" não exista naquela clínica, mantemos o select desabilitado vazio — o usuário precisa cadastrar a categoria no financeiro. Posso opcionalmente criar a categoria automaticamente na primeira vez, se você preferir — me avise.
