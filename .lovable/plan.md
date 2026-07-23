## Objetivo
No orçamento da Odontologia, exibir os valores separados por grupo de pagamento — **Dinheiro/PIX** e **Cartão** — tanto no painel lateral (drawer) quanto no cupom de impressão. Aplicar nas 3 clínicas.

## Escopo
- Frontend/apresentação apenas. Nenhuma mudança de banco, regra de negócio ou de cálculo.
- Os itens do orçamento odonto já são salvos com `valores_formas` (chaves: `Dinheiro`, `PIX`, `Cartão de Crédito`, `Cartão de Débito`) pelo `novo-orcamento-odonto-dialog.tsx`. A alteração apenas passa a ler esses valores em dois lugares onde hoje só aparece um total.

## Alterações

### 1. `src/components/orcamentos-v2/orcamento-drawer.tsx`
- Passar a ler também `valores_formas` e `quantidade` de `orcamento_itens`.
- Quando o item tiver `valores_formas` com Dinheiro/PIX e Cartão distintos, mostrar duas colunas por item (Dinheiro/PIX e Cartão) em vez de um valor único.
- Substituir o campo "Valor total" único por dois totais no cabeçalho: **Total Dinheiro/PIX** e **Total Cartão**, calculados somando `quantidade × valores_formas[forma]` (Dinheiro/PIX = maior entre Dinheiro e PIX se ambos existirem; Cartão = maior entre Crédito e Débito).
- Fallback: se o item não tiver `valores_formas` (orçamentos não-odonto ou antigos), manter o layout atual com um único total.

### 2. `src/lib/print-orcamento.ts`
- Já lê `valores_formas` para o bloco de "PAGAMENTO (escolha uma forma)" quando há múltiplas formas.
- Ajuste: no rodapé de totais, quando os itens tiverem `valores_formas` com Dinheiro/PIX e Cartão, imprimir duas linhas:
  - `TOTAL DINHEIRO/PIX  ..... R$ x`
  - `TOTAL CARTÃO        ..... R$ y`
  em vez de uma única linha `TOTAL`.
- Manter `SUBTOTAL` e `DESCONTO` como estão.
- Se os itens não tiverem `valores_formas` (orçamentos não-odonto ou antigos), manter o `TOTAL` único atual — nada muda para os demais fluxos.

## Fora do escopo
- Alterar como o orçamento é criado ou como `valor_total` é gravado no banco.
- Mexer em impressões/telas de orçamentos não-odonto.
- Módulos de Caixa, NFS-e, contratos etc.

## Validação
- Abrir o orçamento #ORC-202600084 (QUEDIMA SUELEN) no drawer: conferir os dois totais.
- Imprimir o mesmo orçamento e conferir o rodapé com as duas linhas.
- Abrir um orçamento não-odonto (ex.: um do módulo Orçamentos comum) e confirmar que o layout antigo (um total único) permanece intacto.
