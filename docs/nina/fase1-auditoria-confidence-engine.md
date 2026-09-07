# Fase 1 — Auditoria da arquitetura da Nina e preparação do Confidence Decision Engine

Data: 2026-09-07. Escopo: leitura do código real, sem alterar o comportamento
da Nina para pacientes.

## 1. Fluxo de recebimento da mensagem

- Entrada real do WhatsApp: `src/routes/api/public/whatsapp.$clinicaId.ts`
  (webhook público, verificação do provedor no próprio handler).
- Deduplicação por `wa_message_id`; processamento síncrono no mesmo request.
- Timeout de espera: `src/routes/api/public/nina.espera-timeout.ts`.

## 2. Orquestrador

- `src/lib/whatsapp.server.ts` → `gerarRespostaNina` (entrada pública) e
  `gerarRespostaNinaInterno` (laço de rodadas modelo ↔ ferramentas).
- `src/lib/nina.functions.ts` expõe as operações internas para a interface.

## 3. Onde o modelo é chamado

- `src/lib/nina/ai-gateway.server.ts` (Lovable AI Gateway).
- `src/lib/nina/adapters/gemini-adapter.server.ts` (adaptador do fornecedor).
- Conclusão: a troca de fornecedor já está isolada num adaptador — o motor de
  confiança **não** pode depender desse formato.

## 4. Catálogo Estruturado

- `catalogo.ts` / `catalogo.functions.ts` (aplicação), `catalogo-fonte.server.ts`,
  `catalogo-retrieval.server.ts`, `catalogo-prompt.server.ts`.
- Somente o catálogo **publicado** alimenta respostas (correção anterior já
  removeu prompt legado e fontes paralelas).

## 5. Agenda e agendamento

- Capacidades do Tool Broker: `checkAvailability` (consultar disponibilidade,
  verificar horário, próxima vaga) e `createAppointment` (agendar).
- Confirmação real exige `appointment_id` gravado ou duplicata idempotente.

## 6. Ferramentas / functions

- Contrato e capacidades: `src/lib/nina/tool-broker.ts`.
- Execução centralizada: `tool-broker.server.ts`.
- Implementações: `paciente-tools.server.ts`, `nina-ferramentas.server.ts`,
  `handoff-tool.server.ts`.
- Não existem Edge Functions da Supabase neste caminho: tudo é server function
  ou rota de servidor do TanStack.

## 7. Handoff

- `handoff-tool.server.ts` → `encaminharParaHumano` (`handoff.server.ts`).
- Reaproveita protocolo real (`protocolo-atendimento.server.ts`), mensagem
  contextual, distribuição automática e fila "Não atribuídas".
- Em conversas de teste, a mensagem é persistida internamente
  (`canal: test-console`), sem envio ao WhatsApp real.

## 8. Auditoria existente

- `nina_execucoes`, `nina_trace_eventos` (`arquitetura/tracing.ts`),
  `nina_kb_consultas`, `evidencias.server.ts`, `handoff-auditoria.ts`.
- Já existe `nina_confianca_decisoes` (decisões do motor em produção e
  homologação), lida pelo painel de métricas.

## 9. Métricas

- `desempenho-periodo.*`, `analista-metricas.*`, painel
  `src/routes/_authenticated/app.nina-metricas.tsx`, incluindo o card
  "Confiabilidade das respostas".

## 10. Homologação e mensagem de teste

- Inbox `HomologacaoInbox.tsx`, ciclos `nina_teste_ciclos`, cenários
  (`cenarios.functions.ts`), avaliador Sol, `ciclo-teste.ts`,
  `handoff-ciclo.server.ts`.
- Isolamento: conversas `is_teste`, sem transporte externo.

## 11. Componentes que já validavam algo semelhante

| Componente | O que fazia | Decisão |
| --- | --- | --- |
| `confidence-engine.ts` | regras determinísticas em produção (categorias, bloqueios, faixas) | **reutilizado** pelo novo serviço (detecção de afirmações sensíveis) |
| `handoff-assertions.ts` | verificação determinística de handoff/protocolo nos testes | mantido, sem duplicação |
| `avaliador-sol.ts` | julgamento subjetivo offline | mantido fora do caminho de decisão |
| `decisao-schema.ts` | validação de saída do modelo | mantido |

Nenhuma implementação paralela foi criada: o serviço novo é uma **camada de
contrato** sobre a regra já validada.

## 12. O que a Fase 1 entregou

`src/lib/nina/confidence/`

- `types.ts` — contrato de entrada (`conversationId`, `messageId`, `intent`,
  `requestedAction`, `entities`, `retrievedSources`, `toolResults`,
  `requiredFields`, `businessContext`) e de saída (`score`, `level`,
  `decision`, `blockers`, `checks`, `evidence`).
- `engine.ts` — validadores independentes, cálculo de confiança, bloqueadores,
  decisão (`ALLOW` / `CLARIFY` / `HANDOFF` / `BLOCK_ACTION`) e níveis
  (`HIGH` ≥ 80, `MEDIUM` 50–79, `LOW` < 50).
- `index.ts` — fachada de importação.
- `engine.test.ts` — 15 testes cobrindo contrato, bloqueadores e faixas.

Características: puro (sem banco, rede ou modelo), independente de fornecedor,
não envia mensagem e não transfere conversa por conta própria.

## 13. Pontos de integração mapeados (para a Fase 2)

| Ponto | Arquivo | Observação |
| --- | --- | --- |
| Resultado das ferramentas | `whatsapp.server.ts` (laço de tool calls) | já coleta nome, capacidade, fonte, sucesso e erro |
| Conteúdo útil do catálogo | `temConteudoUtil` em `whatsapp.server.ts` | vira `retrievedSources[].temConteudo` |
| Confirmação de agendamento | variável `agendamentoConfirmado` | vira `businessContext.agendamentoConfirmado` |
| Identificação do paciente | `pacienteIdEfetivo` | vira `businessContext.pacienteIdentificado` |
| Transferência | `broker.executar("solicitar_atendente_humano", …)` | consumidor de `HANDOFF` |
| Traços | `rastro.concluir("confidence.decision", …)` | evidências e checks |
| Persistência | `confidence-engine.server.ts` → `nina_confianca_decisoes` | precisará gravar `checks` e `level` |

## 14. Estado atual do comportamento

O caminho vivo da Nina continua usando `confidence-engine.ts` (integração já em
produção desde a etapa anterior). O serviço criado nesta fase **ainda não está
ligado ao runtime**: nenhuma resposta a paciente mudou. A substituição do
avaliador antigo pelo serviço novo é trabalho da Fase 2.

## 15. Gate de saída

- Verificação de tipos: OK.
- Testes: 30 testes / 60 checagens no módulo de confiança; suíte Nina +
  atendimento sem falhas.
- Arquitetura existente intacta: nenhum arquivo do atendimento, agendamento,
  catálogo, aprendizado, auditoria, métricas, homologação, handoff,
  distribuição ou permissões foi alterado nesta fase.
