# FASE 1 — Mapa dos eventos internos da timeline da conversa

Levantamento apenas. Nenhum comportamento, evento, tabela ou dado foi alterado.

## 1. Como a timeline é montada

A linha do tempo mistura DUAS fontes, ordenadas por horário
(`AtendimentoExtraTabs.tsx`, `timeline` em ~L2227):

1. **Mensagens** — `whatsapp_mensagens` (paciente, Nina, atendente e também
   "mensagens de sistema": `direction: "out"`, `status: "system"`,
   `enviada_por: "sistema"`).
2. **Eventos de estado** — `atend_conversa_eventos`, lidos por
   `listarEventosConversa` (`src/lib/atendimento.functions.ts` ~L2855, limite
   200, ordem cronológica) e desenhados por
   `src/components/nina/ConversationSystemEvent.tsx` (`textoEvento`).

Atualização em tempo real: `use-realtime-atendimento.ts` assina
`atend_conversa_eventos`; `realtime-roteador.ts` roteia o evento para a
conversa aberta. Não há insert otimista de evento no frontend — todos os
registros nascem no servidor.

## 2. Inventário dos eventos (`atend_conversa_eventos`)

| Evento | Onde é criado | Texto na timeline |
| --- | --- | --- |
| `HANDOFF_SOLICITADO` | `handoff.server.ts` L252 | "Nina solicitou atendimento humano" |
| `HANDOFF_SOLICITADO` (2º) | `protocolo-atendimento.server.ts` L93 (gatilho `handoff`) | mesmo texto + motivo "Protocolo MJ-* gerado (handoff)" |
| `ENTROU_NA_FILA` | `handoff.server.ts` L265 | "Conversa entrou na fila de atendimento" |
| `ASSUMIDA` (protocolo) | `protocolo-atendimento.server.ts` L345 | "Conversa atribuída a Sistema de Automação" + "Protocolo MJ-* informado ao paciente" |
| `ASSUMIDA` (atribuição real) | `atendimento.functions.ts` L2048 / L2775 e RPC de distribuição | "Conversa atribuída a [pessoa]" |
| `HANDOFF_AUDITORIA` | `handoff-auditoria.server.ts` L31 | cai no `default` → "handoff auditoria" + "Handoff auditado · Protocolo MJ-*" |
| `RESUMO_IA_GERADO` | `handoff-resumo.server.ts` L351 | "Resumo interno da Nina gerado para o atendimento" |
| `TRANSFERIDA` | `atendimento.functions.ts` L637 | texto de encaminhamento por setor/pessoa |
| `FINALIZADA` | `resolver-conversa.server.ts` L85 | encerramento |
| `REABERTA`, `ATRIBUIDA_IA`, `DEVOLVIDA_PARA_IA`, `DESATRIBUIDA`, `IA_MEMORIA_RESETADA`, `ATENDIMENTO_ENCERRADO`, `TIMEOUT_NINA`, `AGENDAMENTO_CRIADO`, `IA_SILENCIADA`, `vinculo_paciente*` | módulos correspondentes | ver `textoEvento` |

Mensagens de sistema gravadas em `whatsapp_mensagens` (não são eventos):

- `🧾 Handoff realizado pela Nina · Protocolo: MJ-* · Destino: …` (`handoff.server.ts` L308)
- `🔁 Conversa transferida da Nina para atendimento humano · …` (L336) — a
  timeline já mostra a versão curta "Transferida para atendimento humano"
  via `marcador-handoff.ts`.
- `👤 Atribuída automaticamente a [pessoa] (online).` (L492)
- Mensagem real ao paciente com o protocolo (`mensagem-handoff.server.ts`).

## 3. O que pertence ao MESMO handoff

Confirmado em dados reais (conversa `f15d…5796`, 10/09 14:01, intervalo de 4s):

```text
14:01:15.85  HANDOFF_SOLICITADO        (evento base, motivo clínico)
14:01:15.88  ENTROU_NA_FILA            (posição 4)
14:01:15.97  HANDOFF_SOLICITADO        (Protocolo MJ-5 gerado)
14:01:15.9x  msg sistema 🧾 Handoff realizado pela Nina · Protocolo MJ-5
14:01:15.9x  msg sistema 🔁 Conversa transferida da Nina… (exibida compacta)
14:01:18.97  ASSUMIDA                  (Protocolo MJ-5 informado ao paciente)
14:01:19.35  HANDOFF_AUDITORIA         (Handoff auditado · Protocolo MJ-5)
14:01:49.34  RESUMO_IA_GERADO          (versão 1)
14:01:58.86  ASSUMIDA                  (atribuição automática — menor carga)
```

Chave de agrupamento disponível hoje: `handoffEventoId` (id do
`HANDOFF_SOLICITADO` base) é propagado para o protocolo e para a auditoria,
e o `protocol_number` MJ-* aparece em `detalhes` do protocolo, da auditoria e
do resumo. Ou seja: **já existe vínculo suficiente para agrupar sem criar
campo novo**.

