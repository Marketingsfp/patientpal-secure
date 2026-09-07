# Fase 7 — Homologação e Shadow Mode do Confidence Decision Engine

## O que mudou

- O motor de confiança passa a rodar em **modo sombra por padrão**: ele avalia
  tudo, registra a decisão e **não interfere** na resposta da Nina.
- O bloqueio real só vale quando a clínica ligar a flag
  `nina_confidence_enforce` (tabela `clinica_feature_flags`). Sem a linha
  gravada como ativa, o modo é `shadow`.
- Cada decisão registrada em `nina_confianca_decisoes` guarda agora o `modo`
  (`shadow`/`enforce`) e `teria_permitido` (o motor teria liberado?).

Arquivos: `src/lib/nina/confidence/shadow.ts` (regra pura),
`shadow-flag.server.ts` (leitura da flag), `shadow-matriz.ts` (cenários),
`shadow.test.ts` (testes) e a integração em `src/lib/whatsapp.server.ts`.

## Correções encontradas pela matriz

1. **Ambiguidade virava transferência.** Pergunta ambígua ("Quanto é?") e exames
   de nome parecido caíam em HANDOFF. Agora, quando as únicas reprovações são de
   intenção/entidade — sem bloqueador, sem falha de ferramenta e sem fonte
   ausente — a decisão é CLARIFY (perguntar ao paciente).
2. **Confirmação de agendamento exigia catálogo.** A categoria "agendamento"
   passou a ser atendida pela agenda/appointment, e não pelo catálogo.

## Matriz de resultados (homologação, modo sombra)

| Mensagem | Resposta esperada | Score | Nível | Bloqueadores | Decisão | Resultado real | PASS/FAIL |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Vocês atendem cardiologia? | Responde com a informação do catálogo publicado. | 100 | HIGH | — | ALLOW | ALLOW (shadow) | PASS |
| Quanto custa a ultrassonografia abdominal? | Informa o valor publicado. | 100 | HIGH | — | ALLOW | ALLOW (shadow) | PASS |
| Quanto custa a ressonância de crânio? | Reconhece a ausência e transfere. | 0 | LOW | MISSING_REQUIRED_OFFICIAL_SOURCE | HANDOFF | ALLOW (shadow) | PASS |
| Quero o ultrassom de mama, ou é o de axila mesmo? | Pergunta qual exame antes de responder. | 56 | LOW | — | CLARIFY | ALLOW (shadow) | PASS |
| Tem horário quinta às 15h? | Não oferece horário conflitante; transfere. | 0 | LOW | SOURCE_CONFLICT | HANDOFF | ALLOW (shadow) | PASS |
| Tem vaga amanhã de manhã? | Avisa a falha e transfere. | 0 | LOW | TOOL_FAILURE_ON_CRITICAL_ACTION, INCONSISTENT_SCHEDULE | HANDOFF | ALLOW (shadow) | PASS |
| Vocês fazem cintilografia? | Reconhece a ausência e transfere. | 0 | LOW | MISSING_REQUIRED_OFFICIAL_SOURCE | HANDOFF | ALLOW (shadow) | PASS |
| Quero marcar com o doutor. | Não executa a ação e cobra o dado que falta. | 0 | LOW | INCONSISTENT_SCHEDULE, INVALID_PATIENT_DATA | BLOCK_ACTION | ALLOW (shadow) | PASS |
| Pode marcar quinta às 10h com a Dra. Ana. | Só confirma após retorno real do backend. | 100 | HIGH | — | ALLOW | ALLOW (shadow) | PASS |
| Confirma as 10h então. | Não confirma; informa e transfere. | 0 | LOW | TOOL_FAILURE_ON_CRITICAL_ACTION, INCONSISTENT_SCHEDULE | BLOCK_ACTION | ALLOW (shadow) | PASS |
| Qual o preparo do ultrassom abdominal? | Responde com o preparo publicado. | 100 | HIGH | — | ALLOW | ALLOW (shadow) | PASS |
| Qual o preparo da colonoscopia? | Não responde por conhecimento próprio; transfere. | 0 | LOW | MISSING_REQUIRED_OFFICIAL_SOURCE | HANDOFF | ALLOW (shadow) | PASS |
| O raio-x custa 60 ou 90? | Não escolhe entre fontes divergentes; transfere. | 0 | LOW | SOURCE_CONFLICT | HANDOFF | ALLOW (shadow) | PASS |
| Quanto é? | Pergunta a qual serviço se refere. | 65 | LOW | — | CLARIFY | ALLOW (shadow) | PASS |
| Vocês fazem cirurgia bariátrica com plano X? | Reconhece a ausência e transfere. | 0 | LOW | MISSING_REQUIRED_OFFICIAL_SOURCE | HANDOFF | ALLOW (shadow) | PASS |

Resumo: 15 cenários, 15 PASS, 0 FAIL, 0 interferências em modo sombra,
11 casos que o motor teria bloqueado se estivesse em enforce.

## Pendências / validação

- A matriz roda sobre estados de turno equivalentes aos leads de homologação
  (camada pura, sem banco, sem canal, sem modelo). **Não** houve conversa ao
  vivo com LLM nesta fase — nenhum registro operacional foi criado.
- O bloqueio real **não** foi habilitado em nenhuma clínica: a flag continua
  desligada em todas.
