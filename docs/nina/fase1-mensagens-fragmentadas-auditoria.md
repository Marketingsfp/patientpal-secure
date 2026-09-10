# FASE 1 — Auditoria: mensagens quebradas do paciente (WhatsApp → Nina)

Data: 2026-09-10. Natureza: **auditoria de código e dados**. Nenhuma regra de
negócio, prompt, identidade, vínculo de paciente, cabeçalho ou lógica de
Telefonia foi alterada. Nenhuma mensagem real foi enviada.

## 1. Ponto exato que dispara a Nina

`src/routes/api/public/whatsapp.$clinicaId.ts`

| Etapa | Local |
| --- | --- |
| Entrada do webhook (POST) | linhas 129–707 |
| Laço por mensagem recebida | linha 180 (`for (const msg of messages)`) |
| Persistência + idempotência por `wa_message_id` | linhas 226–253 (duplicata `23505` → `continue`) |
| Varredura de prazos de espera | linhas 310–320 |
| Reabertura da conversa | linhas 326–332 |
| Decisão “a Nina responde?” | linhas 344–360 |
| **Disparo da Nina** | **linha 434: `await gerarRespostaNina(...)`** |
| Envio ao paciente (Meta) | linhas 511–555 |
| Registro da saída + `execucao_id` | linhas 526–571 |
| Vínculo do snapshot de confiança | linhas 575–582 |
| Resposta HTTP `200` ao Meta | linha 697 |

O processamento é **síncrono dentro da própria requisição do webhook**: o
`200` só volta ao Meta depois do modelo, das ferramentas, do Confidence Engine
e do envio da resposta.

## 2. Cada mensagem dispara uma execução?

**Sim.** O disparo está dentro do laço por mensagem. Não existe debounce,
janela de silêncio, fila de entrada ou agrupamento antes da chamada ao modelo.

O único agrupamento que existe hoje é **retroativo e apenas para auditoria**
(linhas 403–451): ao montar a resposta, o código lista as mensagens de entrada
posteriores à última saída e as marca com o `execucao_id`. Isso registra “quais
entradas geraram esta saída”, mas **não impede** que cada mensagem já tenha
disparado sua própria chamada ao modelo.

## 3. Execuções concorrentes da mesma conversa

**Existem, e há evidência real no banco.** Consulta em `nina_execucoes`
(últimos 30 dias), comparando `created_at` com `created_at - latency_ms`:

- conversa `f48d25b9…`: **7 execuções**, com **2 pares sobrepostos** no tempo;
- outras conversas com rajadas: `59afe69c…` (9 execuções em ~2 min),
  `8bf9f63a…` (6 em ~45 s), `5f10291e…` (3 em ~39 s), `e95f614d…` (3 em ~1 min).

Não há nenhuma trava no caminho de recebimento: nenhum `pg_advisory_lock`,
nenhum mutex, nenhuma fila por conversa. A fila existente
(`src/lib/atendimento/fila-envio.ts`) serializa **envio do atendente humano** e
não participa deste caminho. O único controle otimista do sistema está em
`src/lib/nina/espera-timeout.server.ts` e cobre apenas o prazo de espera.

## 4. Como o estado/memória é carregado

- Leitura: `carregarEstadoIdentidade` em `src/lib/whatsapp.server.ts:626`
  (dentro do `Promise.all` das linhas 610–640) — lê
  `atend_conversas.nina_fluxo_estado`.
- Sessão/TTL: `resolverSessao` (puro) e `persistirEstadoSessao`
  (`src/lib/nina/sessao.server.ts`), acionados na linha 819–823.
- Contexto do modelo: `montarContexto` (`src/lib/nina/context-builder.ts:95`),
  com janela de histórico limitada; não relê o banco no meio do turno.
- Gravações de `nina_fluxo_estado`: linhas 1175, 1686 e 1748 de
  `whatsapp.server.ts`, via `fluxo-estado.server.ts`.

**Janela de corrida:** da leitura (linha 626) até a última gravação (linha
1748) passa o turno inteiro, incluindo a chamada ao modelo. Duas mensagens em
rajada leem o mesmo estado antes de qualquer gravação — a última gravação
vence e a anterior se perde.

## 5. Confidence Engine

Avaliado **por mensagem**, duas vezes por execução, dentro do mesmo turno:
decisão de ação/handoff em `whatsapp.server.ts:1492-1528` e avaliação da
resposta final em `1790-1810`. Com a ideia do paciente fragmentada, ele avalia
turnos incompletos.

## 6. Como a resposta é enviada

`metaSendText` / `metaSendAudio` (`whatsapp.$clinicaId.ts:511-555`), com
revalidação do dono da conversa imediatamente antes do envio (linhas 458+), e
registro em `whatsapp_mensagens` com `execucao_id`. A execução técnica é
gravada em `nina_execucoes` por `registrarExecucao`
(`src/lib/nina/telemetria.server.ts:20`), chamada de
`src/lib/nina/ai-gateway.server.ts:196`.

## 7. Reprodução controlada

`src/lib/nina/fase1-mensagens-fragmentadas.test.ts` reproduz em memória as
regras reais do caminho atual (1 mensagem = 1 execução; janela de entrada =
mensagens após a última saída; estado lido no início e gravado no fim) com a
sequência “Olá” → 300 ms → “Gostaria de marcar uma consulta” → 300 ms →
“De neurologista”.

Resultado do cenário:

| Execução | messageId | entradas vistas | simultânea com |
| --- | --- | --- | --- |
| exec-1 | msg-1 | msg-1 | exec-2, exec-3 |
| exec-2 | msg-2 | msg-1, msg-2 | exec-1, exec-3 |
| exec-3 | msg-3 | msg-1, msg-2, msg-3 | exec-1, exec-2 |

- 3 execuções iniciadas para 1 intenção;
- 3 respostas distintas enviadas;
- sobreposição ocorre sempre que a execução durar mais que o intervalo entre
  balões (com 100 ms de execução não há sobreposição; com 1.200 ms já há).

Os campos medidos são apenas técnicos: `executionId`, `messageId`, `entradas`,
`processingStartedAt`, `processingFinishedAt`, leitura/gravação de estado. O
teste verifica explicitamente que nenhum conteúdo clínico aparece no registro.

## 8. Componentes a alterar nas próximas fases

1. `src/routes/api/public/whatsapp.$clinicaId.ts` (linhas 180–451) — persistir e
   agendar em vez de chamar o modelo por mensagem.
2. Novo agendador de janela por conversa, no padrão já usado por
   `src/lib/nina/espera-timeout.server.ts` + `src/routes/api/public/nina.espera-timeout.ts`
   (tabela + varredura; **timer em memória não serve** no ambiente serverless).
3. Trava por conversa (advisory lock via RPC ou UPDATE condicional) para
   impedir duas execuções simultâneas mesmo com retries do Meta.
4. `src/lib/whatsapp.server.ts:529` — receber o lote de mensagens como uma única
   unidade de turno, e não apenas como metadado de auditoria.
5. `src/lib/nina/context-builder.ts` — compor a mensagem do turno a partir do lote.
6. `src/lib/nina/fluxo-estado.server.ts` / `sessao.server.ts` — uma leitura e uma
   gravação por lote.
7. Confidence Engine e telemetria — passar a avaliar o turno agrupado.

## 9. Pendências

- Não foi executado teste com WhatsApp real nem com duas requisições HTTP
  concorrentes contra o webhook em produção.
- A perda de estado por last-write-wins é comprovada por leitura de código e
  pela sobreposição observada em `nina_execucoes`, não por um caso capturado
  com o estado final divergente.
