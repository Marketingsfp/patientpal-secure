# FASE 0 — Auditoria da Homologação da Nina (diagnóstico, sem alterações)

Data: 07/09/2026. Nenhum arquivo de funcionalidade foi alterado nesta fase.
Clínica usada como referência de dados: POLICLINICA MENINO JESUS
(`7570ddde-8c1c-4b55-ba72-cf12b2a6c940`). A clínica-alvo da futura reformulação
ainda precisa ser confirmada antes da Fase 1.

## 1. Arquitetura atual

### 1.1 Página Nina → Homologação
- Rota: `src/routes/_authenticated/app.nina.tsx` (aba `homologacao`, linha ~137).
- Componente da aba: `src/components/nina/HomologacaoWhatsapp.tsx` (399 linhas) —
  formulário "Enviar teste": número de destino, tipo de envio (texto/template),
  cenário pré-pronto, mensagem, botão Enviar teste, "Histórico desta sessão".
  Envia MENSAGEM REAL pela Meta (`enviarMensagemWhatsapp`, `enviarTemplateWhatsapp`).
- Dentro dela é renderizado o simulador real: `src/components/nina/ConsoleTesteNina.tsx`
  (635 linhas), que usa `src/lib/nina/teste-console.functions.ts` (729 linhas).

### 1.2 Mensagem real (produção)
`POST /api/public/whatsapp/$clinicaId` → dedupe por `wa_message_id` →
grava `whatsapp_mensagens` / atualiza `atend_conversas` → handoff
(`ninaPodeResponder`) → `gerarRespostaNina` (`src/lib/whatsapp.server.ts:504`) →
contexto (clínica, médicos, agenda, paciente via RPC `buscar_paciente_contato`,
base de conhecimentos) → tool broker → modelo via `ninaAIGateway` →
traces (`nina_execucoes`, `nina_trace_eventos`, `nina_execucao_evidencias`) →
envio à Meta (`metaSendText`/`metaSendAudio`) → grava mensagem `out`.

### 1.3 Mensagem de homologação
`ConsoleTesteNina` → `enviarMensagemTeste` → grava mensagem `in` com
`is_teste: true`, `canal: "test-console"` → **mesma** `gerarRespostaNina`, com
`{ teste: true }` → grava resposta no banco. Nunca chama a Meta.

Divergências reais entre os dois caminhos: (a) origem do evento, (b) flag
`teste`/`origem: "homologacao"`, (c) ausência do envio à Meta. Todo o resto —
modelo, prompt, ferramentas, memória, agenda, CRM, RAG e traces — é o mesmo
código e o mesmo banco.

## 2. Frontend das conversas reais (o que queremos reutilizar)

Tudo vive em `src/components/nina/AtendimentoExtraTabs.tsx` → componente
`AtendInbox` (linhas 235–3374), monolítico, 3 colunas:

| Item | Onde está | Reutilizável? |
| --- | --- | --- |
| Lista de conversas | inline ~2400–2597 | não (acoplado a `listarConversas`, filtros, realtime) |
| Cabeçalho da conversa | inline 2621–2762 | não |
| Mensagens/balões | inline 2763–2894 | não |
| Composer | inline 2896–2996 | não |
| Painel do paciente | inline 3001–3170 | não |
| Diálogos assumir/transferir/encerrar | 3188–3370 | não |
| Balão de texto da Nina | `NinaMessage.tsx` | **sim** (props puras) |
| "Digitando" | `TypingDots` em `NinaMessage.tsx` | **sim** (hoje sem uso na inbox) |
| Mensagens de sistema | `ConversationSystemEvent.tsx` | **sim** |
| Skeletons de carregamento | `ConversaSkeleton.tsx` | **sim** |
| Badge de espera | `BadgeEspera.tsx` | **sim** |
| Respostas rápidas (lista) | `RespostasRapidas.tsx:152` | **sim** (só a lista; o hook é acoplado) |
| Scroll/auto-scroll/"N novas" | `use-chat-scroll.ts` | **sim** (hook de comportamento) |
| Realtime | `use-realtime-atendimento.ts` | sim, mas `realtime-roteador.ts:51` DESCARTA linhas `is_teste` |

Consequência prática: hoje é impossível "usar a inbox real" na Homologação sem
extrair de `AtendInbox` a camada de apresentação (lista, header, timeline,
composer) para componentes que recebam dados por props, com dois provedores de
dados: produção e homologação.

## 3. Componentes que sairão da experiência principal (não removidos nesta fase)

- `src/components/nina/HomologacaoWhatsapp.tsx` inteiro: formulário "Enviar
  teste", número de destino, tipo de envio, cenário, mensagem, "Histórico desta
  sessão" e o `PREFIXO = "[TESTE]"`.
- O ponto de montagem em `app.nina.tsx` (~linha 137) e o import (linha 60).
- Atenção: esse componente é hoje o ÚNICO caminho que renderiza
  `ConsoleTesteNina`. Remover a casca exige remontar o console (ou o novo
  frontend) diretamente na aba.
