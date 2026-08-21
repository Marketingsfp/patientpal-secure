# API de Integração de Agendamentos — `/api/integrations/v1`

Objetivo: permitir que um sistema externo consulte horários, crie, consulte, cancele e reagende
atendimentos **usando exatamente as mesmas regras de negócio já validadas** hoje na Agenda,
sem nenhum INSERT/UPDATE direto na tabela `agendamentos` e sem enfraquecer a autenticação atual.

## Antes de implementar — preciso confirmar com você

1. **Clínica-alvo:** a integração vale só para a POLICLINICA MENINO JESUS ou para todas as clínicas?
   (A chave de API é sempre amarrada a uma clínica; a pergunta é quantas chaves emitimos.)
2. **Quem paga:** o agendamento criado pela API entra como não pago (o paciente paga na chegada,
   regra global) — confirma? A API **não** vai registrar pagamento nem mexer no caixa.
3. **Paciente inexistente:** se o sistema externo mandar um CPF que não existe na base, a API deve
   (a) recusar com erro, ou (b) criar o paciente automaticamente? Recomendo (a) no v1.

## Eixos de impacto (governança)

- **Financeiro:** neutro no v1. Nenhum lançamento, nenhum caixa, nenhum repasse. O agendamento nasce
  sem pagamento e segue a regra "sem pagamento não realiza".
- **Operacional:** elimina digitação manual de agendamentos vindos do parceiro; a recepção só confere.
- **Experiência:** paciente agenda no canal externo e já chega com horário reservado de verdade.
- **Segurança/Auditoria:** chave de API por clínica, escopo fechado, rate limit, log de toda chamada
  e trilha em `audit_log` com o nome da integração como autor.

## O problema central: `requireSupabaseAuth`

Hoje `criarAgendamento`, `atualizarStatusAgendamento` e `reagendarAgendamento` são server functions
com `.middleware([requireSupabaseAuth])`. Elas fazem duas coisas ao mesmo tempo:

```text
[ autenticar o funcionário ]  +  [ aplicar as 9 regras de negócio ]
```

A integração externa não tem login de funcionário, então precisa da segunda parte sem a primeira.
A solução **não** é afrouxar o middleware. É separar as duas camadas:

```text
                 ┌──────────────────────────────────────────────┐
                 │  NÚCLEO DE REGRAS (novo, server-only)        │
                 │  src/lib/agenda/*.core.server.ts             │
                 │  recebe: { db, ator, clinica_id } + payload  │
                 │  contém: as 9 validações + as RPCs           │
                 └───────────▲──────────────────▲───────────────┘
                             │                  │
     ator = funcionário      │                  │   ator = integração
     db = RLS do usuário     │                  │   db = service role, escopo
                             │                  │        travado pela chave
 ┌───────────────────────────┴──┐        ┌──────┴─────────────────────────┐
 │ criarAgendamento (existente) │        │ src/routes/api/integrations/   │
 │ .middleware(requireSupabase) │        │ v1.* (novas rotas HTTP)        │
 │ ← Agenda clássica, V2, etc.  │        │ ← autenticação por API key     │
 └──────────────────────────────┘        └────────────────────────────────┘
```

Pontos que garantem que nada enfraquece:

- O middleware `requireSupabaseAuth` **continua exatamente como está** em todas as server functions.
- O núcleo é um arquivo `*.server.ts` — o bundler proíbe qualquer import dele pelo navegador.
- O `clinica_id` da integração vem **sempre da chave de API**, nunca do corpo da requisição.
  Um parceiro não consegue agendar em outra clínica nem mandando o id de outra.
- O núcleo recebe um "ator" explícito e o grava na auditoria; nada roda anônimo.
- Continua valendo: nenhuma gravação direta em `agendamentos`. O núcleo chama as mesmas RPCs
  transacionais de hoje (`salvar_agendamento_e_vincular_orcamento`, `reagendar_atendimento`),
  e os gatilhos do banco (`fn_agendamento_valida_destino`, `fn_agendamento_exige_pagamento`,
  auditoria) continuam sendo a última linha de defesa.