## 4. Protocolo oficial MJ-*

- Gerado pela função de banco `atend_gerar_protocolo_atendimento`
  (`garantirProtocoloAtendimento`), idempotente por ciclo.
- Nasce no início do handoff (`protocoloAoIniciarHandoff`) e é reaproveitado
  na atribuição a uma pessoa (`protocoloAoAtribuirHumano`, que funciona como
  retry do anúncio ao paciente).
- Fica em `atend_conversas.protocolo_atendimento` e é citado nos `detalhes`
  dos eventos de protocolo, auditoria e no payload do resumo.

## 5. Por que existem DOIS eventos parecidos de atribuição

1. `ASSUMIDA` com motivo "Protocolo MJ-* informado ao paciente" — criado pelo
   módulo de protocolo, sem `user_id`; por isso o texto mostra "Sistema de
   Automação". Ele registra a comunicação do protocolo, não uma atribuição.
2. `ASSUMIDA` real — criado quando a conversa passa para uma pessoa
   (distribuição automática ou tomada manual), com `detalhes.metodo`/`origem`.

O renderizador usa o mesmo rótulo para os dois, por isso parecem duplicados.
Além disso o marcador de sistema `👤 Atribuída automaticamente a …` repete em
mensagem aquilo que o evento já diz.

## 6. Por que o "Resumo interno da Nina" aparece repetido

Medição no banco: 42 eventos `RESUMO_IA_GERADO` para 6 conversas — numa única
conversa houve 10 eventos com `versao: 2` em ~1 segundo.

Causa: `garantirResumoHandoff` insere o evento a cada geração concluída e
**não tem trava de concorrência**. `ResumoHandoffCard` pede o resumo ao abrir
a conversa (uma vez por conversa por aba) e recarrega ao receber realtime de
`atend_handoff_resumos`; com várias abas/atendentes e o retorno do realtime,
várias gerações da MESMA versão rodam em paralelo e cada uma grava um evento.
`FINALIZADA` também aparece duplicado quando a resolução é disparada duas
vezes seguidas.

**Conteúdo real do resumo:** tabela `atend_handoff_resumos`
(`payload`, `versao`, `status`, `desfecho`), exibido pelo card roxo
`ResumoHandoffCard`. O evento na timeline é só um aviso — não guarda texto.

## 7. Classificação

**A. Mensagem real da conversa** — mensagens de paciente, Nina e atendente,
incluindo a mensagem com o protocolo enviada ao paciente.

**B. Evento operacional relevante** — `HANDOFF_SOLICITADO` (base),
`ENTROU_NA_FILA`, `ASSUMIDA` real, `TRANSFERIDA`, `DESATRIBUIDA`,
`ATRIBUIDA_IA`/`DEVOLVIDA_PARA_IA`, `FINALIZADA`, `REABERTA`, `TIMEOUT_NINA`,
`AGENDAMENTO_CRIADO`, `IA_SILENCIADA`, `IA_MEMORIA_RESETADA`.

**C. Evento técnico** — `HANDOFF_AUDITORIA`, `HANDOFF_SOLICITADO` de geração
de protocolo, `ASSUMIDA` de "protocolo informado", `RESUMO_IA_GERADO`,
`vinculo_paciente*`.

**D. Informação redundante** — dentro do mesmo handoff:
- 2º `HANDOFF_SOLICITADO` (protocolo) vs. o 1º;
- msg de sistema `🧾 Handoff realizado…` vs. eventos de handoff/protocolo;
- msg de sistema `🔁 Conversa transferida…` (já compactada) vs.
  `HANDOFF_SOLICITADO`;
- msg de sistema `👤 Atribuída automaticamente a …` vs. `ASSUMIDA` real;
- `HANDOFF_AUDITORIA` na timeline (pertence à auditoria, não à conversa);
- `RESUMO_IA_GERADO` repetido para a mesma versão.

## 8. Como preservar o histórico na próxima fase

- Nada precisa ser apagado: agrupar/ocultar é decisão de **apresentação**
  (mesma técnica já usada em `marcador-handoff.ts`).
- O agrupamento pode usar `handoffEventoId` + `protocol_number` + janela de
  tempo, que já existem nos `detalhes`.
- A repetição de `RESUMO_IA_GERADO` é causa de banco/concorrência: pode ser
  tratada com idempotência por `(conversa, versão)` sem remover registros
  antigos.
- Conversas antigas continuam legíveis porque a timeline permanece lendo as
  mesmas tabelas.

## 9. Gate de saída

- Typecheck (`bunx tsgo --noEmit`) e build executados após o levantamento: sem erros.
- Nenhum arquivo de comportamento alterado nesta fase.
