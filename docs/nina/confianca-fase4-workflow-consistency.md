# Fase 4 — Coerência de processo e prova de ações

## Escopo

Verificar se o **caminho** que levou à resposta faz sentido, dentro do motor de
confiança já existente. Nenhum serviço novo, nenhuma máquina de estados nova:
o validador apenas **lê** o estado do fluxo do atendimento (`EstadoFluxoNina`)
e compara com o texto e com as ferramentas do turno.

Fora do escopo: prompt, roles, orquestração de rodadas, envio de mensagem,
fluxo vivo e qualquer alteração em produção.

## O que mudou

1. **Novo validador** `WorkflowConsistencyValidator`
   (`src/lib/nina/confidence/workflow.ts`), registrado junto dos demais em
   `validators.ts`. Peso 15 e dimensão crítica de cobertura.
2. **Estado operacional no contrato** (`ContextoConfianca.operationalState`):
   `bookingIntentConfirmed`, `appointmentFlowActive`, `patientDataComplete`,
   `slotSelected`, `finalConfirmationReceived`, `appointmentAttempted`,
   `appointmentToolCalled`, `appointmentCreated`, `appointmentId`,
   `workflowState`. Campo ausente = **UNKNOWN**, nunca "não aconteceu".
3. **Bloqueadores canônicos novos** em `policy.ts`:
   `WORKFLOW_STATE_MISMATCH`, `REQUIRED_TOOL_NOT_CALLED`,
   `UNSUPPORTED_OPERATIONAL_CLAIM`.
4. **Atalho de handoff removido**: `handoffSolicitado` não devolve mais
   `100/HIGH/ALLOW` cego. A nota e a cobertura passam a ser as reais; a
   liberação só acontece quando **nenhum** bloqueio foi detectado.
5. **Estado real ligado ao atendimento** (`src/lib/whatsapp.server.ts`): o
   turno passa a enviar o estado do fluxo e as regras determinísticas de
   agendamento (paciente identificado, vaga confirmada) ao motor.
6. **Política v2 -> v3**, versionada; snapshots antigos continuam lidos com a
   régua da época.

## Regras de prova

- Afirmar **sucesso** exige prova persistida (`appointment_id`).
- Afirmar **falha** exige tentativa real (ferramenta chamada) que não gravou.
- Sem tentativa, a resposta não pode afirmar falha: cai para caminho seguro
  (esclarecer/transferir).
- Ferramenta **executada** não é ferramenta que **comprovou** a frase.

## Antes e depois

- **Antes:** um pedido informativo ("dias, horários e valor") respondido com
  "Não consegui concluir seu agendamento" recebia a mesma avaliação da resposta
  correta; e `handoffSolicitado` zerava a análise devolvendo 100/HIGH/ALLOW.
- **Depois:** esse caso é bloqueado com `WORKFLOW_STATE_MISMATCH`, nunca sai
  como alta confiança, e o handoff não apaga mais bloqueios.

## Validação executada

- `bunx tsgo --noEmit`: sem erros.
- `bun test src/lib/nina`: 1.026 testes, 0 falhas.
- Gate dos oito cenários em
  `src/lib/nina/confidence/workflow-consistency.test.ts`, mais o caso
  originador avaliado pelo motor inteiro.

## Pendências

- Nenhum fluxo vivo, envio de WhatsApp, agendamento real, publicação ou teste
  transacional em produção foi executado.
- Calibração do peso 15 e dos tetos de cobertura depende de dados reais.
