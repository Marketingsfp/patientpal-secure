# FASE 2 — Alimentar o motor com o estado real do turno

Nenhum motor paralelo foi criado. O motor existente passou a receber sinais reais.

## O que mudou

### 1. Contexto canônico único — `src/lib/nina/confidence/contexto-turno.ts` (novo)
Um só objeto define, por turno: `intencoes`, `intent`, `requestedAction`,
`intentAmbiguo`, `capacidades.podeAgendar`, `messageIdEntrada`, `messageIdResposta`.
Motor e auditoria consomem **este mesmo objeto** — acabou a possibilidade de o motor
ver `responder_informacao` e a auditoria gravar `criar_agendamento` na mesma execução.

Tradução intenção → ação (só a partir do que foi observado na mensagem):
`falar_humano` → transferir_humano · `cancelamento` → cancelar_agendamento ·
`remarcacao`/`agendamento` → criar_agendamento · `disponibilidade` →
informar_disponibilidade · `valor`/`financeiro` → informar_valor · `preparo` →
informar_preparo · `documentos` → informar_regra · `horario` → informar_horario ·
`medico` → informar_profissional · assunto solto → responder_informacao ·
**nada legível → `desconhecida`**.

### 2. Capacidade deixou de ser intenção — `src/lib/whatsapp.server.ts:1523`
Removido `acaoSolicitada: podeAgendar ? "criar_agendamento" : "responder_informacao"`.
`podeAgendar` agora vive apenas em `capacidades.podeAgendar` e não decide nada sobre
o que o paciente quer.

### 3. Ausência não vira certeza — `src/lib/nina/confidence/runtime.ts:80`
`requestedAction: e.acao ?? "responder_informacao"` virou `?? "desconhecida"`.
Mesma correção no default da auditoria (`auditoria.ts:169`).

### 4. Ação desconhecida não sai mais do denominador — `validators.ts:104-117`
Removido o ramo `NOT_APPLICABLE / SEM_INTENCAO_DECLARADA / 100`. Agora:
sem consulta → `FAIL 40 ACAO_NAO_DEFINIDA`; com consulta → `WARNING 55
ACAO_NAO_DEFINIDA`. Ter rodado ferramenta reduz o risco, não prova entendimento.

### 5. Sinais reais enviados ao motor — `whatsapp.server.ts:1452-1462`
O `estadoTurno` passou a incluir `intent`, `acao`, `intentAmbiguo` e `messageId`
(mensagem de entrada). O contexto canônico já reserva `messageIdResposta` para a
Fase seguinte, que amarra a decisão à mensagem da Nina, não só à do paciente.

### 6. Matriz de homologação — `shadow-matriz.ts`
Passou a derivar a ação pela mesma regra do atendimento real; quando o cenário
declara a intenção observada, ela prevalece.

## Gate de saída — testes

`src/lib/nina/confidence/contexto-turno.test.ts` (13 testes):
intenção conhecida · intenção desconhecida · informação simples · intenção de
agendamento · **clínica com Agenda habilitada + paciente pedindo preço** (segue
`informar_valor`) · ausência total de sinais · paridade motor/auditoria ·
`messageId` no contexto · ausência de ação não produz mais PASS 100.

Baseline da Fase 1 atualizada: os três testes que documentavam os falsos 100% por
intenção ausente agora afirmam o comportamento corrigido, com o "antes" registrado
no comentário.

## Validação executada
- `bunx tsgo --noEmit` — sem erros.
- `bun test src/lib/nina` — 996 testes, 6.674 asserções, 0 falhas.

## Pendências / fora do escopo desta fase
- Falsos 100% ainda abertos: `if (total === 0) return 100` em `policy.ts`;
  curto-circuito de `handoffSolicitado`; sucesso técnico da ferramenta tratado como
  prova do fato; decisão sem amarra com o texto enviado; ausência de sinal de
  tentativa de agendamento.
- `messageIdResposta` está preparado no contrato, mas ainda não é preenchido.
- O detector de intenções não reconhece frases como "Vocês atendem cardiologia?";
  isso agora aparece como `desconhecida` em vez de ser mascarado — possível ajuste
  de regra de negócio, a validar com a equipe.
- Nenhum atendimento real, envio de WhatsApp, agendamento ou publicação foi executado.