## Endpoints do v1

Todos sob `/api/integrations/v1/...`. Prefixo `/v1` fixo na URL; mudança incompatível vira `/v2`.

| Método | Rota | Reutiliza |
|---|---|---|
| GET | `/availability` | RPC `get_horarios_disponiveis` |
| POST | `/appointments` | núcleo de `criarAgendamento` |
| GET | `/appointments/:id` | leitura escopada por clínica |
| POST | `/appointments/:id/cancel` | núcleo de `atualizarStatusAgendamento` |
| POST | `/appointments/:id/reschedule` | núcleo de `reagendarAgendamento` |

Observação sobre o local: essas rotas **não** vão para `/api/public/*`. Aquele prefixo pula a
autenticação da plataforma; aqui queremos um caminho próprio, autenticado por chave. Se na prática o
parceiro precisar chamar de fora do domínio publicado, o caminho será `/api/public/integrations/v1/*`
com a mesma verificação de chave dentro do handler — decidimos isso na aprovação.

## Autenticação por API key

- Cabeçalho: `Authorization: Bearer <chave>` e `X-Integration-Key-Id: <prefixo>`.
- A chave **nunca** é guardada em texto: gravamos `sha256(chave)` na tabela `integracao_api_keys`,
  junto com `clinica_id`, `origem_integracao` (ex.: `parceiro-abc`), escopos e `ativo`.
- Comparação em tempo constante; chave inválida/inativa/expirada → `401`, sem detalhar o motivo.
- A chave é gerada por nós e entregue uma única vez ao parceiro. Um segredo de aplicação
  (`INTEGRACAO_HASH_PEPPER`) entra no hash e fica no cofre de segredos do projeto — não no código,
  não em `.env` versionado.
- Escopos por chave: `availability:read`, `appointments:write`, `appointments:read`. Uma chave só de
  leitura não consegue agendar.

## Rate limiting

- Contagem por chave, em janela deslizante, gravada no banco (`integracao_rate_limit`), porque o
  servidor é sem estado e memória local não serve.
- Padrão sugerido: 60 req/min e 1000 req/dia por chave; `/availability` com teto próprio maior.
- Excedeu → `429` com `Retry-After` e cabeçalhos `X-RateLimit-Limit` / `-Remaining` / `-Reset`.

## Validação de payload

- Zod em cada rota, com limites explícitos (tamanho de string, formato de data ISO 8601 com fuso,
  UUID, enums). Nada de campo livre passando direto.
- Campos desconhecidos são rejeitados (não ignorados) — evita o parceiro achar que mandou algo que
  não foi lido.
- Corpo maior que 32 KB → `413`.
- Validação de formato é a primeira camada; as regras de negócio continuam no núcleo.

## Tratamento de erros

Formato único, sem vazar detalhe interno do banco:

```json
{
  "error": {
    "code": "SLOT_UNAVAILABLE",
    "message": "Horário não está disponível para este profissional.",
    "request_id": "req_01J..."
  }
}
```

| HTTP | code | Quando |
|---|---|---|
| 400 | `INVALID_PAYLOAD` | Zod reprovou |
| 401 | `UNAUTHENTICATED` | chave ausente/inválida |
| 403 | `FORBIDDEN_SCOPE` | chave sem o escopo |
| 404 | `NOT_FOUND` | agendamento fora da clínica da chave |
| 409 | `SLOT_UNAVAILABLE` / `PATIENT_BUSY` / `DUPLICATE_EXTERNAL_ID` | conflito de regra |
| 422 | `PATIENT_INCOMPLETE` / `SCHEDULE_CLOSED` / `PAYMENT_REQUIRED` | regra de negócio |
| 429 | `RATE_LIMITED` | teto estourado |
| 500 | `INTERNAL_ERROR` | falha inesperada (detalhe só no log) |

