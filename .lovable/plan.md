## Hoje vs. depois

**Hoje:** clicar em "Reagendar" no menu de um agendamento abre o popup da imagem (data/início/fim/médico/motivo) e o usuário digita o novo horário.

**Depois:** clicar em "Reagendar" entra em um **modo de reagendamento** na própria agenda — o usuário escolhe o novo horário clicando em um slot disponível da agenda médica. Sem popup.

## Fluxo novo

1. No menu de ações de um agendamento, clicar em **Reagendar** → entra no "modo reagendamento" (não abre dialog).
2. Aparece uma **barra fixa no topo da tela Agenda** com:
   - "Reagendando **DAIANA SOUZA DE MORAES** · Atual: 17/06/2026 17:20 — CONSULTA"
   - Botão **Cancelar reagendamento** (sai do modo).
   - Instrução: "Clique em um horário disponível para confirmar."
3. Enquanto o modo está ativo:
   - Slots disponíveis ganham um realce visual (borda/fundo `primary`) para indicar que são alvos válidos.
   - Slots ocupados ficam com cursor `not-allowed` e aparência atenuada.
4. Ao clicar em um slot disponível:
   - Confirma direto (sem dialog): atualiza `agendamentos` com `inicio`/`fim`/`medico_id` do slot escolhido, mantém `status: agendado`, e acrescenta em `observacoes` a trilha "[Reagendado em … de …]" (igual hoje).
   - Marca o slot de origem como disponível novamente (apaga `paciente_id`/`paciente_nome` e volta status para `disponivel`), para não deixar o horário antigo "fantasma" ocupando a grade — comportamento padrão de reagendamento.
   - Toast "Reagendado para dd/mm às HH:MM" e sai do modo.
5. Cliques em slots ocupados durante o modo: toast "Esse horário já está ocupado".

### Motivo do reagendamento

O campo "Motivo" some do fluxo principal (já era opcional). A trilha em `observacoes` continua sendo gravada automaticamente com data e horário anterior — só sem o texto livre. Se você quiser manter o motivo, posso adicionar um `prompt()` rápido antes de confirmar, ou um pequeno popover no slot — me diga em outra rodada.

### Reagendar para outro dia / outro médico

Já funciona naturalmente: basta o usuário navegar/filtrar para outra data ou médico **enquanto está no modo reagendamento** e clicar no slot lá. A barra fixa permanece visível durante a navegação.

## Mudanças no código

Arquivo único: `src/routes/_authenticated/app.agenda.tsx`.

- **Remover**: estado `reagOpen`, `reagData`, `reagInicio`, `reagFim`, `reagMedicoId`, `reagMotivo`, `reagSalvando`; o `<Dialog open={reagOpen}>` inteiro; corpo atual de `abrirReagendar` e `salvarReagendar`.
- **Adicionar**:
  - Estado `reagendandoAg: Agendamento | null` e `reagSalvando: boolean`.
  - `iniciarReagendamento(a)` — seta `reagendandoAg` e dá um toast informativo.
  - `cancelarReagendamento()` — limpa o estado.
  - `confirmarReagendamentoNoSlot(slot: Agendamento)` — faz dois updates em `agendamentos`:
    - no agendamento `reagendandoAg.id`: novo `inicio`/`fim`/`medico_id` (do slot), `status: 'agendado'`, `observacoes` com trilha.
    - no `slot.id` (o slot disponível clicado): volta para `status: 'disponivel'` com `paciente_id: null`, `paciente_nome: 'DISPONÍVEL'` (mesmo padrão usado hoje pela grade).
  - Barra fixa no topo (sticky) renderizada condicionalmente quando `reagendandoAg` existe.
- **Ajustar `openSlot(a)`**: no início, se `reagendandoAg` está setado → chamar `confirmarReagendamentoNoSlot(a)` e `return` (não abre o dialog de novo agendamento).
- **Ajustar a célula da grade do médico (`SlotCell`)**: quando em modo reagendamento, slots livres recebem classes de realce; ocupados recebem `opacity-60 cursor-not-allowed` e `onAgClick` mostra o toast de bloqueio em vez do menu.
- **Menu de ações**: o item "Reagendar" passa a chamar `iniciarReagendamento(a)` em vez de `abrirReagendar(a)`.

Sem mudanças em banco, RLS, server functions ou outras telas.
