# FASE 6 — Relatório de homologação do agrupamento de mensagens quebradas

Data: 2026-09-10 · Ambiente: homologação/simulação determinística
Nada foi enviado por WhatsApp real, nada foi publicado, nenhum dado de produção foi alterado.

## 1. Arquivos alterados nesta fase

| Arquivo | O que é |
| --- | --- |
| `src/lib/nina/fase6-homologacao.ts` (novo) | Simulador determinístico do pipeline (lote → lock → revisão → geração → envio) e cálculo das métricas |
| `src/lib/nina/fase6-homologacao.test.ts` (novo) | Cenários 1 a 8, medição de latência e comparação antes/depois |
| `docs/nina/fase6-relatorio-homologacao-burst.md` (novo) | Este relatório |

Nenhum arquivo de runtime (webhook, `whatsapp.server.ts`, `burst*`, `lock-conversa*`, `revisao*`, prompt, Arquitetura) foi modificado — a FASE 6 é validação, não mudança de comportamento.

## 2. Mecanismos homologados

- **Batching:** lote persistente por conversa em `nina_message_batches` / `nina_message_batch_itens`, com registro e reivindicação atômicos via RPC. Quiet window renovada a cada mensagem, limitada pelo teto contado desde a primeira mensagem do lote.
- **quietWindow final:** **1000 ms** (mantida).
- **maxBurstWindow final:** **2500 ms** (mantida).
- **Lock:** `nina_conversa_locks` com lease de 90 s, espera máxima de 25 s e recuperação de lotes travados. Uma execução ativa por conversa; conversas diferentes seguem em paralelo.
- **Revision / stale guard:** contador monotônico por conversa. A geração congela a revisão no claim; antes do envio e antes de qualquer ferramenta crítica compara-se com a revisão atual. Divergiu → resposta descartada, lote marcado `SUPERSEDED`, novo lote reprocessa com a mensagem nova.
- **Memória:** o lote é gravado como **um turno lógico**; o histórico físico continua com todas as mensagens do paciente, separadas.
- **Confidence Engine:** avalia a resposta contra o turno consolidado (batch completo), mantendo `intent ≠ stage ≠ requestedAction` e `answerConfidence ≠ actionSafety`.
- **Auditoria:** `batchId`, `messageIds`, `conversationRevision` e `executionId` ficam associados à execução.

## 3. Resultados dos cenários

| Cenário | Resultado |
| --- | --- |
| 1 — "Olá" / "Gostaria de marcar" / "De neurologista" (300 ms) | 3 bolhas, 1 batch, 1 execução, 1 resposta, contexto com neurologia, sem apresentação repetida |
| 2 — frase em 5 partes | 1 batch, 1 execução; "cardiologista" e "sábado" no mesmo turno |
| 3 — intervalo de 5 s | 2 batches, 2 turnos independentes |
| 4 — mensagem nova durante a geração | resposta antiga bloqueada (`SUPERSEDED`), `criar_agendamento` bloqueado na geração obsoleta, nova resposta usa "somente sábado" |
| 5 — 10 fragmentos rápidos | 1 execução, nenhuma mensagem perdida ou duplicada, teto de burst respeitado, sem sobreposição |
| 6 — duas conversas | batches separados, execução paralela comprovada, nenhum vazamento de contexto |
| 7 — handoff | 1 execução ⇒ 1 handoff, 1 protocolo, 1 transferência |
| 8 — agendamento fragmentado | 1 interpretação consolidada; nenhuma tentativa de `criar_agendamento` após apenas "quero marcar" |

## 4. Latência medida (relógio virtual, geração de 800 ms)

| Cenário | Mensagens | Batches | Execuções | Chamadas evitadas | Superseded | Agrupador p50/p95/máx (ms) | Última msg → resposta p95 (ms) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 caso real | 3 | 1 | 1 | 2 | 0 | 1000 / 1000 / 1000 | 1800 |
| 2 cinco partes | 5 | 1 | 1 | 4 | 0 | 1000 / 1000 / 1000 | 1800 |
| 3 separadas | 2 | 2 | 2 | 0 | 0 | 1000 / 1000 / 1000 | 1800 |
| 4 durante geração | 2 | 2 | 2 | 0 | 1 | 1000 / 1000 / 1000 | 1800 |
| 5 dez fragmentos | 10 | 1 | 1 | 9 | 0 | 700 / 700 / 700 | 1500 |

**Latência adicional causada pelo agrupador: no máximo a quiet window (1000 ms), e menos quando o teto de burst fecha o lote antes.**

Ajuste das janelas: teste comparativo com quiet window de 250 ms reduz a latência, mas quebra a rajada em mais de uma execução — perda de coerência sem ganho proporcional. Por isso **1000 ms / 2500 ms foram mantidas com base em medição, não por arbítrio**.

## 5. Chamadas ao modelo — antes × depois

| Situação | Antes | Depois |
| --- | --- | --- |
| 3 mensagens rápidas | até 3 execuções | 1 execução |
| 5 mensagens rápidas | até 5 execuções | 1 execução |
| 10 fragmentos rápidos | até 10 execuções | 1 execução |
| Mensagens separadas por 5 s | 2 execuções | 2 execuções (inalterado, correto) |

## 6. Regressão

`tsgo --noEmit` sem erros; **1.664 testes / 8.169 expectativas** das suítes Nina e Atendimento passando; `bun run build` concluído.

Continuam funcionando (cobertos pelas suítes existentes): Realtime, velocidade de recebimento, Optimistic UI, Telefonia, transferências, protocolos, agendamento, Confidence Engine, reset de memória, handoff, resumo da Nina e janela de 24 h. O agrupador atua **depois** da persistência e do Realtime — a bolha do paciente continua aparecendo imediatamente.

Identidade do contato: fora de escopo, nada alterado.

## 7. Gate final

Itens 1 a 13 atendidos, com a ressalva abaixo.

## 8. Pendências (validação humana)

- Medição em **tráfego real do WhatsApp** não foi executada: a latência acima vem de relógio virtual determinístico, não de rede/Meta/modelo reais.
- Concorrência **multi-instância** foi simulada com a semântica das RPCs, não observada em produção.
- Recomenda-se acompanhar, após liberação, a média real de mensagens por lote antes de qualquer novo ajuste das janelas.
