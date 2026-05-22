## Bug

Ao confirmar o reagendamento clicando num horário livre, o código tenta atualizar o slot escolhido com `status: "disponivel"`, mas esse valor **não existe** no enum `agendamento_status` (válidos: `agendado`, `confirmado`, `realizado`, `cancelado`, `faltou`). Por isso o toast:

> `invalid input value for enum agendamento_status: "disponivel"`

A convenção real do sistema para "slot livre" é: `paciente_nome = 'DISPONÍVEL'`, `paciente_id = null`, e o `status` permanece como `agendado` (foi assim que os slots foram criados em Disponibilidades — todos os 356 slots livres atuais estão como `agendado`).

## Correção

Arquivo único: `src/routes/_authenticated/app.agenda.tsx`, dentro de `confirmarReagendamentoNoSlot`.

Trocar o update do slot escolhido (que foi "consumido" pelo paciente reagendado) para usar o status correto:

- antes: `status: "disponivel"`
- depois: `status: "agendado"` (mantém a convenção da grade — o que indica "livre" é `paciente_nome = 'DISPONÍVEL'` e `paciente_id = null`, não o status)

O resto da função permanece igual. Nenhum outro arquivo, migração ou política precisa mudar.
