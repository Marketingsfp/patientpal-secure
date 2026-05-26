## Objetivo

Ao clicar em **Pagar** em uma mensalidade do contrato (tela "Resumo"), abrir o mesmo diálogo de **Forma de pagamento** que já existe na agenda (foto 2), em vez de marcar a parcela como paga direto.

## Comportamento

- Clique em **Pagar** numa linha da tabela de Mensalidades abre o diálogo.
- Cabeçalho: "Forma de pagamento" + subtítulo com nome do paciente, nº do contrato e nº da parcela (ex.: `QUÉDIMA SILVA — Contrato #12 · Parcela 1/12`).
- Mesma dica de teclas 1–5.
- Opções listadas, todas mostrando o valor da parcela (`m.valor`):
  1. Dinheiro
  2. Pix
  3. Cartão de Débito
  4. Cartão de Crédito
  5. Boleto
  6. Mais de uma forma de pagamento (botão destacado azul, igual à agenda)
- Atalhos de teclado 1–6 enquanto o diálogo está aberto.

## O que acontece ao escolher a forma

- Opções 1–5: salva a parcela como paga com `status = "pago"`, `pago_em = hoje` e `forma_pagamento = <forma escolhida>` em `contrato_mensalidades`.
- Opção 6 ("Mais de uma forma"): abre o `LancamentoDialog` já usado pela agenda (componente `src/components/financeiro/lancamento-dialog.tsx`) com:
  - `tipo="receita"`, `initialValor = m.valor`, `initialDescricao = "Mensalidade <#parcela> — Contrato #<num> — <paciente>"`.
  - Ao salvar, atualiza a parcela como paga (`forma_pagamento = "misto"` ou a forma consolidada retornada) — não cria lançamento financeiro duplicado além do que o próprio `LancamentoDialog` já gera.

Botão **Reverter** (quando a parcela já está paga) permanece como está.

## Arquivos a editar

- `src/routes/_authenticated/app.contratos.tsx`
  - Adicionar estado `pagamentoMens` (a mensalidade selecionada) e `formaPagOpen`.
  - Adicionar componente `<Dialog>` de forma de pagamento, espelhando o da agenda (linhas 1284–1320 de `app.agenda.tsx`).
  - Trocar `onClick={() => marcarPago(m.id, true)}` por `onClick={() => abrirFormaPag(m)}`.
  - Adicionar handler `escolherForma(forma)` que chama um `marcarPago(id, true, forma)` estendido (passa também `forma_pagamento`).
  - Adicionar integração com `LancamentoDialog` para "Mais de uma forma".
  - Listener `useEffect` para atalhos 1–6 enquanto o diálogo está aberto.

Sem alterações em banco, RLS, ou outros arquivos.

## Fora de escopo

- Não recalcular taxa de boleto na hora do pagamento (a taxa de R$ 3,50 já é aplicada na criação do contrato, conforme combinado anteriormente).
- Sem mudanças no fluxo de "Reverter".