As mensagens PT-BR já existentes no núcleo são mapeadas para esses códigos — a regra não muda,
só ganha um código estável para o parceiro tratar.

## Logs e auditoria

Duas coisas diferentes, ambas necessárias:

- **Log técnico** (`integracao_requisicoes`): request_id, key_id, rota, método, status, duração,
  `id_externo`, IP e um resumo do erro. Corpo completo **não** é gravado (tem dado de paciente).
  Retenção sugerida: 90 dias.
- **Auditoria de negócio** (`audit_log`): já existe via gatilho em `agendamentos` e continua
  disparando. O que muda é que o núcleo passa a registrar o ator "integração `parceiro-abc`" no
  campo de autor, para a trilha não ficar anônima.

## Idempotência

- Cabeçalho `Idempotency-Key` obrigatório em todo POST.
- Tabela `integracao_idempotencia` guarda `(key_id, idempotency_key)` como UNIQUE, mais o hash do
  corpo e a resposta gravada.
- Mesma chave + mesmo corpo → devolve a resposta original com `Idempotent-Replay: true`.
- Mesma chave + corpo diferente → `409 IDEMPOTENCY_KEY_REUSED`.
- Janela de retenção: 24 h.

## Campos novos em `agendamentos`

- `origem_integracao text` — identificador do parceiro (`parceiro-abc`). Nulo em agendamento interno.
- `id_externo text` — o id do agendamento no sistema do parceiro.
- Índice: `CREATE UNIQUE INDEX ... ON agendamentos (origem_integracao, id_externo)
  WHERE origem_integracao IS NOT NULL AND id_externo IS NOT NULL` — parcial, para não conflitar com
  os milhares de agendamentos internos que têm os dois campos nulos.
- **`origem_externa` não é tocado.** Ele hoje significa "atendimento veio de outra clínica, com
  repasse financeiro" e é usado por `fin_atendimentos` — misturar os dois quebraria o repasse.

## Exemplos

### GET /availability

```http
GET /api/integrations/v1/availability?medico_id=...&data=2026-09-02&procedimento_id=...
Authorization: Bearer sk_live_...
```

```json
{
  "data": "2026-09-02",
  "medico_id": "…",
  "slots": [
    { "inicio": "2026-09-02T09:00:00-03:00", "fim": "2026-09-02T09:20:00-03:00" },
    { "inicio": "2026-09-02T09:20:00-03:00", "fim": "2026-09-02T09:40:00-03:00" }
  ]
}
```

### POST /appointments

```http
POST /api/integrations/v1/appointments
Authorization: Bearer sk_live_...
Idempotency-Key: 8f2c1a94-...
Content-Type: application/json
```

```json
{
  "id_externo": "AGD-99812",
  "paciente": { "cpf": "12345678900" },
  "medico_id": "…",
  "procedimento_id": "…",
  "inicio": "2026-09-02T09:00:00-03:00",
  "fim": "2026-09-02T09:20:00-03:00",
  "tipo_atendimento": "particular",
  "observacoes": "Agendado pelo portal do parceiro"
}
```

`201 Created`

```json
{
  "id": "1f0a…",
  "id_externo": "AGD-99812",
  "status": "agendado",
  "inicio": "2026-09-02T09:00:00-03:00",
  "fim": "2026-09-02T09:20:00-03:00",
  "pagamento": { "pago": false, "obrigatorio_na_chegada": true },
  "origem_integracao": "parceiro-abc"
}
```

Conflito (`409`):

```json
{ "error": { "code": "SLOT_UNAVAILABLE", "message": "Horário não está disponível para este profissional.", "request_id": "req_01J…" } }
```

### POST /appointments/:id/cancel

```json
{ "motivo": "Cancelado pelo paciente no portal" }
```

`200` → `{ "id": "1f0a…", "status": "cancelado" }`

### POST /appointments/:id/reschedule

