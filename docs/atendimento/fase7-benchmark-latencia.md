# FASE 7 — Benchmark final e critério de aceite de latência

Escopo: medição e critério de aceite. Nenhuma regra de negócio, permissão,
auditoria, protocolo, handoff ou comportamento da Nina foi alterado nesta fase.

## Arquivos alterados

- `src/lib/atendimento/benchmark-latencia.ts` (novo) — alvos p95, separação
  interno x Meta, detecção de outlier, comparação antes/depois e comparação de
  carga por mensagem.
- `src/lib/atendimento/latencia.ts` — novo segmento `backend_pre_meta`
  (backend recebeu → chamada da Meta iniciada) e nova métrica
  `SEND_BACKEND_PRE_META`. Métricas antigas preservadas.
- `src/lib/atendimento/latencia-cliente.ts` — ao fechar um trace, emite
  `PERFORMANCE OUTLIER` quando o tempo interno passa de 3 s.
- `src/lib/atendimento/__tests__/fase7-benchmark.test.ts` (novo) — 10 cenários
  controlados + outliers + antes/depois + carga.

## Alvos e resultado dos cenários controlados

| Métrica | Trecho | Alvo p95 | Resultado no cenário controlado |
|---|---|---|---|
| SEND_UI_RENDER | clique → bolha na tela | < 100 ms | ~8 ms |
| SEND_BACKEND_PRE_META | backend recebeu → Meta iniciada | < 500 ms | ~42 ms |
| SEND_META | chamada da Meta | medido, não avaliado | externo |
| RECV_WEBHOOK_TO_DB | webhook → linha gravada | < 500 ms | ~72 ms |
| RECV_DB_TO_BROWSER | banco → evento no navegador | medido | ~180–420 ms |
| RECV_BROWSER_TO_RENDER | evento → mensagem visível | < 100 ms | ~12 ms |
| Total interno | ponta a ponta sem Meta | ≤ 2 s | dentro do alvo |

Os cenários são determinísticos: eles medem a **arquitetura** (quantas etapas
existem no caminho crítico e quais somam tempo), não a rede real. Os números de
rede real (Meta, Realtime, banco em produção) só saem de tráfego real com a
telemetria ligada (`localStorage.setItem("atendimento:latencia", "1")`).

## Antes / depois

| | ANTES (relatado) | DEPOIS (arquitetura atual) |
|---|---|---|
| envio visual | ~5 s, picos ~9 s | render local, sem depender do backend |
| recebimento | ~5 s, picos ~9 s | webhook → insert → Realtime → render direto |
| origem do jitter | recarga de Inbox/eventos e timeout da Nina no caminho | fora do caminho crítico |

## Queries e requests eliminados por mensagem

| Operação | Antes | Depois |
|---|---|---|
| `listarConversas` após envio | 1 | 0 (patch local) |
| `listarMensagens` após envio | 1 | 0 (linha canônica no retorno) |
| `listarEventos` no recebimento | 1 | 0 (trilha separada) |
| `COUNT` de não lidas | 1 | 0 (contador local) |
| `whatsapp_configs` | 1–2 | 0 na maioria (cache 45 s) |
| `SELECT atend_conversas` no envio | 2–3 | 1 (contexto consolidado) |

## Índices

- `idx_atend_conv_digitos_canal` (FASE 6) — busca do trigger passou de 271
  blocos / ~0,83 ms para 4 blocos / ~0,17 ms no `EXPLAIN ANALYZE`.
- `idx_audit_agend_record_data` — criado em migração anterior, fora deste fluxo.
- Nenhum índice novo nesta fase: não houve evidência que justificasse.

## Arquitetura final

**Envio:** clique → bolha otimista imediata (com `client_message_id`) → fila
serial por conversa → backend com contexto consolidado e configuração em cache →
Meta com `AbortController` e sem retry cego → insert e atualização da conversa em
paralelo → retorno da linha canônica → reconciliação por id, sem recarga.

**Recebimento:** webhook → validação de assinatura → parse → insert → Realtime →
normalização do payload direto no cache/timeline (dedupe por
`client_message_id`/`id`). Nina, Confidence Engine, resumo, handoff e métricas
rodam depois da persistência e não bloqueiam a exibição.

## Outliers

Acima de 3 s de processamento **interno** o sistema emite:

```
PERFORMANCE OUTLIER
traceId: ...
totalInternal: 4820ms
externo (Meta): 0ms
maiores etapas:
  realtime: 3200ms
  db: 620ms
```

Sem texto, nome, telefone ou dado clínico. Meta lenta (ex.: 6 s) aparece
separada e nunca é classificada como falha interna.

## Pendências e melhorias futuras (não implementadas)

- Baseline com tráfego real: p50/p95/p99 de produção ainda dependem de uma
  janela de coleta com a telemetria ligada.
- Persistir amostras agregadas (hoje ficam em memória no navegador).
- E2E multiusuário Admin/Telefonia com duas sessões reais continua pendente.
