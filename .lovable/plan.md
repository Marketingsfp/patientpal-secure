## Diagnóstico

O erro **"Já existe um registro com esses dados"** é a tradução de uma violação
de índice único no banco (`uq_agend_slot_vazio`, que exige unicidade em
`clinica_id + medico_id + agenda_id + inicio` para slots vazios).

O Dr. João Hélio tem **duas agendas paralelas no mesmo dia/horário** (é comum
em agendas de exames, para atender dois pacientes ao mesmo tempo em salas
diferentes):

- Agenda `2e408b29…` (a que a Vania está ocupando em 11/08 às 12:30).
- Agenda `1c0ddcb9…` (paralela, com um slot DISPONIVEL às 12:30 em 11/08).

O fluxo atual de reagendamento (`reagendar-agendamento.functions.ts`) faz uma
"troca" do slot para preservar o mesmo ID do agendamento. Nessa troca:

1. Pega o slot vazio de destino (por exemplo, 23/07 12:10 na agenda paralela
   `1c0ddcb9…`).
2. Reescreve esse slot vazio para assumir o horário/agenda **antigos** da
   Vania — mas mantém o `agenda_id` de destino (`1c0ddcb9…`).
3. Isso cria a chave `(medico, 1c0ddcb9…, 11/08 12:30, paciente_id NULL)` —
   que **já existe** (é o slot DISPONIVEL da agenda paralela).
4. O banco rejeita com `unique_violation` → toast genérico.

Ou seja: sempre que existe uma agenda paralela do mesmo médico com um slot
vazio exatamente no horário antigo, o reagendamento quebra. Regra afetada:
Passo B (`docs/agenda/criar-agendamento-shared.md`) — a criação está OK; só o
reagendamento tem esse defeito.

## Plano

Ajustar o swap em `src/lib/agenda/reagendar-agendamento.functions.ts` para
também trocar o `agenda_id` entre origem e slot de destino (hoje só troca
horário/médico). Assim o slot vazio "herda" a posição completa do antigo
horário (agenda inclusa), evitando colisão com slots paralelos.

Mudança pontual, cirúrgica:

- Passo 3 (dest_slot temporário): passa a atualizar `agenda_id` para o
  `antigo.agenda_id` da origem (além de `inicio`, `fim`, `medico_id`).
- Passo 4 (origem): passa a atualizar `agenda_id` para o `agenda_id` do
  dest_slot capturado no Passo 1 (além de `inicio`, `fim`, `medico_id`,
  `observacoes`).
- Passo 5 (limpar marker) permanece igual.

Isso deixa a origem coerente com a agenda do novo horário e o slot vazio
"reciclado" coerente com a agenda do horário antigo — sem conflito com o
índice único.

### Detalhes técnicos

- Arquivo único: `src/lib/agenda/reagendar-agendamento.functions.ts`.
- Adicionar `agenda_id` ao `select` da origem (linha 79).
- Adicionar `agenda_id: destSlot.agenda_id` ao SELECT/tipagem do destSlot
  (linhas 121, 128).
- Incluir `agenda_id: antigo.agenda_id` no update do Passo 3 (linhas 159–167).
- Incluir `agenda_id: destSlot.agenda_id` no update do Passo 4
  (linhas 175–183).
- Nenhuma alteração em `criar-agendamento.functions.ts`, na Agenda clássica,
  no wizard V2, ou em qualquer regra de negócio de criação (Passo B intacto).
- Nenhuma migração de banco.

### Validação proposta (depois do fix)

1. Reagendar a Vania Maria Dario (11/08 12:30 → um horário novo com o Dr.
   João Hélio) e confirmar que salva sem erro.
2. Confirmar via SQL que o mesmo `agendamento.id` foi preservado (contrato do
   Passo B).
3. Conferir que o slot antigo (11/08 12:30 na agenda `2e408b29…`) voltou a
   ficar DISPONIVEL e que o slot paralelo (`1c0ddcb9…` no mesmo horário)
   continua intacto.
4. Rodar um segundo reagendamento em uma agenda sem paralela para garantir
   que o comportamento normal (sem paralelas) continua funcionando.

### Escopo / não-escopo

- **Dentro**: correção do reagendamento em todas as clínicas (é bug técnico,
  não regra de negócio — global conforme regra 1.10 do AGENTS.md, mas
  confirmo antes de aplicar).
- **Fora**: mudanças no wizard "Nova sessão" da Agenda V2, na criação
  clássica, no modelo de slots pré-gerados, ou em qualquer política/RLS.

### Confirmação necessária antes de implementar

- **Clínica-alvo**: aplicar globalmente (todas as 3 clínicas)? É correção
  técnica pura sem regra de negócio nova, mas quero confirmar conforme a
  regra 1.10 do AGENTS.md.
