## Objetivo
Adicionar um botão **"Dá baixa"** em cada linha da tabela **Atendimentos** (`/app/financeiro/atendimentos`), posicionado logo antes do botão de excluir. Ele permite ao financeiro marcar o atendimento como realizado nos casos em que o médico não usa o sistema, liberando o repasse.

## Comportamento

- Aparece somente quando o atendimento ainda **não foi baixado** (agendamento com status diferente de `realizado`, ou lançamento manual com status diferente de `realizado`) — exatamente o mesmo critério que hoje exibe o selo "⏳ Aguarda atend.".
- Ao clicar:
  - Confirma com um diálogo ("Confirmar baixa do atendimento? O repasse do médico será liberado.").
  - Para itens da **agenda** (`origem === "agenda"`): atualiza `agendamentos.status = 'realizado'` no registro vinculado.
  - Para itens **manuais** (`origem === "manual"`, `fin_lancamentos`): atualiza `fin_lancamentos.status = 'realizado'`.
  - Registra em `logs` (via `logAction`) a ação de baixa manual pelo financeiro (auditoria).
  - Recarrega a lista e mostra toast de sucesso.
- Após a baixa, a linha passa a se comportar como "atendido": o checkbox de seleção para **Pagar repasse** fica habilitado, exatamente como hoje quando o médico marca via agenda.
- Fica oculto para o perfil **médico** (`isMedicoOnly`), assim como as demais ações administrativas já são.
- Fica oculto quando o repasse já está pago (nada a baixar).

## UI

- Ícone: `CheckCircle2` (lucide) em verde suave, `variant="ghost"`, `size="icon"`, `h-7 w-7`, `title="Dá baixa (marcar como realizado)"`.
- Posicionado **imediatamente antes** do botão de excluir (`Trash2`) tanto no bloco `origem === "agenda"` quanto no bloco de lançamentos manuais.

## Arquivos afetados

- `src/routes/_authenticated/app.financeiro.atendimentos.tsx` — adicionar handler `darBaixa(a)`, importar `CheckCircle2` (já importado) e `logAction`, renderizar o botão nas duas branches de ações; após sucesso, chamar o mesmo reload usado por outras mutações.

## Fora de escopo

- Não altera regras de RLS nem cria migração — as políticas atuais já permitem que o financeiro atualize `agendamentos.status` e `fin_lancamentos.status` da própria clínica.
- Não mexe na aba **Estorno** nem em outras rotas.
