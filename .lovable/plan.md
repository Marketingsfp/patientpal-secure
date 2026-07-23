## Objetivo
Reagrupar as formas de pagamento no orçamento de Odontologia nas 3 clínicas: **PIX passa a valer o mesmo que Cartão** (grupo "Cartão/PIX"), e **Dinheiro fica sozinho**. Hoje o sistema está agrupando PIX junto com Dinheiro, o que gera o valor errado no drawer, na lista de itens e no cupom impresso.

## Escopo (apenas apresentação/gravação de valores em Odontologia)
- Criação do orçamento: `src/components/orcamentos-v2/novo-orcamento-odonto-dialog.tsx` e `src/components/orcamentos-v2/add-to-orcamento-dialog.tsx` → gravar `valores_formas` com `Dinheiro = preço à vista` e `PIX = Cartão de Crédito = Cartão de Débito = preço com acréscimo`.
- Visualização no drawer: `src/components/orcamentos-v2/orcamento-drawer.tsx` → função `splitFormas` passa a considerar PIX no lado do Cartão; rótulos viram "Dinheiro" e "Cartão/PIX".
- Impressão: `src/lib/print-orcamento.ts` → mesma mudança em `splitFormas` e nos rótulos ("DINHEIRO" e "CARTÃO/PIX").
- Backfill SQL nos orçamentos de Odontologia já existentes nas 3 clínicas: recalcular `valores_formas` dos itens (Dinheiro à vista; PIX/Cartão com acréscimo) para que orçamentos antigos passem a exibir o agrupamento correto.

## Fora do escopo
- Regras de negócio de acréscimo, conversão, agendamento, cobrança, splits de pagamento no caixa e permissões — nada muda.
- Outros módulos (orçamentos não-odontológicos continuam com o comportamento atual).

## Antes → Depois (exemplo do print enviado)
- Antes: `DINHEIRO/PIX 1.620,00` · `CARTÃO 1.782,00`.
- Depois: `DINHEIRO 1.620,00` · `CARTÃO/PIX 1.782,00`. Mesmos totais no drawer e nos itens (BLOCO DE CERAMICA e COROA EM PORCELANA).

## Validação
- Reabrir o orçamento #202600084 (Menino Jesus) e conferir drawer + reimpressão.
- Amostra 1 orçamento por clínica após o backfill.

## Riscos
- Baixo: mudança é de apresentação e de rotulagem/gravação de `valores_formas`. Não altera `valor_total`, conversão nem lançamentos financeiros já feitos.