## Objetivo

Na tela **Nova Receita** (aberta após confirmar atendimento na Agenda), ajustar dois pontos no diálogo `src/components/financeiro/lancamento-dialog.tsx`:

1. **Valor não editável** quando vier preenchido automaticamente pelo procedimento.
2. **Categoria padrão "Particular"** já pré-selecionada (atendente pode trocar).

## Mudanças

### 1. Travar o campo Valor quando vier do procedimento

- O diálogo já recebe `initialValor` quando aberto pelo fluxo da Agenda (`app.agenda.tsx` linha 675). Quando lançado manualmente em Financeiro › Movimento, esse prop não é passado.
- Tratar `initialValor` como sinal de "valor vem do sistema":
  - Renderizar `<CurrencyInput value={valor} disabled readOnly />` quando `initialValor` estiver definido e não vazio.
  - Manter editável quando `initialValor` for `undefined`/vazio (caso de lançamento manual em outros pontos do app).
- Adicionar um texto auxiliar discreto abaixo do campo: "Definido pelo procedimento" quando travado.

### 2. Categoria padrão "Particular"

- Após o `useEffect` carregar `categorias` da clínica, se ainda não houver `categoriaId` selecionado, procurar uma categoria cujo `nome` (normalizado, sem acento, lowercase) seja `"particular"` e setá-la como padrão.
- Se a categoria não existir na base, não falhar — apenas deixar vazio (placeholder atual).
- A atendente continua livre para trocar pelo `<Select>` existente.

## Arquivos afetados

- `src/components/financeiro/lancamento-dialog.tsx` — única alteração.

## Fora do escopo

- Não alterar `app.agenda.tsx`, fluxo de pagamento misto, troco, NFS-e, nem o lançamento manual de receitas/despesas em Financeiro › Movimento.
- Não criar/seedar a categoria "Particular" no banco — apenas pré-selecionar se já existir.
