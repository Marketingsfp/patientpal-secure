# FASE 1 — Auditoria: início do teste de carga e reset da Nina nos Leads de Teste

Escopo: **somente Homologação → Testes de carga e alto volume → Leads de Teste**.
Nesta fase **nenhum comportamento foi alterado**. Documento de mapeamento para a FASE 2.

## 1. Fluxo atual, ponta a ponta

| Etapa | Onde |
|---|---|
| Botão "Iniciar teste de carga" | `src/components/nina/CargaTeste.tsx:378-385` → `iniciar()` (`:125-163`) |
| Cria a execução | `criarTesteCarga` — `src/lib/nina/carga.functions.ts:125-192` |
| Seleção dos leads (1–10) | `garantirLeads` — `src/lib/nina/teste-console.server.ts:33-58`; vínculo lead↔item do plano em `carga.functions.ts:160-170` |
| Fila de mensagens | `planoDeMensagens` (`src/lib/nina/carga.ts`), gravada em `nina_teste_carga.plano` |
| Execução dos lotes | `executarLoteCarga` — `carga.functions.ts:213-411` (loop de rodadas, cancelamento por flag lida do banco `:262-271`) |
| **Primeira mensagem real** | `processarMensagemTeste` — chamada em `carga.functions.ts:288-299`; dentro dela `garantirCiclo` (`teste-console.server.ts:79-137`) e, ao final, `gerarRespostaNina(..., { teste: true })` (`teste-console.server.ts:450-462`) |
| Parar teste | `pararTesteCarga` — `carga.functions.ts:414-428` |

Consequência: **não existe hoje nenhum passo de preflight**. A primeira mensagem de um novo
teste cai direto em `garantirCiclo`, que **reaproveita** `conversa_id`/`ciclo_id` já
existentes no lead (`teste-console.server.ts:85-86`) — ou seja, o ciclo anterior continua.

## 2. Reset canônico já existente (não criar um segundo)

- **Leads de Teste (homologação)** — `resolverConversaTeste`,
  `src/lib/nina/teste-console.functions.ts:378-502`. É a rotina usada pelo botão
  "Resolver" do console (`src/components/nina/HomologacaoInbox.tsx:189`) e pela ferramenta
  WebMCP (`src/lib/webmcp/ferramentas.ts:467`). Ela:
  - fecha `atend_conversas` (`status=finished`, `owner_type=NONE`, `ai_enabled=false`,
    `atribuida_user_id=null`, identidade zerada, `nina_fluxo_estado=null`,
    `patient_response_deadline=null`, `handoff_resumo/motivo=null`, `closed_at`/`resolved_at`);
  - registra os eventos `FINALIZADA` e `IA_MEMORIA_RESETADA` na linha do tempo;
  - encerra o ciclo em `nina_teste_ciclos` (`patchEncerrarCiclo("resolvido_manual")`), **preservando o histórico**;
  - avança a sessão do lead: `sessao_seq+1`, novo `telefone_sessao`, `conversa_id=null`,
    `ciclo_id=null` → a próxima mensagem cria conversa/ciclo novos, sem alcance ao histórico anterior;
  - opcionalmente remove agendamentos de teste (`removerAgendamentos`).
- **Reset por handoff** — `encerrarCicloTestePorHandoff`,
  `src/lib/nina/handoff-ciclo.server.ts:35+` (chamado por `handoff.server.ts:361`).
- **Produção (não usar aqui)** — `resolverConversaCore`,
  `src/lib/atendimento/resolver-conversa.server.ts:31-117`, exposta por `fecharConversa`
  (`src/lib/atendimento.functions.ts:672-704`). Fecha a conversa, mas **não** avança sessão
  nem zera ciclo do lead de teste.

**Conclusão:** o reset canônico para a FASE 2 é `resolverConversaTeste`. Não deve ser criada
outra implementação; no máximo extrair seu núcleo para reuso server-side.

## 3. O que é "memória da Nina" (estados por conversa)

