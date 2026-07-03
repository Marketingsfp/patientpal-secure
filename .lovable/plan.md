## Regra final

Paciente com mensalidade vencida no cartão benefícios:
- **Agendamento**: continua bloqueando quando "Tipo de atendimento" = Convênio (já implementado). Nada muda aqui.
- **Pagamento**: passa a bloquear também. Só libera se a categoria/forma escolhida for Particular.

## O que ajustar no diálogo de pagamento (`src/components/financeiro/lancamento-dialog.tsx`)

1. **Respeitar o tipo do agendamento no default**  
   Hoje o diálogo, ao abrir, procura contrato ativo do paciente e já pré-seleciona a categoria com o nome do convênio. Vou passar a ler também `agendamentos.tipo_atendimento`:
   - Se o agendamento estiver marcado como `particular`, forçar categoria = "Particular" e forma ≠ `convenio`, ignorando o auto-match por contrato.
   - Se estiver como `convenio`, mantém o comportamento atual.

2. **Buscar débito do cartão ao abrir**  
   Quando houver `agendamentoId` com `paciente_id`, chamar a RPC `paciente_cartao_inadimplente(_paciente_id, _clinica_id)` e guardar em estado `bloqueioCartao` (total em aberto, quantidade de parcelas).

3. **Aviso visível no topo do diálogo**  
   Se `bloqueioCartao.bloqueado`, mostrar um alerta vermelho:
   > "Paciente com R$ X,XX em atraso no cartão benefícios (N parcela(s)). Este atendimento só pode ser pago como **Particular**."

4. **Bloqueio efetivo no `handleSave`**  
   Se `bloqueioCartao.bloqueado` e a categoria/forma escolhida for de convênio (categoria cujo nome bate com o convênio do contrato, ou forma de pagamento `convenio`, ou linhas do pagamento misto com forma `convenio`), impedir salvar com `toast.error` explicando o motivo. Não gravar `pagamentos`, `pagamento_splits` nem `fin_lancamentos`.

5. **Sincronizar `agendamentos.tipo_atendimento` no ato do pagamento**  
   Ao salvar com sucesso e o pagamento for reconhecido como Particular (categoria "Particular" ou forma ≠ convênio), atualizar `agendamentos.tipo_atendimento = 'particular'` para o agendamento vinculado — assim o check-in não bloqueia por causa de uma marcação antiga.  
   Se o pagamento for em Convênio (e passou pelo bloqueio, ou seja, sem débito), atualizar para `convenio`.

## Detecção de "pagamento em convênio"

Considera-se pagamento em Convênio quando **qualquer** um for verdadeiro:
- Categoria selecionada tem nome que casa (normalizado) com o `cb_convenios.nome` do contrato ativo do paciente.
- Forma de pagamento simples = `convenio`.
- No modo misto, qualquer linha com forma `convenio`.

Caso contrário, é Particular.

## Fora de escopo

- Não mexer no bloqueio de agendamento (já está correto).
- Não mexer em `app.checkin.tsx` (já respeita `tipo_atendimento`).
- Não alterar RPC `paciente_cartao_inadimplente` nem schema do banco.
- Não alterar layout geral do diálogo, só adicionar o alerta e o gate no save.

## Arquivos

- `src/components/financeiro/lancamento-dialog.tsx` — todas as mudanças acima.
