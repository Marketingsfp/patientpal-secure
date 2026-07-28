## Objetivo

Hoje o pagamento de itens com entrada (sinal) na Odontologia é fixo em **duas etapas**: 1ª cobrança = sinal, 2ª cobrança = todo o saldo. O pedido é permitir que o **saldo seja pago em várias vezes**, com o caixa digitando o valor recebido a cada pagamento, e o sistema mostrando **quanto já foi pago, quanto está sendo pago agora e quanto ainda falta**.

Tipo de pedido: regra de negócio (financeiro/odontologia) + ajuste de interface no caixa da agenda.

## Situação atual (verificada no código)

- `src/lib/agenda/sinal-orcamento.ts` calcula só duas etapas e, ao registrar o pagamento do saldo, grava `valor_pago = valor total do item` e `status_financeiro = 'pago'`, **ignorando o valor realmente recebido**.
- `src/routes/_authenticated/app.agenda.tsx` força o valor da cobrança para o valor da etapa e chama `registrarPagamentoEtapaSinal(agId)` sem informar o valor pago.
- O diálogo de lançamento (`src/components/financeiro/lancamento-dialog.tsx`) já permite editar o valor ("Sugerido pelo serviço — editável").

## O que será feito

### 1. Regra de pagamento parcial (`src/lib/agenda/sinal-orcamento.ts`)
- `obterEtapaSinal` passa a devolver: total dos itens, total já pago, **restante**, valor sugerido e a etapa (`sinal` enquanto a entrada não estiver coberta, `saldo` depois).
- `registrarPagamentoEtapaSinal(agendamentoId, valorPago)` passa a receber o valor efetivamente recebido e:
  - distribui o valor entre os itens vinculados, proporcional ao saldo de cada um;
  - **soma** ao `valor_pago` já existente (nunca sobrescreve nem ultrapassa o total do item);
  - grava `status_financeiro = 'parcial'` enquanto houver saldo e `'pago'` só quando quitado;
  - mantém `sinal_pago_em` no primeiro pagamento e grava `saldo_pago_em` apenas na quitação.
- Arredondamento em centavos e tolerância de R$ 0,01 para evitar sobra residual.

### 2. Caixa da agenda (`app.agenda.tsx`)
- O valor sugerido continua sendo o sinal na primeira cobrança; nas seguintes sugere o **restante**, mas o caixa pode digitar um valor menor (pagamento parcial).
- O aviso acima do diálogo passa a mostrar, em uma linha só: **Total do tratamento • Já pago • Falta pagar**.
- Após salvar, o registro usa o valor realmente lançado (`dados.valor`), inclusive em pagamentos mistos.

### 3. Resumo dentro do diálogo do caixa (`lancamento-dialog.tsx`)
- Nova propriedade opcional `resumoSaldo` (total, já pago, restante). Quando informada, exibe um bloco acima do campo Valor com:
  - **Já pago:** R$ X
  - **Pagando agora:** R$ Y (atualiza conforme o operador digita)
  - **Falta pagar:** R$ Z (recalculado ao vivo)
- Se o valor digitado for maior que o restante, mostra aviso de que o excedente não será considerado como saldo do orçamento.
- Sem essa propriedade, o diálogo continua exatamente como hoje (nenhum outro fluxo é afetado).

### 4. Liberação do atendimento
- Continua como hoje: qualquer pagamento (sinal ou parcela do saldo) marca o item como `parcial` e libera o atendimento; o orçamento só conta como "pago" quando quitado.

## Fora do escopo
- Tela de Orçamentos (não-odontológico), carnê/parcelamento automático com vencimentos, e mudanças nas impressões (GR / orçamento A4) — a GR seguirá mostrando sinal/saldo como já faz; posso ajustar depois se quiser exibir o histórico de parcelas.

## Validação
- Checagem de tipos.
- Teste manual sugerido: orçamento odontológico com item de R$ 1.000 e sinal de R$ 300 → cobrar 300, depois 200, depois 500, conferindo o resumo em cada etapa e o status final "pago".
