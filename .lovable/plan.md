# Pagamento de parcelas de convênio com GR

Hoje, na **Agenda**, ao clicar em "Pagar" o sistema executa esta sequência:

1. Abre o diálogo "Forma de pagamento" (1=Dinheiro, 2=PIX, 3=Débito, 4=Crédito, 5=Mais de uma forma).
2. Abre o `LancamentoDialog` já preenchido (descrição, valor, forma) — o caixa confirma valor recebido / troco / parcelas.
3. Ao salvar: cria `fin_lancamentos` (receita), marca o agendamento como pago, avança o fluxo e **imprime a GR** via `printGuiaAtendimento` com os dados do pagamento (forma, valor, parcelas, detalhe misto).

Em **Convênios → Contratos**, ao pagar uma parcela, hoje só atualizamos `contrato_mensalidades.status = pago` (forma direta) ou abrimos o `LancamentoDialog` apenas no caso "Misto". Não há geração de GR e o caminho rápido não registra `fin_lancamentos`. Esta tarefa unifica o fluxo.

## Mudanças

### 1. Banco — preparar `gr_impressoes` para parcelas
- Tornar `gr_impressoes.agendamento_id` **nullable**.
- Adicionar coluna `mensalidade_id uuid` (FK → `contrato_mensalidades.id`, `ON DELETE CASCADE`), nullable, com índice.
- Adicionar `CHECK` garantindo que **exatamente um** dos dois (`agendamento_id` ou `mensalidade_id`) esteja preenchido.
- Manter políticas RLS atuais (continuam válidas por `clinica_id`).

### 2. `src/lib/print-gr.ts` — nova função `printGuiaMensalidade`
- Input: `{ mensalidadeId, clinicaId, usuarioNome, usuarioId, reimpressao?, pagamento }`.
- Carrega dados de `contrato_mensalidades` + `contratos_assinatura` + `planos_assinatura` + `pacientes` + `clinicas` para montar o cabeçalho.
- Reaproveita o mesmo layout 80mm da GR de atendimento (cabeçalho da clínica, dados do titular, descrição "Mensalidade X/N — Contrato #NNNN — Plano …", bloco de pagamento com forma/parcelas/bandeira/valor/troco/detalhe misto e rodapé com via 1ª/2ª).
- Controla vias 1ª/2ª por `mensalidade_id` (mesma regra de `agendamento_id`).
- Exporta também `reimprimirGuiaMensalidade` (atalho com `reimpressao: true`).

### 3. `src/routes/_authenticated/app.contratos.tsx` — espelhar fluxo da Agenda
- Em `abrirFormaPag` continuar exibindo o diálogo de forma de pagamento (1–5).
- Trocar `escolherForma`: em vez de chamar `marcarPago` direto, abrir o `LancamentoDialog` com:
  - `tipo="receita"`, `initialDescricao = "Mensalidade X/N — Contrato #NNNN — <titular>"`, `initialValor = pagMens.valor`, `initialFormaPagamento = forma escolhida`.
- `escolherMisto` já abre o `LancamentoDialog` — passar `initialFormaPagamento="__misto__"` (igual à Agenda).
- No `onSavedWithData` do `LancamentoDialog`:
  1. `marcarPago(pagMens.id, true, dados.forma_pagamento ?? "misto")` — atualiza `contrato_mensalidades` (status/pago_em/forma); o `fin_lancamentos` já foi criado pelo próprio `LancamentoDialog`.
  2. Chamar `printGuiaMensalidade({ mensalidadeId, clinicaId, usuarioNome, usuarioId, pagamento: { valor, forma_pagamento, parcelas, bandeira_cartao, detalhe: pagamentos_detalhe } })`.
  3. Toast de sucesso "Pagamento registrado e GR enviado para impressão." e fechar o diálogo.
- "Reverter" continua disponível (mantém comportamento atual).

## Detalhes técnicos

- A migração precisará atualizar a `CHECK` em duas etapas se houver dados antigos (todos têm `agendamento_id` hoje, então o CHECK `((agendamento_id IS NOT NULL) <> (mensalidade_id IS NOT NULL))` valida sem backfill).
- O `LancamentoDialog` já popula `pagamentos_detalhe` (forma misto) e dispara `onSavedWithData` — sem alterações nele.
- Não vincular `fin_lancamentos.agendamento_id` (não existe agendamento). Opcionalmente, podemos preencher `contrato_mensalidades.lancamento_id` com o id da receita criada — isso já existe na tabela; pode ficar para uma melhoria futura se o `LancamentoDialog` não devolver o id (não devolve hoje), então **fora deste escopo**.

## Arquivos

- `supabase/migrations/<novo>.sql` — alteração de `gr_impressoes`.
- `src/lib/print-gr.ts` — adicionar `printGuiaMensalidade` e `reimprimirGuiaMensalidade`.
- `src/routes/_authenticated/app.contratos.tsx` — novo fluxo de pagamento de parcela.
