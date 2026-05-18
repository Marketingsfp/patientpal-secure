## Problema
Hoje, ao clicar em "Cobrar" em um agendamento, o sistema sempre carrega `valor_dinheiro` do procedimento (R$ 110) — mesmo quando o paciente vai pagar por Pix, débito ou crédito (R$ 130). O ideal é perguntar a forma de pagamento primeiro e então gerar o valor correto.

## Solução

### 1. Novo mini-diálogo "Forma de pagamento" antes de cobrar
Em `src/routes/_authenticated/app.agenda.tsx`, no fluxo `cobrarAgendamento(a)`:
- Manter a checagem `pagosSet.has(a.id)` (já bloqueia duplicidade).
- Em vez de abrir direto o `LancamentoDialog`, abrir primeiro um pequeno diálogo (`FormaPagamentoDialog`) com 4 opções em botões grandes:
  - **Dinheiro** → usa `valor_dinheiro`
  - **Pix** → usa `valor_padrao` (fallback `valor_pix`)
  - **Cartão de Débito** → usa `valor_padrao` (fallback `valor_pix`)
  - **Cartão de Crédito** → usa `valor_padrao` (fallback `valor_pix`)
- Cada botão já mostra o valor que será cobrado (ex.: "Dinheiro — R$ 110,00", "Pix — R$ 130,00"), pré-carregado da consulta atual ao `procedimentos` (`select nome, valor_dinheiro, valor_pix, valor_padrao`).
- Ao clicar numa opção, o mini-diálogo fecha e o `LancamentoDialog` abre com:
  - `initialValor` = valor da opção escolhida
  - `formaPagamento` pré-selecionada (`dinheiro` | `pix` | `cartao_debito` | `cartao_credito`)
  - `descricao` mantida como hoje (`paciente — PROCEDIMENTO`).

Mudança mínima: a busca de valores em `cobrarAgendamento` deixa de pegar só `valor_dinheiro` e passa a obter `valor_dinheiro, valor_pix, valor_padrao` num único `select`.

### 2. Pré-selecionar forma no `LancamentoDialog`
Em `src/components/financeiro/lancamento-dialog.tsx`:
- Adicionar prop opcional `initialFormaPagamento?: string`.
- No `useEffect` de abertura, se vier definida, `setFormaPagamento(initialFormaPagamento)`.
- Nada mais muda: o usuário ainda pode trocar a forma ou usar pagamento misto se quiser.

### Fora do escopo
- Não vou alterar a tabela `procedimentos` nem introduzir colunas novas (`valor_debito` / `valor_credito`). Hoje débito/crédito caem em `valor_padrao` — se mais tarde você quiser preços diferentes por bandeira, abrimos um passo seguinte.
- Não mexer no fluxo de pagamento misto nem na lógica de bloqueio de duplicidade.

## Pergunta antes de implementar
Confirma o mapeamento abaixo? Se algum estiver errado, me diga o correto:

- Dinheiro → `valor_dinheiro`
- Pix → `valor_padrao`
- Cartão de Débito → `valor_padrao`
- Cartão de Crédito → `valor_padrao`
