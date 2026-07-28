## Objetivo

Hoje o orçamento sai em formato de cupom (bobina de 80mm, fonte monoespaçada), como na imagem enviada. A mudança é fazer os orçamentos **de Odontologia** saírem em **folha A4**, mantendo os demais orçamentos (menu "Orçamentos") como estão.

## Tipo de pedido

Ajuste visual / de layout de impressão. Não altera regra de negócio, valores, sinal/saldo, descontos ou banco de dados.

## O que muda

1. A função de impressão passa a aceitar um formato: `cupom` (padrão, atual) ou `a4`.
2. Nos dois pontos de Odontologia (botão de impressão na tabela da aba "Orçamento" e impressão logo após salvar o orçamento novo/editado), a chamada passa a usar `a4`.
3. O menu "Orçamentos" e o shell v2 continuam usando `cupom` — nada muda para eles.

## Como fica o A4

- Página A4 retrato com margens de ~15mm, fonte de leitura (sem monoespaçada de cupom).
- Cabeçalho: nome da clínica, endereço, telefone/CNPJ à esquerda; número do orçamento e data à direita.
- Bloco "Paciente": nome, telefone, profissional.
- **Tabela de serviços** com colunas: Serviço | Qtd | Valor unit. | Dinheiro | Cartão/PIX | Sinal | Saldo final. As colunas de Dinheiro/Cartão só aparecem quando o orçamento tem valores separados por forma; as de Sinal/Saldo só aparecem quando existe algum item com sinal — mesma lógica de exibição de hoje, só reorganizada em tabela.
- Bloco de totais alinhado à direita (Subtotal/Desconto/Total, ou Dinheiro e Cartão/PIX quando houver split; Total Sinal e Total Saldo Final quando houver sinal).
- Forma de pagamento, observações e o bloco de "Preparo" mantidos.
- Rodapé: validade, linha de assinatura do paciente e do profissional, "Obrigado pela preferência!".
- Todos os valores, regras de sinal/saldo e cálculos permanecem exatamente os de hoje — apenas a apresentação muda.

## Detalhes técnicos

- `src/lib/print-orcamento.ts`: adicionar parâmetro opcional `formato: "cupom" | "a4"`; extrair o cálculo (itens, split de formas, sinal, totais, preparos) para reuso e gerar dois templates HTML. `@page { size: A4; margin: 15mm }` no modo A4 e janela de impressão maior.
- `src/components/odontologia/orcamento-tab.tsx` e `src/components/odontologia/novo-orcamento-odonto-dialog.tsx`: passar `"a4"`.

## Fora de escopo

- Orçamentos não odontológicos, GR de atendimento, contratos.
- Qualquer alteração de valores, descontos ou dados gravados.
