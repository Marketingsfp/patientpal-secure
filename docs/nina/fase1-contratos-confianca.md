# Fase 1 — Contratos e regressões do motor de confiança da Nina

Documento de mapeamento. Nenhuma regra de decisão foi alterada nesta fase: o
que existe aqui é o mapa dos caminhos reais, os três contratos, a matriz
A/B/C/D e a lista de regressões que caracterizam os defeitos atuais.

Base: código da versão atual do repositório (não do ZIP auditado). Os achados
do ZIP foram reconferidos um a um; onde a versão atual já evoluiu, está
anotado.

---

## 1. Mapa dos caminhos

### 1.1 Webhook — `src/routes/api/public/whatsapp.$clinicaId.ts`

| Ramo | Linhas | Passa pelo motor? |
| --- | --- | --- |
| Código de verificação do site | 280-336 | Não — `continue` antes de tudo |
| Reabertura de conversa / timeout de espera | 341-369 | Não |
| Conversa já é de humano (`ninaPodeResponder`) | 375-416 | Não — a Nina nem responde |
| Lote assumido por mensagem mais nova (burst) | 486-522 | Não — `registrarTurnoSemModelo` |
| Geração da resposta (`gerarRespostaNina`) | 515-522 | Sim (dentro de whatsapp.server.ts) |
| Mídia não suportada / áudio que falhou | 538-556 | **Não** — resposta determinística sem avaliação |
| Humano assumiu durante a geração | 567-589 | Avalia e descarta (não envia) |
| Finalização de texto (`finalizarResposta`) | 591-619 | **Altera o texto depois** do `action_safety` |
| Resposta obsoleta (stale guard) | 620-656 | Descarta antes do envio |
| Envio (texto ou áudio) + persistência | 657-770 | — |
| Vínculo `outgoing_message_id` | 742-753 | Ver 4.3 |
| Encerramento da conversa | 772-806 | Não |
| Falha técnica (`catch`) | 824-830 | Não |

### 1.2 Geração — `src/lib/whatsapp.server.ts`

| Ramo | Linhas | Observação |
| --- | --- | --- |
| Gate de identificação | 1253-1300 | **Early return antes do motor** — regra de código, não prompt |
| Falso sucesso de agendamento | 1540-1550 | Substitui o texto **antes** da avaliação |
| Avaliação de ação (`action_safety`) | 1551-1751 | `decidirNoTurno` + etapa + `decidirHandoff` + auditoria |
| CLARIFY | 1755-1764 | `continue`: **nova rodada de modelo sem esperar o paciente** |
| HANDOFF / BLOCK_ACTION | 1772-1795 | Se a ferramenta de transferência falhar, **devolve o texto reprovado** (1784) |
| Caminho normal | 1797-1802 | `resposta = texto` |
| Pré-commit do `agendar` | 1822-1861 | Trava só vale na etapa D (1837) |
| Ação crítica com revisão obsoleta | 1863-1886 | Aborta antes de gravar |
| Sinal de disponibilidade | 1895-1897 | `checkAvailability` com sucesso liga a flag **mesmo sem vaga** |
| Avaliação da resposta final (`answer_confidence`) | 2057-2130 | `garantirScoreDoTextoEnviado` sobre o texto realmente enviado |

### 1.3 Motor ativo (confirmado nesta versão)

- Ativo: `confidence/runtime.ts` → `confidence/engine.ts` → `policy.ts`,
  `validators.ts`, `claims.ts`, `workflow.ts`, `final-answer.ts`, `etapas.ts`.
- `src/lib/nina/confidence-engine.ts` (scorer antigo) **não decide mais nada**,
  mas continua ativo em duas funções: `detectarCategorias`, consumido por
  `confidence/engine.ts:11`, e o tipo `DecisaoConfianca`, usado no formato de
  persistência legado (`runtime.ts:181` — `paraDecisaoLegado`).
  **Não é código morto e não deve ser removido.**
- `confidence-engine.server.ts` é só persistência/telemetria.

---

## 2. Os três contratos

**C1 — Pré-condições (antes da ação).** O que precisa ser verdade **antes** de
executar. Hoje: `validarAgendamentoAntesDoCommit` (campos, paciente
identificado, disponibilidade, ferramenta sem falha, horário coerente) +
idempotência do broker + revisão da conversa. Falta: a vaga escolhida precisa
estar entre as vagas realmente retornadas pela consulta, e o sinal precisa ser
do turno, não herdado de rodada anterior.

**C2 — Comprovação do resultado (depois da ação).** Só a prova persistida
autoriza afirmar sucesso: `appointment_id` devolvido pelo backend. Hoje já é
exigido em `claims.ts` (`provaAgendamento`) e no `WorkflowConsistencyValidator`.

**C3 — Avaliação da resposta.** `answer_confidence` sobre o texto **final**,
com hash do texto avaliado (`final-answer.ts`). Contrato preservado: se o texto
mudar depois, a avaliação é refeita.

