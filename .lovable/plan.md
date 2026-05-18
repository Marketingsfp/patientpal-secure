Em `src/components/financeiro/lancamento-dialog.tsx`, refatorar o bloco de pagamento misto:

**Estrutura das linhas**
- `pagamentos: Array<{ forma, recebido }>` (sem campo `valor`).
- Cada linha mostra: Forma + Recebido + botão Restante + remover. Se Dinheiro, mostra Troco abaixo.

**Cálculo derivado por linha**
- Dinheiro: `pago = min(recebido, restanteAntesDessaLinha)`, `troco = max(0, recebido - pago)`.
- Outras formas: `pago = recebido`, `troco = 0`.
- `totalPagoMisto = Σ pago`, `restanteMisto = max(0, valor - totalPagoMisto)`.

**Botão Restante**: preenche `recebido` com o que falta para zerar naquela linha.

**Validação no salvar**: soma dos `pago` deve igualar o valor total (tol. 0,01). Observação registrada usa `pago` por linha, citando troco quando houver.

**Escopo**: apenas esse arquivo. Não mexer no modo single, cartão de crédito, NFS-e ou fluxo da Agenda.