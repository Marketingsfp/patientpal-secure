# FASE 1 — Telemetria de latência do Atendimento WhatsApp

Somente medição. Nenhum comportamento da Nina, regra de negócio, validação,
permissão ou fluxo de envio/recebimento foi alterado.

## Caminho medido

ENVIO (humano)
`SEND_T0_CLICK` → `T1_OPTIMISTIC_RENDER` → `T2_REQUEST_STARTED` (tela)
→ `T3_BACKEND_RECEIVED` → `T4_AUTH_DONE` → `T5_CONFIG_READY`
→ `T6_META_REQUEST_START` → `T7_META_RESPONSE` → `T8_DB_INSERT_DONE`
→ `T9_CONVERSATION_UPDATE_DONE` → `T10_BACKEND_RESPONSE` (servidor)
→ `T11_REALTIME_RECEIVED` → `T12_CANONICAL_RECONCILED` (tela)

RECEBIMENTO
`RECV_T0_WEBHOOK_RECEIVED` → `T1_SIGNATURE_VALIDATED` → `T2_CONFIG_READY`
→ `T3_PAYLOAD_PARSED` → `T4_DB_INSERT_START` → `T5_DB_INSERT_DONE`
→ `T6_REALTIME_AVAILABLE` (servidor) → `T7_REALTIME_BROWSER`
→ `T8_MESSAGE_RENDERED` (tela)

Subprocessos: qualquer chamada pode ser medida com `trace.medir("nome", fn)`
(hoje já aplicado em `loadWhatsAppConfig`).

## Arquivos

- `src/lib/atendimento/latencia.ts` — núcleo: trace, segmentos, resumo,
  métricas e agregação p50/p95/p99/máximo.
- `src/lib/atendimento/latencia.server.ts` — trace do servidor e log técnico.
- `src/lib/atendimento/latencia-cliente.ts` — traces do navegador, junção com
  as marcas do servidor, baseline em `window.__latencia`.
- `src/lib/atendimento.functions.ts` — marcas T3–T10 do envio; o retorno passa
  a incluir o campo técnico `latencia`.
- `src/routes/api/public/whatsapp.$clinicaId.ts` — marcas RECV T0–T6.
- `src/components/nina/AtendimentoExtraTabs.tsx` — marcas T0–T2, T10–T12 e as
  marcas de recebimento no tempo real e na renderização.
- `src/lib/atendimento/__tests__/latencia.test.ts` — regressão.

## Como coletar

No navegador da atendente:

```js
localStorage.setItem("atendimento:latencia", "1");
// ... usar o atendimento normalmente ...
window.__latencia.baseline();  // p50 / p95 / p99 / máximo por métrica
window.__latencia.ultimos();   // últimos traces detalhados
```

No servidor os traces saem no log com o prefixo `[atendimento:latencia]`
(ativo fora de produção; em produção só com `ATENDIMENTO_LATENCIA=1`).

## Privacidade

O registro de latência só aceita: `traceId`, `conversationId`, `etapa`,
`durationMs`, `status`, `fluxo`. Texto da mensagem, nome, telefone e conteúdo
clínico são proibidos, e há teste de regressão garantindo isso.

## Baseline

Ainda não há baseline com tráfego real: a coleta depende de uso ao vivo do
atendimento. A instrumentação está pronta e as métricas
(`SEND_UI_RENDER`, `SEND_BACKEND`, `SEND_META`, `SEND_TOTAL`,
`RECV_WEBHOOK_TO_DB`, `RECV_DB_TO_BROWSER`, `RECV_BROWSER_TO_RENDER`,
`RECV_TOTAL`) já saem agregadas em p50/p95/p99/máximo assim que houver volume.
