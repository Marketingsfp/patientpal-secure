## O que vai acontecer

Dar baixa nas 12 mensalidades pendentes do contrato **20260369 — DEBORA CATARINA TENORIO L** marcando-as como **pagas na data de hoje (16/07/2026)**, **sem gerar receita** no módulo financeiro (nenhum lançamento em `fin_lancamentos`).

## Escopo — o que muda no banco

**Tabela `contrato_mensalidades`** (12 linhas, contrato_id `f25e1deb-1733-4421-9f1c-3e98edc19ffc`):
- `status` → `pago`
- `pago_em` → `2026-07-16`
- `valor_pago` → mesmo valor da parcela (R$ 155,00)
- `forma_pagamento` → `manual`
- `observacoes` → `"Baixa manual — contrato renovado no 20260370 (16/07/2026)"`
- `lancamento_id` fica `NULL` (é isso que garante que nenhuma receita é criada)

Nenhuma outra tabela é tocada. O status do contrato 20260369 permanece `ativo` (posso cancelar depois se você pedir).

## Fora do escopo

- Não altero o contrato 20260370 (renovado).
- Não crio nada em `fin_lancamentos` (é justamente o "sem gerar receita").
- Não mexo em `caixa_movimentos`, `boletos`, `pagamentos`, `nfse` ou qualquer integração.
- Não altero código.

## Validação

- Consulta antes: 12 mensalidades pendentes, `pago_em NULL`, `lancamento_id NULL`.
- Executar o UPDATE.
- Consulta depois: as 12 devem estar `status = 'pago'`, `pago_em = 2026-07-16`, `valor_pago = 155.00`, `lancamento_id` ainda `NULL`.
- Conferir no financeiro que **não** apareceu receita nova de R$ 1.860,00 no dia 16/07.

## Riscos e pontos de atenção

- Operação em produção, mas totalmente reversível: se precisar, dá para voltar as 12 linhas ao estado anterior (status = `pendente`, `pago_em` = NULL, `valor_pago` = NULL) — desde que você me avise antes que alguma outra ação seja tomada em cima delas.
- O contrato 20260369 continuará `ativo` na listagem, agora com 12/12 parcelas pagas. Se preferir que ele também apareça como "encerrado", me peça um segundo passo para cancelar o contrato.
- Nenhum impacto em agenda, prontuário, LGPD, permissões ou repasses.