- As funções `enviarMensagemWhatsapp` / `enviarTemplateWhatsapp` NÃO devem ser
  removidas: são usadas pelo atendimento real.

## 4. Os 10 Leads de Teste (preservar)

- Tabela `public.nina_teste_leads`: `id, clinica_id, indice, nome,
  telefone_base, sessao_seq, telefone_sessao, conversa_id, status, environment,
  source_channel, is_test, created_at, updated_at`.
- Criação idempotente por clínica (`garantirLeads`), 10 leads, nome
  "Lead Teste 01..10".
- Telefone virtual por sessão: `5500<indice><sessao>` — DDD 00 não existe no
  Brasil, então nunca colide com paciente real.
- Conversa própria por lead em `atend_conversas` com `canal: "test-console"`,
  `is_teste: true`.
- Reset: `resolverConversaTeste` finaliza a conversa, incrementa `sessao_seq` e
  troca o telefone virtual — como memória/identidade são buscadas por telefone +
  conversa, a próxima conversa nasce sem memória. Registra eventos
  `FINALIZADA` e `IA_MEMORIA_RESETADA` na linha do tempo.
- Limite de 400 mensagens por lead (poda das mais antigas).
- Isolamento entre leads: por telefone virtual distinto — sólido.

## 5. Isolamento produção × homologação (situação real)

Isolado hoje:
- Envio à Meta (teste nunca envia).
- Inbox operacional: `atendimento.functions.ts` filtra `is_teste = false`.
- Realtime: `realtime-roteador.ts:51` descarta eventos de conversas de teste.
- Protocolo de atendimento e parte do handoff ignoram `is_teste`.

NÃO isolado (riscos):
1. `agendamentos`: a ferramenta grava linha REAL na agenda e só depois marca
   `is_mock_data = true` / `origem_integracao = 'nina_homologacao'`. Se ninguém
   clicar em "remover agendamentos do teste", o registro fica na agenda real.
2. CRM/pacientes: a identificação consulta a base real de pacientes.
3. `nina_execucoes` e `nina_trace_eventos` **não têm coluna de teste** — métricas
   e traces misturam homologação com produção.
4. `nina_kb_consultas` registra consultas de teste sem marcação.
5. `audit_log` recebe ações de ferramentas de teste.
6. Timers de espera/timeout rodam igual para conversas de teste.
7. Dados atuais na clínica de referência: 186 de 558 conversas são de teste.

## 6. Modelos Terra, Luna e Sol

Consulta real ao provedor (`/v1/models`, autenticada) confirmou que os três
existem e não estão depreciados:

- `openai/gpt-5.6-terra` — simulador de paciente.
- `openai/gpt-5.6-luna` — geração de mensagens para carga/alto volume.
- `openai/gpt-5.6-sol` — avaliador das respostas da Nina.

São modelos `openai/*`, portanto obrigatoriamente pela API de Responses
(`/v1/responses`, streaming, `store: false`). Isso NÃO altera o modelo da Nina,
que continua resolvido por `src/lib/nina/modelo-flag.server.ts`
(`google/gemini-2.5-flash`, com flag por clínica para `google/gemini-3.7-flash`).

Acesso pelo backend: `LOVABLE_API_KEY` server-side, nunca no navegador; toda
execução deve registrar o `model` exatamente como retornado, junto do
`X-Lovable-AIG-Run-ID`.

Estratégias propostas (a detalhar na Fase 1):
- **Terra**: conversa como paciente contra um lead de teste, turno a turno,
  usando o mesmo `enviarMensagemTeste`; persona e objetivo por cenário.
- **Luna**: gera lotes de mensagens/variações para carga; execução sequencial e
  em fila, respeitando limite de taxa do provedor e o teto de 400 mensagens por
  lead; nunca dispara em paralelo sem controle.
- **Sol**: avalia a transcrição + traces (ferramentas, agenda, handoff) e emite
  nota/parecer por critério; grava resultado em tabela própria de homologação.

## 7. Riscos

- Extrair a inbox real para reuso mexe no atendimento em produção: risco alto,
  exige extração puramente visual, sem tocar em regras.
- Homologação com Terra/Luna gerando volume alto pode criar agendamentos reais,
  poluir métricas e consumir créditos de IA.
- Métricas/traces sem coluna de teste hoje já contaminam relatórios.
- Custo: `openai/gpt-5.6-*` são modelos de raciocínio; carga alta custa crédito.

## 8. Migrations provavelmente necessárias (Fase 1+)

1. `is_teste boolean` (+ índice) em `nina_execucoes` e `nina_trace_eventos`,
   com filtro por padrão nos painéis.
2. Marcação de teste em `nina_kb_consultas`.
3. Tabelas novas de homologação: execuções de suíte (Terra/Luna) e avaliações
   (Sol), com `clinica_id`, RLS e GRANTs.
4. Bloqueio (trigger ou verificação em código) para que agendamento de teste
   nasça já como `is_mock_data = true`, em vez de nascer real.

Nada acima foi implementado. Fase 1 não iniciada.
