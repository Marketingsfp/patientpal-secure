# FASE 7 — Validação do Confidence Engine v2 antes de virar gate de produção

Relatório de validação. Nenhuma conversa real, mensagem de WhatsApp, agendamento,
handoff vivo ou publicação foi executada nesta fase.

## 1. Arquitetura anterior

O motor v1 avaliava o rascunho da resposta e somava validadores. Dimensões sem
evidência não pesavam no denominador, handoff virava atalho para nota máxima e o
texto avaliado podia não ser o texto enviado (pós-processamento entrava depois).

## 2. Causas dos falsos 100%

- Ausência de evidência tratada como "nada encontrado de errado".
- `NOT_APPLICABLE` e `UNKNOWN` misturados no mesmo denominador.
- Intenção ausente convertida em `responder_informacao`.
- Afirmação de agendamento aceita sem `appointment_id`.
- `catalogoEncontrou = true` legitimando a resposta inteira.
- Handoff solicitado promovendo a mensagem a 100/HIGH.

## 3. Arquivos alterados nesta fase

- `src/lib/nina/confidence/gate-v2.ts` (novo) — 10 casos determinísticos,
  comparação shadow v1 x v2 e assertions do Test Runner.
- `src/lib/nina/confidence/gate-v2.test.ts` (novo).
- `src/lib/nina/confidence/policy.ts` — `VERSAO_MOTOR = "confidence-v2"`,
  `VERSOES_MOTOR_HISTORICAS` e `ehVersaoMotorHistorica()`.
- `src/lib/nina/confidence/engine.ts` — handoff deixa de elevar
  `answer_confidence` a 100 (teto no limite HIGH).
- `src/lib/nina/confidence/runtime.ts` — claims estruturados do turno passam
  a chegar ao motor.
- `src/lib/nina/cenarios.functions.ts` — Test Runner passa a checar os
  snapshots reais de confiança.

Reutilizados sem duplicação: `shadow.ts`, `etapas.ts`, `etapas-flag.server.ts`,
`shadow-flag.server.ts`, `shadow-matriz.ts`. Nenhuma flag paralela foi criada.

## 4. Contexto, validadores, blockers e matemática

- Contexto canônico do turno (intent, ação, entidades, campos obrigatórios,
  ambiguidade, conflitos, fontes, regras, estado operacional, claims).
- Validadores novos: `WorkflowConsistencyValidator` e `ClaimGroundingValidator`.
- Blockers novos: `WORKFLOW_STATE_MISMATCH`, `REQUIRED_TOOL_NOT_CALLED`,
  `UNSUPPORTED_OPERATIONAL_CLAIM`, `UNGROUNDED_CLAIM`.
- Score e `evidence_coverage` são separados; cobertura baixa limita a nota;
  dimensão crítica desconhecida nunca é HIGH; sem evidência o score é 0.
- Verificação da resposta final por hash do texto e grounding por afirmação.
- Persistência com `outgoing_message_id`, `nina_session_id`, `engine_version`,
  `policy_version`, cobertura e conflitos auditáveis.

## 5. Resultado do gate (shadow, modo observação)

| Caso | Esperado | Resultado |
|---|---|---|
| 1 informativa correta | alta confiança | PASS — 100 / HIGH / ALLOW |
| 2 falsa falha de agendamento | workflow mismatch | PASS — 0 / LOW / HANDOFF (`WORKFLOW_STATE_MISMATCH`) |
| 3 agendamento sem `appointment_id` | bloqueio crítico | PASS — BLOCK_ACTION |
| 4 preço sem catálogo | bloqueio/handoff | PASS — HANDOFF (`MISSING_REQUIRED_OFFICIAL_SOURCE`) |
| 5 vários fatos com evidência | sem penalidade | PASS — 100 / HIGH |
| 6 claim sem fonte | confiança reduzida | PASS — HANDOFF (`UNGROUNDED_CLAIM`) |
| 7 intent desconhecida | nunca HIGH 100 | PASS — 40 / LOW |
| 8 tudo UNKNOWN/N-A | nunca 100 | PASS — 40 / LOW |
| 9 texto A x texto B | score não migra | PASS — avaliação recalculada |
| 10 handoff | ação segura ≠ 100 | PASS — 90 / HIGH |

Em shadow nenhum caso interferiu na resposta (`interferiu = 0`).

## 6. Regressão encontrada e corrigida

Caso 10 reprovou na primeira execução: o handoff ainda produzia
`answer_confidence = 100`. O motor passou a limitar a nota da mensagem ao teto
HIGH quando há transferência: a ação continua segura, mas isso não comprova o
conteúdo do texto.

## 7. Calibração

`calibracao.ts` e `metricas.ts` correlacionam erro por `message_id` /
`execucao_id` (conversa só como fallback legado) e expõem taxa de erro em alta
confiança por faixa (90–99, 75–89, 50–74, 0–49). Pesos não são ajustados
automaticamente: proposta → revisão humana → aprovação → nova versão da
política. A Nina nunca altera o próprio motor.

## 8. Testes

`bunx tsgo --noEmit` sem erros. `bun test src/lib/nina`: 1.068 testes,
0 falhas, 6.845 expectations.

## 9. Recomendação de ativação

1. Manter etapa A (observação) com `engine_version = confidence-v2` até haver
   amostra real suficiente por faixa de confiança.
2. Comparar v1 x v2 pela mesma mensagem (`compararShadow`) e revisar as
   decisões alteradas.
3. Avançar para etapa B somente quando a faixa 90–99 apresentar taxa baixa de
   erro confirmado; depois C e, por último, D (agendamento).

## 10. Pendências

- Amostra real de produção ainda não coletada sob a versão v2; a conferência
  estatística das faixas depende desses dados.
- Nenhum fluxo vivo, envio ou teste transacional foi executado nesta fase.
