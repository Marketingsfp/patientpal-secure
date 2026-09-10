# FASE 5 — Homologação do Confidence Engine e da política de handoff

Data: 10/09/2026 · Ambiente: código e testes automatizados (sem WhatsApp real,
sem produção, sem publicação).

## 1. Causa raiz do falso 65%

Antes das fases 1–4, todo turno era avaliado com a mesma régua. Uma saudação
("oi") era medida por critérios que não pertenciam a ela — fonte oficial,
consulta ao sistema, dados obrigatórios, risco da ação. Como não havia fonte
nem ferramenta (e não deveria haver), esses critérios eram contados como
requisito não atendido e derrubavam a nota para a faixa de ~65%, com aparência
de erro no painel. Além disso, `requestedAction = null` era lido como "ação
desconhecida" em vez de "não há ação", o que ativava a régua de ação. Baixa
nota, sozinha, levava a Nina a chamar atendente.

Correção: classificar o tipo do turno ANTES dos validadores, marcar como
"não aplicável" o que não pertence ao turno (sem descontar nota e sem aparecer
em vermelho), avaliar a nota da resposta separada da segurança da ação, e
decidir transferência por motivo, não por nota.

## 2. Arquivos alterados nesta fase

- `src/lib/nina/confidence/handoff-decision.ts` — regra de recuperação (fase 4),
  ajuste: turno de saudação/esclarecimento é sempre recuperável.
- `src/lib/nina/confidence/auditoria.ts` — rótulos de decisão e de motivo.
- `src/lib/nina/confianca.functions.ts` — decisão e motivo no detalhe do painel.
- `src/lib/nina/confidence-engine.server.ts` — telemetria persistida.
- `src/lib/whatsapp.server.ts` — envia decisão/motivo/transferência para o registro.
- `src/components/nina/ConfiancaMensagem.tsx` — painel reorganizado em seções.
- `src/lib/nina/confidence/fase5-homologacao.test.ts` — 10 casos + gate.
- Banco: colunas `handoff_decision`, `handoff_reason`, `handoff_ocorreu` em
  `nina_confianca_decisoes` (somente auditoria; nada existente foi alterado).

## 3. Tipos de turno

`SAUDACAO`, `ESCLARECIMENTO`, `INFORMACAO`, `OPERACAO`, `HANDOFF`.

## 4. Matriz de aplicabilidade

| Critério | Saudação | Esclarecimento | Informação | Operação |
| --- | --- | --- | --- | --- |
| Intenção clara | aplica | aplica | aplica | aplica |
| Fonte oficial | não aplica | não aplica | aplica | aplica |
| Consulta ao sistema | não aplica | não aplica | aplica | aplica |
| Dados obrigatórios | não aplica | não aplica | não aplica | aplica |
| Regras da clínica | não aplica | não aplica | não aplica | aplica |
| Segurança da ação | não aplica | não aplica | não aplica | aplica |

## 5. Regra do score

- "Não aplicável" não entra na conta: não reduz nota nem conta como falha.
- "Em coleta" é neutro: a Nina ainda está reunindo o dado.
- A nota da resposta mede a resposta daquele turno. Saudação e pergunta de
  esclarecimento bem feitas podem ser altas.
- Resposta factual sem respaldo continua penalizada e barrada.
- Segurança da ação é medida à parte e nunca reprova o texto.

## 6. Regra de handoff

Transferência depende da combinação motivo + tipo do turno + recuperabilidade +
segurança da ação + política. Nota baixa isolada não transfere. O limite de
tentativas de esclarecimento (2) vive num único ponto de configuração.

## 7. Exemplos

| Situação | Decisão | Motivo |
| --- | --- | --- |
| "oi" | Continuar com a Nina | Saudação válida |
| "queria uma informação" | Continuar/Perguntar | Falta um dado do paciente |
| Agendamento sem dado do paciente | Ação suspensa + pergunta | Ação crítica bloqueada |
| Valor sem catálogo publicado | Chamar atendente | Fonte oficial não encontrada |
| "quero falar com atendente" | Chamar atendente | Pedido explícito |

## 8. Testes executados

- 22 testes de homologação (casos 1 a 10 + gate transversal): passaram.
- Regressão: 1.844 testes em Nina, Atendimento e componentes: passaram.
- Verificação de tipos e build: passaram.

## 9. Resultado do cenário "oi"

Tipo do turno: Saudação · Ação: nenhuma · Segurança da ação: não aplicável ·
Fonte oficial: não aplicável · Consulta ao sistema: não aplicável ·
Confiança da resposta: alta (≥90) · Decisão: continuar com a Nina ·
Motivo: saudação válida, nenhuma ação operacional necessária ·
Transferência: não. Nenhuma linha do painel aparece como falha.

## 10. Pendências

Não houve conversa real de WhatsApp, execução em produção nem validação visual
em tela autenticada. Os números vindos da telemetria (quantos casos de baixa
confiança foram recuperados, quantos viraram transferência) só existirão depois
que conversas reais passarem por este caminho.