Regra que separa os três: C1 e C2 são **invariantes**; C3 é **avaliação**. Uma
nota alta nunca dispensa C1 ou C2.

---

## 3. Matriz A/B/C/D — observacional × invariante

| Etapa | Efeito hoje (`etapas.ts:59`) | Natureza |
| --- | --- | --- |
| A | Só observa; `decisaoEfetiva` sempre ALLOW | Observacional |
| B | HANDOFF e BLOCK_ACTION passam a valer | Observacional (política) |
| C | CLARIFY passa a valer | Observacional (política) |
| D | Agendamento exige nível alto e sem bloqueador; pré-commit trava | Observacional (política) |

**Invariantes que não podem depender da etapa** — valem em A, B, C e D:

1. Gate de identificação do paciente.
2. Isolamento por clínica.
3. Idempotência da ação e prova de gravação (`appointment_id`).
4. Aborto por revisão obsoleta da conversa.
5. Consentimento/autorização e regras determinísticas da clínica.
6. Vaga realmente existente para o horário gravado.

**Defeito de classificação identificado:** o item 6 está hoje dentro do
pré-commit, que só trava na etapa D (`whatsapp.server.ts:1837`). Uma
pré-condição está sendo tratada como política observacional.

---

## 4. Achados confirmados nesta versão

### 4.1 Confirmados

- Evidência genérica: basta a consulta ao catálogo ter respondido com conteúdo
  para qualquer claim de valor virar "apoiado", mesmo com o número divergente
  (`claims.ts:90-113`).
- Endereço/unidade não é tipo de claim verificável (`claims.ts:117-135`).
- Retry recuperado conta como falha do turno (`validators.ts:369-379`).
- CLARIFY gera nova rodada de modelo sem entrada do paciente
  (`whatsapp.server.ts:1755-1764`).
- Handoff que falha libera o texto reprovado (`whatsapp.server.ts:1784`).
- Pré-commit aceita consulta sem vagas (`whatsapp.server.ts:1895`).
- Mídia e áudio não passam pelo motor.

### 4.2 Já corrigido antes desta fase (não reabrir)

- O `answer_confidence` já é medido sobre o texto final, com hash
  (`final-answer.ts`) — o achado do ZIP sobre "avaliação apenas observacional e
  alterações posteriores" não se aplica mais ao texto enviado.
- Ação e resposta já são avaliações separadas (`tipoAvaliacao`).

### 4.3 Vínculo `outgoing_message_id` — confirmado no banco

`nina_confianca_decisoes` tem o trigger `nina_confianca_decisoes_no_update`
(`BEFORE UPDATE OR DELETE`), cuja função sempre lança exceção. O
`vincularSnapshotMensagemEnviada` faz justamente um `UPDATE`, dentro de
`try/catch`, então a falha é silenciosa.

Consulta somente leitura na base atual: **65 decisões gravadas, 0 com
`outgoing_message_id` preenchido.** O vínculo nunca funcionou.

---

## 5. Regressões entregues

Arquivos: `src/lib/nina/confidence/fixtures/clinica-ficticia.ts` (fatos) e
`src/lib/nina/confidence/fase1-regressoes.test.ts` (13 cenários).

Os testes de defeito usam `it.failing`: passam **enquanto o defeito existe** e
ficam vermelhos no dia em que a fase correspondente corrigir o comportamento.
Nenhum valor esperado foi ajustado para acomodar a falha.

| # | Cenário | Situação |
| --- | --- | --- |
| 1 | Preço divergente com a mesma consulta | Defeito |
| 2 | Endereço sem fonte | Defeito |
| 3 | Agendamento sem prova persistida | Invariante preservada |
| 4 | Negativa apoiada no catálogo | Defeito (reprova o correto) |
| 5 | Reserva de turno anterior | Defeito (reprova o correto) |
| 6 | Retry recuperado | Defeito (reprova o correto) |
| 7 | Escala não é vaga | Invariante preservada |
| 8 | Paciente não identificado | Invariante preservada |
| 9 | Consulta sem vagas libera agendamento | Defeito |
| 10 | Regra da clínica não atendida | Invariante preservada |
| 11 | CLARIFY sem nova entrada do paciente | Defeito |
| 12 | Handoff falho sem texto seguro | Defeito |
| 13 | Score preso ao texto final | Invariante preservada |

---

## 6. Limitações desta fase

- Nenhuma mensagem foi enviada, nenhum modelo real foi chamado, nenhuma flag de
  clínica foi alterada.
- Os cenários são puros; a leitura do banco foi somente `SELECT` de contagem e
  de definição de trigger.
- Mídia/áudio e o gate de identificação ainda não têm regressão dedicada:
  dependem de fronteiras assíncronas (provedor e banco) e entram na fase que
  levar a avaliação para esses ramos.