| Estado | Onde mora | Zerado por `resolverConversaTeste`? |
|---|---|---|
| Fluxo/etapa, intenção, campos coletados, agendamento/slot, sessão (`session_id`, TTL), esclarecimento pendente | `atend_conversas.nina_fluxo_estado` (JSON; `fluxo-estado-normalizar.ts`, `sessao.ts`) | Sim (`nina_fluxo_estado=null`) |
| Identificação do paciente | `atend_conversas.identidade_*` | Sim |
| Handoff/resumo | `atend_conversas.handoff_resumo/handoff_motivo`; `atend_handoff_resumos` | Campos da conversa: sim. Resumo histórico: preservado |
| Timer de espera do paciente | `atend_conversas.patient_response_deadline`, `awaiting_patient_since`; job `src/routes/api/public/nina.espera-timeout.ts` | `patient_response_deadline`: sim. **`awaiting_patient_since`: NÃO** |
| Stale-response guard / revisão | `nina_conversa_revisoes` (RPC `nina_revisao_incrementar`/`_atual`; `revisao-conversa.server.ts`, `revisao.ts`) | **Não** (fica preso à conversa antiga — inofensivo, pois a nova conversa começa em 0) |
| Lock/lease de turno (90s) | `nina_conversa_locks` (`lock-conversa.server.ts`) | **Não** (expira sozinho pelo lease) |
| Lotes de burst pendentes | `nina_message_batches`, `nina_message_batch_itens` (`burst.server.ts`, `recuperarLotesTravados`) | **Não** |
| Execuções em andamento / telemetria | `nina_execucoes`, `nina_prompt_snapshots` | Não (auditoria, deve ser preservada) |
| Ciclo e telefone virtual do lead | `nina_teste_leads`, `nina_teste_ciclos` | Sim (nova sessão) |

Marcar a conversa como resolvida **não** basta: sobram lock, lote de burst e
`awaiting_patient_since` presos à conversa anterior.

## 4. Resíduos assíncronos do teste anterior que podem contaminar o próximo

1. `nina_conversa_locks` com lease de até 90s após uma execução interrompida.
2. Lotes de burst pendentes/travados em `nina_message_batches`.
3. `nina_teste_carga.status="executando"` de um teste cuja aba foi fechada — a UI não retoma sozinha.
4. Ciclos ainda ativos (`nina_teste_leads.conversa_id/ciclo_id` preenchidos) → `garantirCiclo` reaproveita a conversa antiga.
5. `patient_response_deadline`/`awaiting_patient_since` vencendo durante a nova rodada, podendo acionar handoff no meio do teste.
6. Execução da Nina ainda em voo do lote anterior (o `Promise.race` de timeout abandona a espera, mas não cancela o trabalho no servidor).

## 5. Onde inserir o preflight (FASE 2)

Ponto único e determinístico: **dentro de `criarTesteCarga`**
(`src/lib/nina/carga.functions.ts`), depois de `garantirLeads` e da validação
(`:146-147`) e **antes** de inserir a linha em `nina_teste_carga` — portanto antes de
qualquer chamada a `executarLoteCarga`/`processarMensagemTeste`.

Regras a implementar na FASE 2:
- alcançar **apenas** os leads que participarão daquela execução
  (`leads.slice(0, config.leadsAtivos)` — o mesmo conjunto usado em `:162`);
- reutilizar o núcleo de `resolverConversaTeste` para cada lead com conversa aberta;
- complementar com o que ele não cobre: liberar lock, encerrar lote de burst pendente e
  limpar `awaiting_patient_since`;
- só criar a execução do teste depois da **confirmação de reset de todos os leads**; se
  algum falhar, não iniciar e relatar;
- não tocar em WhatsApp real, não resolver conversas reais, não apagar histórico.

## 6. Gate de saída

- Fluxo mapeado (§1), reset canônico identificado (§2), estados conhecidos (§3),
  ponto de inserção definido (§5).
- Nenhuma alteração de código, banco, rota ou UI nesta fase.
