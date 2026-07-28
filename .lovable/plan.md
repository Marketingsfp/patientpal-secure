## Problema (confirmado no código)

Na agenda, ao faturar um agendamento vindo de orçamento, a função que monta as
formas de pagamento (`opcoesPagamentoDeOrcamento`, em
`src/routes/_authenticated/app.agenda.tsx`) lê **apenas** `orcamentos.valor_total`
e `orcamentos.valores_pagamento` — ou seja, o valor **cheio do orçamento inteiro**,
sem olhar quais itens foram vinculados àquele agendamento na tabela
`agendamento_orcamento_itens`.

Por isso, escolhendo 1 item de um orçamento de 3 itens, o caixa vê o total de todos.

Segundo ponto confirmado: `src/lib/agenda/sinal-orcamento.ts` filtra apenas itens
com `sinal_valor > 0`. Quando o agendamento mistura um item com entrada e outro sem,
o resumo (Total / Já pago / Falta) ignora o item sem entrada.

## O que muda

Somente o cálculo do valor sugerido no faturamento da agenda. Nada de regra de
preço, desconto, impressão ou banco de dados.

1. **Valor por itens escolhidos**
   `opcoesPagamentoDeOrcamento` passa a receber também o `agendamento_id`.
   - Busca os itens vinculados em `agendamento_orcamento_itens`.
   - Se houver vínculos: soma o `valor_total` **apenas desses itens**, descontando
     o que já foi pago (`valor_pago`), e usa esse valor nas 4 formas.
   - Se o orçamento tiver `valores_pagamento` por forma (Dinheiro/Pix/Débito/
     Crédito), aplica a mesma proporção (itens escolhidos ÷ total do orçamento)
     sobre cada forma, preservando diferenças de preço por forma.
   - Sem vínculos (orçamento inteiro): comportamento atual, sem mudança.

2. **Resumo de entrada com itens mistos**
   `obterEtapaSinal` passa a considerar **todos** os itens vinculados ao
   agendamento, e não só os que têm entrada:
   - "Total" = soma dos itens escolhidos; "Já pago" e "Falta pagar" idem.
   - A etapa continua sendo "sinal" enquanto o pago for menor que a soma das
     entradas dos itens que têm entrada; depois vira "saldo".
   - Itens sem entrada aparecem na lista com o selo "sem entrada" (já existente).

3. **Baixa do pagamento**
   `registrarPagamentoEtapaSinal` passa a distribuir o valor recebido entre os
   itens vinculados ao agendamento (com ou sem entrada), proporcional ao saldo de
   cada um, nunca ultrapassando o total do item. Itens de outros agendamentos
   ou não escolhidos **não são tocados** e continuam livres para agendar/pagar
   depois — a regra de consumo por item já existente na agenda é preservada.

## Arquivos afetados

- `src/routes/_authenticated/app.agenda.tsx` — assinatura e chamada de
  `opcoesPagamentoDeOrcamento` (3 pontos de chamada: salvar-e-cobrar, cobrar
  agendamento existente).
- `src/lib/agenda/sinal-orcamento.ts` — seleção dos itens do agendamento.

## Fora do escopo

- Preços, descontos, convênios e Cartão Consulta.
- Impressão (GR / orçamento) e migrações de banco.

## Validação prevista

- Orçamento com 3 itens, agendar só 1: faturamento deve trazer o valor daquele item.
- Item com entrada + item sem entrada no mesmo agendamento: resumo deve somar os dois.
- Após pagar, os itens não escolhidos continuam disponíveis para novo agendamento.
- Checagem de tipos.
