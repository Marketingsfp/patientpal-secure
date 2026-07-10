## Objetivo

Trocar o campo "Forma de pagamento" no diálogo "Novo lançamento" (Financeiro → Mov. Caixa) de um `<Input>` de texto livre por um `<Select>` com as opções padrão já usadas no sistema.

## Onde

Arquivo: `src/routes/_authenticated/app.financeiro.movimento.tsx` (linhas 607-608, dentro do diálogo "Novo lançamento" / edição de lançamento).

## Opções da lista

Reaproveitando exatamente os mesmos valores usados em `src/components/financeiro/lancamento-dialog.tsx` (para manter consistência com filtros, relatórios e caixa):

- Dinheiro → `dinheiro`
- Pix → `pix`
- Cartão Crédito → `cartao_credito`
- Cartão Débito → `cartao_debito`
- Boleto → `boleto`
- Convênio → `convenio`
- Transferência → `transferencia`

Mais uma opção "— (não informar)" para permitir salvar vazio (mantém compatibilidade com o comportamento atual do campo, que aceita nulo).

## Mudança de UI

Substituir:

```tsx
<Input value={form.forma_pagamento}
       onChange={(e) => setForm({ ...form, forma_pagamento: e.target.value })}
       placeholder="Pix, cartão, dinheiro..." />
```

Por um `<Select>` (padrão shadcn já importado no arquivo) com os itens acima. O valor salvo continua indo em `forma_pagamento` (string ou `null`), sem mudança no banco nem no fluxo de salvar.

## Observações

- Não altera categorias, contas, status, nem qualquer regra de negócio.
- Lançamentos antigos que tenham valores fora dessa lista (ex.: "maestro", "caixa") continuarão sendo exibidos normalmente em tabelas/filtros; só o formulário de novo/edição passa a oferecer a lista fixa.
- Se um lançamento existente for aberto para edição com forma fora da lista, o Select mostra o valor bruto até o usuário escolher outro (comportamento padrão do shadcn Select).
