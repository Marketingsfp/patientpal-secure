## Objetivo

Permitir desfazer a baixa (voltar o atendimento para "Confirmado") **sem exigir estorno do pagamento do paciente**, e habilitar essa ação **em lote**.

Hoje, `desfazerBaixa` bloqueia com "Há lançamento pago no caixa vinculado. Estorne pelo Mov. Caixa antes de desfazer a baixa." sempre que existe `fin_lancamentos` com `valor > 0` vinculado. O pagamento do paciente é uma trilha financeira independente do status médico do atendimento — não precisa ser estornado só para reverter a baixa.

## Mudanças (em `src/routes/_authenticated/app.financeiro.atendimentos.tsx`)

### 1. `desfazerBaixa` — remover o bloqueio do lançamento pago
- Remover o `toast.error` + `return` quando existe `fin_lancamentos` com `valor > 0` (nos dois ramos: origem `agenda` e origem `manual`).
- Continuar apagando apenas os lançamentos-sombra (R$ 0,00) — não mexer nos lançamentos pagos do paciente.
- Manter o bloqueio quando `repasse_pago` é true (repasse ao médico exige estorno próprio — outra trilha).
- Ajustar o texto do `confirm()` para deixar claro que **o pagamento do paciente permanece intacto**.

### 2. Novo `desfazerBaixaLote`
- Alvos: `selectedItems.filter(a => !a.repasse_pago && isAtendido(a))`.
- Atualiza `agendamentos.status = 'confirmado'` para os de origem `agenda` e `fin_atendimentos.status = 'confirmado'` para manuais (mesmo shape de `darBaixaLote`, mas na direção inversa).
- Apaga lançamentos-sombra (R$ 0,00) vinculados; ignora lançamentos pagos.
- Não bloqueia por lançamento pago; bloqueia se algum selecionado tiver `repasse_pago` (pede para deselecionar).

### 3. UI — expor a ação em lote
- Derivar `selectedBaixados = selectedItems.filter(a => !a.repasse_pago && isAtendido(a))`.
- Nos dois `DropdownMenu` de "Opções" (toolbar do topo, ~L1620, e barra sticky do rodapé, ~L2229), adicionar item **"Desfazer baixa (n)"** logo abaixo de "Dar baixa", com ícone e desabilitado quando `selectedBaixados.length === 0`.

Nenhuma mudança de schema/RLS. Nenhuma mudança nos botões individuais da linha — o botão "Baixado" já chama `desfazerBaixa`, que passará a funcionar sem exigir estorno.

## Comportamento resultante

- Clicar em "Baixado" numa linha com pagamento do paciente: pede confirmação e volta para "Confirmado". O lançamento no caixa permanece.
- Selecionar várias linhas baixadas → Opções → "Desfazer baixa (n)": reverte todas de uma vez.
- Se qualquer selecionada tiver repasse já pago, a opção fica desabilitada (fluxo separado de estorno de repasse).
