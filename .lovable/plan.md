## Objetivo

Marcar a parcela 1 do contrato de BARBARA ELAINE BERNARDINO RAMOS como paga **apenas visualmente**, sem gerar lançamento financeiro, sem movimento de caixa e sem repasse — porque o pagamento aconteceu antes do sistema entrar em uso.

## Parcela identificada

- Contrato: `a481ceae-4049-4c40-97e5-43627abc68cc` (BARBARA ELAINE BERNARDINO RAMOS)
- Parcela 1 · Venc. 05/07/2026 · R$ 210,00
- `id`: `e6a5e5c7-592d-4809-adf7-a5214965bceb`
- Status atual: `pendente` · `lancamento_id`: null

## O que vou fazer (via tool de insert/update)

Um único `UPDATE` em `contrato_mensalidades` na parcela acima:

- `status` = `pago`
- `pago_em` = `2026-07-06`
- `valor_pago` = `210`
- `forma_pagamento` = `dinheiro` (histórico externo ao sistema)
- `observacoes` = "Pago em 06/07/2026, antes da entrada em uso do ClinicaOS. Baixa apenas visual — sem lançamento financeiro nem movimento de caixa."
- `lancamento_id` fica **null** de propósito

## O que **não** será alterado

- Nada em `fin_lancamentos` (não cria receita).
- Nada em `caixa_movimentos` / `caixa_sessoes` (não altera fechamento de caixa).
- Nada em `pagamento_splits` (não gera repasse para o profissional).
- Nada nas outras 11 parcelas nem na taxa de adesão.

## Efeito visual esperado

- Card "Pagas" passa de `0/12` para `1/12`.
- "Recebido" continua **R$ 0,00** (correto — o dinheiro não entrou pelo sistema).
- "A receber" cai de R$ 2.520,00 para R$ 2.310,00.
- Linha da parcela 1 mostra status **Pago** e a data 06/07/2026 em "Pago em".

## Reversível?

Sim. Basta um `UPDATE` voltando `status='pendente'`, `pago_em=null`, `valor_pago=null`, `forma_pagamento=null`, `observacoes=null` na mesma linha.

Confirma que posso aplicar esse update?
