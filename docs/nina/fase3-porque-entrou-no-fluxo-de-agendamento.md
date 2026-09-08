# FASE 3 — Por que um pedido informativo entrou no fluxo de agendamento

Execução base: `78e5b278-8b06-4bd0-9b9c-23e9f6553a87`
Conversa: `8bf9f63a-3c8d-4237-affb-a7e53fae6d55` (homologação, `is_teste = true`)
Mensagem final: `dbef3440-a34a-4617-a245-35a864d3e9df` — 2026-09-08 00:24:38 UTC
Clínica: POLICLINICA MENINO JESUS

Nada foi corrigido nesta fase.

## 1. Intent e estado (nomes reais do projeto)

O projeto não usa `booking_intent_confirmed`/`appointment_flow_active`. Os campos reais ficam
em `atend_conversas.nina_fluxo_estado` (tipo em `src/lib/nina/fluxo-estado-normalizar.ts`).

| Conceito do pedido | Campo real | Valor na execução |
|---|---|---|
| intent | `detectarIntencoes()` (`atendimento-fase1.ts`) | inclui `agendamento` (a mensagem contém “precisamos **agendar**”), além de `valor` e `horario` |
| booking_intent_confirmed | `appointment.intent_confirmed` | `false` |
| appointment_flow_active | `flow.stage` | **`BOOKING_INTENT_PENDING`** (visto no prompt enviado ao modelo) |
| patient_data_collected | `patient.identified` / `patient.validated` | `false` |
| slot_selected | `appointment.slot_inicio` / `slot_fim` / `slot_confirmed_by_patient` | `null` / `null` / `false` |
| final_confirmation_received | `appointment.intent_confirmed` + estágio `WAITING_FINAL_CONFIRMATION` | não ocorreu |
| appointment_attempted | ferramenta `agendar` chamada | **não** |
| appointment_created | `appointment.appointment_id` | `null` |

Origem do estágio: `derivarEtapa()` em `src/lib/nina/atendimento-fase6.ts:80` — basta a intenção
`agendamento` para virar `BOOKING_INTENT_PENDING`, e a expressão da intenção
(`atendimento-fase1.ts:34`) casa com o verbo “agendar” mesmo quando o paciente está apenas
**perguntando se precisa agendar**. Esse estágio, porém, só muda texto de prompt; ele não
bloqueou nem reescreveu a resposta.

## 2. Ferramentas chamadas

Turno base (`78e5b278`): `consultar_base_conhecimento` — sucesso, catálogo publicado retornou
profissional/procedimento.
Turnos vizinhos da mesma conversa: `f84d719e` (nenhuma), `28983a0a`, `86d73022`, `cc4c5fc6`
(`consultar_base_conhecimento`), `f19ea38d` (`consultar_base_conhecimento`, `buscar_medicos`,
`consultar_base_conhecimento`, `consultar_base_conhecimento`) — todas com sucesso.

Equivalentes de `checkAvailability` (`consultar_disponibilidade`, `verificar_horario`,
`proxima_vaga`) e de `createAppointment` (`agendar`): **nunca chamadas**.

> **Nenhuma tentativa técnica de criação de agendamento foi comprovada nesta execução.**

## 3. `conflicting_results`

Na execução base o `route_reason` gravado é **`appointment_tool_required`** (nível `medium`).
`conflicting_results` aparece na execução irmã `f19ea38d-cc76-452a-9e2f-49f649e35d79`.

O que ele significa de fato:

- Fonte: `selectThinkingLevel()` (`src/lib/nina/reasoning-router.ts`) devolve um **motivo em texto**;
  `src/lib/nina/telemetria.ts:33` converte esse texto em rótulo. Qualquer motivo que contenha
  “conflit” **ou** “interdependent” vira `conflicting_results`.
- Em `f19ea38d` o motivo real foi “várias ferramentas interdependentes no mesmo turno”
  (`reasoning-router.ts:80-82`: 2+ ferramentas distintas a partir da rodada 2). Ou seja: **não houve
  comparação de duas fontes nem divergência de campos/valores**.
- A flag de conflito real (`conflitoFerramenta`, `whatsapp.server.ts:1638`) só liga quando uma
  ferramenta devolve erro. Nenhuma ferramenta falhou nessas execuções.
- Ação disparada: apenas elevar o esforço de raciocínio para `high`. Não descarta resposta,
  não força handoff, não interfere no agendamento.

**Registro explícito:** neste projeto `conflicting_results` está sendo usado como rótulo genérico
de telemetria para “raciocínio alto”, e não como evidência de conflito de dados. Fonte A, fonte B,
campos comparados e valores divergentes: **não existem** para estas execuções.

## 4. Estado herdado

- `session_id = 65f47947-3a98-40b1-90b4-aabe1abc7720`; a conversa é de homologação e o ciclo de teste
  encerrou depois, com `nina_fluxo_estado` hoje `NULL` (reset feito).
- Nos snapshots de contexto das três rodadas, o estágio permaneceu `BOOKING_INTENT_PENDING`, sem
  paciente identificado, sem vaga e sem `appointment_id`.
- Nenhum vestígio de `BOOKING_INTENT_CONFIRMED`, `WAITING_SLOT_SELECTION`,
  `WAITING_FINAL_CONFIRMATION` ou `CREATING_APPOINTMENT` vindo de ciclo/turno anterior.

**Não houve contaminação por estado antigo.** O estágio de agenda foi derivado da própria mensagem
do turno.

## 5. Proteção de agenda disparada

Regra: `src/lib/whatsapp.server.ts:1399-1418` (+ o corte fixo em 1419-1422).

Condições de ativação: agenda ligada para a clínica (`podeAgendar = true`, padrão para todas desde
02/09/2026, `agenda-flag.server.ts`), `agendamentoConfirmado = false`, e o texto do modelo casar com
`AFIRMA_AGENDAMENTO` (`whatsapp.server.ts:1343`).

O que deveria ativá-la: a Nina **prometer/afirmar** um agendamento sem ter chamado `agendar`.
Por que ativou aqui: a expressão inclui os termos soltos `agendado|agendada|marcada|agendando`, e a
resposta informativa correta continha “atendimento agendado”. Bastou a palavra — não há checagem de
que a frase seja uma promessa dirigida ao paciente, nem de que exista intenção confirmada, vaga
escolhida ou dados coletados. Com isso a resposta boa foi descartada, a instrução `[SISTEMA]` entrou
como `role: "user"` e o turno seguinte produziu a frase de falha. No turno seguinte
(`8f574716`) a proteção agiu no ramo fixo (linha 1420), devolvendo a mesma frase direto.

## GATE DE SAÍDA

- **Existia intenção real de agendamento?** Não. O paciente pediu dias, horários, preços e regra de
  chegada. A palavra “agendar” apareceu apenas na pergunta “se precisamos agendar ou chegar por ordem”.
- **Houve tentativa real de agendamento?** Não. Nenhuma chamada a `agendar` ou a ferramentas de
  disponibilidade; nenhum `appointment_id`.
- **Qual conflito foi detectado?** Nenhum conflito de dados. `conflicting_results` é rótulo genérico
  de telemetria para raciocínio alto por ferramentas interdependentes.
- **Algum estado antigo contaminou a execução?** Não.
- **Qual proteção foi disparada indevidamente?** A defesa contra falso sucesso de agendamento
  (`whatsapp.server.ts:1399-1422`), por casamento léxico da expressão `AFIRMA_AGENDAMENTO`.