```json
{ "inicio": "2026-09-03T14:00:00-03:00", "fim": "2026-09-03T14:20:00-03:00", "medico_id": "…" }
```

`200` → `{ "id": "1f0a…", "inicio": "…", "fim": "…", "status": "agendado" }`
O `id` é preservado, igual ao reagendamento interno.

## Arquivos criados

| Arquivo | Papel |
|---|---|
| `supabase/migrations/<data>_integracao_agendamentos.sql` | colunas `origem_integracao`/`id_externo`, índice UNIQUE parcial, tabelas `integracao_api_keys`, `integracao_requisicoes`, `integracao_idempotencia`, `integracao_rate_limit` + GRANTs + RLS |
| `src/lib/agenda/criar-agendamento.core.server.ts` | as 9 regras de criação, movidas do handler, recebendo `{ db, ator }` |
| `src/lib/agenda/status-agendamento.core.server.ts` | idem para mudança de status/cancelamento |
| `src/lib/agenda/reagendar-agendamento.core.server.ts` | idem para reagendamento |
| `src/lib/integracoes/auth.server.ts` | validação da chave, escopos, resolução de `clinica_id` |
| `src/lib/integracoes/rate-limit.server.ts` | janela deslizante no banco |
| `src/lib/integracoes/idempotencia.server.ts` | gravar/reproduzir resposta |
| `src/lib/integracoes/erros.ts` | mapa mensagem PT-BR → código HTTP/estável |
| `src/lib/integracoes/schemas.ts` | schemas Zod dos 5 endpoints |
| `src/lib/integracoes/handler.server.ts` | envelope comum: chave → escopo → rate limit → idempotência → validação → núcleo → log |
| `src/routes/api/integrations/v1/availability.ts` | endpoint |
| `src/routes/api/integrations/v1/appointments.ts` | endpoint |
| `src/routes/api/integrations/v1/appointments.$id.ts` | endpoint |
| `src/routes/api/integrations/v1/appointments.$id.cancel.ts` | endpoint |
| `src/routes/api/integrations/v1/appointments.$id.reschedule.ts` | endpoint |
| `docs/integracoes/api-v1-agendamentos.md` | documentação para o parceiro |

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/lib/agenda/criar-agendamento.functions.ts` | handler passa a chamar o núcleo; middleware e assinatura pública **inalterados** |
| `src/lib/agenda/status-agendamento.functions.ts` | idem |
| `src/lib/agenda/reagendar-agendamento.functions.ts` | idem |
| `docs/agenda/arquitetura.md` | registrar a API como segundo consumidor autorizado do núcleo |

Nenhum arquivo de tela é tocado. A Agenda clássica, a V2 e o Atendimento Múltiplo continuam
chamando as mesmas funções, com as mesmas mensagens.

## Detalhes técnicos

- Rotas TanStack (`createFileRoute` com bloco `server.handlers`), não Edge Functions.
- O cliente com service role é importado **dentro** do handler (`await import(...)`), depois da
  validação da chave — nunca no topo do arquivo, para não vazar para o pacote do navegador.
- `process.env` lido dentro do handler (o ambiente é injetado por requisição).
- As novas tabelas nascem com RLS ligada, GRANT só para `service_role` e leitura para gestores da
  clínica; `anon` não recebe nada.
- Segredo necessário: `INTEGRACAO_HASH_PEPPER` (gerado por nós, guardado no cofre).
- Nenhum dado do parceiro é aceito para decidir clínica, preço ou pagamento.

## Riscos e o que fica de fora do v1

- **Risco baixo/médio:** a extração do núcleo mexe em código crítico da Agenda. Mitigação: a extração
  é 1:1, sem mudar mensagem nem ordem de checagem, e revalidamos com o roteiro de 12 testes do
  Passo B (`docs/agenda/criar-agendamento-shared.md`) antes de expor a API.
- Fora do v1: orçamento vinculado, multi-exame, pagamento pela API, webhooks de volta para o
  parceiro, criação automática de paciente.
