# FASE 1 — Baseline do Confidence Engine e testes de superconfiança

Nenhuma lógica do motor foi alterada. Foi adicionado apenas um arquivo de teste que
**congela o comportamento atual**, incluindo os defeitos.

Arquivo: `src/lib/nina/confidence/baseline-superconfianca.test.ts` (17 testes, 50 asserções).
Nenhum motor paralelo foi criado; os testes usam o motor existente
(`engine.ts`, `runtime.ts`, `policy.ts`, `validators.ts`).

## Falsos 100% demonstrados

| # | Problema reproduzido | Caminho de código |
|---|---|---|
| 1 | Todos os validadores `NOT_APPLICABLE` → `pontuarValidadores` devolve **100** (denominador zero). Um único validador aplicável define sozinho a nota de 100. | `policy.ts:110` `if (total === 0) return 100;` e `policy.ts:105` (NOT_APPLICABLE sai do denominador) |
| 1b | Turno sem ação e sem ferramenta pontua 40 (único freio). Basta **uma** ferramenta técnica bem-sucedida — sem nenhum dado factual — para o mesmo turno virar **100 / HIGH / ALLOW**. | `validators.ts:105-113` + `policy.ts:110` |
| 2 | Ação ausente é convertida em `responder_informacao` antes de o motor ver o turno; `IntentClarityValidator` devolve `PASS / 100 / INTENCAO_CLARA` com `intent = null`, registrando na evidência a ação inventada. | `runtime.ts:80` `requestedAction: e.acao ?? "responder_informacao"`; `validators.ts:114` |
| 3 | Caso real de 08/09: texto "Não consegui concluir seu agendamento…" com `agendamentoConfirmado = false`, sem `createAppointment` e sem `checkAvailability`. O contexto **não tem campo de tentativa** (`appointmentAttempted` não existe). O motor dá a **mesma nota** para a mensagem de falha e para a resposta informativa correta. | `types.ts:81-106` (contrato sem tentativa); `runtime.ts:63-100`; substituição do texto em `whatsapp.server.ts:1419-1421` |
| 4 | O resultado do motor não guarda nenhuma amarra com o texto avaliado (sem hash, sem cópia). Texto A avaliado e texto B enviado produzem decisões diferentes, e nada no pipeline detecta a troca. | `engine.ts:321-330` (saída sem `draftText`); `types.ts:182-193` |
| 5 | `handoffSolicitado = true` faz o motor retornar **100 / HIGH / ALLOW** com `blockers: []` antes de qualquer validador. Um valor sem catálogo passa a 100. | `engine.ts:279-290` |
| 6 | Ferramenta com `success = true` e `erro = null` fora do catálogo recebe `temConteudo = true` **por não ter falhado**; `ToolIntegrityValidator` devolve `PASS / FERRAMENTAS_INTEGRAS`. Consulta ao catálogo sem registro é só `WARNING / RETORNO_VAZIO`. | `runtime.ts:70-73`; `validators.ts:258-278` |

## Observações registradas nos testes

- O `100` do handoff (Teste 5) representa **segurança da ação de transferir**, não
  confiabilidade factual do texto. Está documentado como tal no próprio teste.
- Sinais disponíveis no turno real e **não** enviados ao motor hoje: tentativa de
  agendamento, disponibilidade confirmada em tempo real, ativação do guard
  anti-falso-sucesso, texto efetivamente enviado após pós-processamento.
- O `NOT_APPLICABLE` atual mistura duas coisas diferentes: "não se aplica a este turno"
  e "não tenho como verificar" — ambas saem do denominador com score 100.

## Validação executada

- `bun test src/lib/nina/confidence/baseline-superconfianca.test.ts` — 17 testes, 50
  asserções, todos passaram.
- `bun test src/lib/nina/confidence` — 148 testes, 420 asserções, todos passaram
  (nenhuma suíte existente quebrou).
- `bunx tsgo --noEmit` — sem erros.

## Gate de saída

Os seis comportamentos foram tecnicamente reproduzidos e estão cobertos por teste.
Nada foi corrigido: `policy.ts`, `engine.ts`, `runtime.ts` e `validators.ts` permanecem
inalterados. Pronto para a fase de correção mediante autorização.
