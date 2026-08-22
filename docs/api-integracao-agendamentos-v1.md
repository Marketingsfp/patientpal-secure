# API de Agendamentos — Health Hub Pro (v1)

API REST genérica de agenda, autenticada por **chave de API**. Não é uma
integração com nenhum sistema específico: é a agenda do Health Hub Pro exposta
para que qualquer sistema externo possa consumir no futuro. Não há webhook nem
sincronização automática nesta versão.

Toda escrita passa pelas **mesmas regras de negócio da tela da Agenda**
(mesmos núcleos de código). A API não grava direto na tabela de agendamentos.

---

## 1. Endereço base

| Ambiente | Base URL |
| --- | --- |
| Produção | `https://patientpal-secure.lovable.app/api/public/integrations/v1` |
| Prévia | `https://project--9cab2db5-e9b1-4209-b352-fc7a438da482-dev.lovable.app/api/public/integrations/v1` |

Existe também o atalho `/api/integrations/v1/...` (mesmo comportamento), mas o
sistema externo deve usar sempre a base `/api/public/...`, que é a única que
não passa pelo login do site.

## 2. Autenticação

Cada clínica tem sua própria chave. Envie em **um** dos cabeçalhos:

```
Authorization: Bearer hh_xxxxxxxx_<segredo>
X-API-Key: hh_xxxxxxxx_<segredo>
```

A clínica **não é enviada no corpo**: ela é deduzida da chave. Uma chave nunca
enxerga dados de outra clínica — a verificação é feita no código, em toda
operação, mesmo com acesso privilegiado ao banco.

### Escopos

| Escopo | Permite |
| --- | --- |
| `availability:read` | consultar horários livres |
| `appointments:read` | listar e consultar agendamentos |
| `appointments:write` | criar, cancelar e reagendar |
| `appointments:write:all` | alterar também agendamentos criados fora da API (concedido caso a caso) |

Sem `appointments:write:all`, a chave só altera o que **ela mesma** criou.

### Emitir e revogar chaves

No banco, logado como administrador/gestor da clínica:

```sql
-- devolve a chave em texto UMA ÚNICA VEZ; o banco guarda só o hash
select public.integracao_criar_api_key(
  '<clinica_id>',
  'Sistema X — produção',
  'sistema-x',                                   -- origem_integracao (único por clínica)
  array['availability:read','appointments:read','appointments:write'],
  null,                                          -- expira_em (opcional)
  60,                                            -- limite por minuto
  1000                                           -- limite por dia
);

select public.integracao_revogar_api_key('<api_key_id>');
```

Homologação já provisionada: origem `homologacao`, 30 req/min e 500 req/dia.

## 3. Limites, idempotência e auditoria

- **Rate limit:** por chave, por minuto e por dia (contador atômico no banco).
  Excedido → `429 rate_limit_exceeded`.
- **Idempotência:** em qualquer `POST`, envie `Idempotency-Key: <valor único>`.
  Repetir a mesma chave com o mesmo corpo devolve a resposta original; com
  corpo diferente devolve `409 idempotency_key_reuse`. Erros não são
  memorizados — pode repetir.
- **Proteção extra contra duplicidade:** reenviar o mesmo `id_externo` devolve
  o agendamento já existente (`replay: true`), com `200` em vez de `201`.
- **Auditoria:** toda chamada é registrada (rota, status, duração, IP,
  `request_id`, `id_externo`). O `request_id` volta no cabeçalho
  `X-Request-Id` e dentro dos erros.

## 4. Endpoints

### 4.1 `GET /availability`

Horários livres da clínica.

| Parâmetro | Tipo | Padrão |
| --- | --- | --- |
| `medico_id` | uuid | — |
| `especialidade_id` | uuid | — |
| `dias` | 1–30 | 7 |
| `limite` | 1–200 | 60 |

```bash
curl -H "Authorization: Bearer $KEY" \
  "$BASE/availability?dias=7&limite=50"
```

```json
{ "data": { "slots": [ { "medico_id": "...", "medico_nome": "...", "inicio": "...", "fim": "...", "vagas": 1 } ], "total": 1 } }
```

### 4.2 `POST /appointments`

Cria o agendamento. **Sempre entra como não pago** (`data_pagamento: null`,
status `agendado`). Pagamento continua sendo feito na recepção/caixa.

```json
{
  "id_externo": "OS-4711",
  "paciente_id": "uuid do paciente já cadastrado",
  "medico_id": "uuid",
  "especialidade_id": "uuid (opcional)",
  "inicio": "2026-09-01T13:00:00Z",
  "fim": "2026-09-01T13:10:00Z",
  "procedimento": "CONSULTA CARDIOLOGIA",
  "procedimentos": ["EXAME A", "EXAME B"],
  "multi_exames_modo": "laboratorio",
  "tipo_atendimento": "particular",
  "observacoes": "texto livre"
}
```

- `paciente_id` é obrigatório e precisa existir na clínica. **Na v1 a API não
  cadastra paciente** — paciente inexistente devolve `422 patient_not_found`.
- `procedimentos` + `multi_exames_modo` seguem a mesma regra da Agenda
  (laboratório conta 1 atendimento; imagem gera um agendamento por exame,
  devolvidos em `agendamentos_irmaos`).

Resposta `201` com o agendamento criado.

### 4.3 `GET /appointments`

Lista com filtros: `id_externo`, `paciente_id`, `medico_id`, `status`, `de`,
`ate`, `limite` (1–200), `offset`.

### 4.4 `GET /appointments/{id}`

`{id}` pode ser o UUID interno ou `ext:<id_externo>`:

```bash
curl -H "Authorization: Bearer $KEY" "$BASE/appointments/ext:OS-4711"
```

### 4.5 `POST /appointments/{id}/cancel`

Corpo opcional: `{ "motivo": "texto" }` (anexado às observações).
Cancelar algo já cancelado devolve `200` com `replay: true`.

### 4.6 `POST /appointments/{id}/reschedule`

```json
{ "inicio": "2026-09-02T13:00:00Z", "fim": "2026-09-02T13:10:00Z", "medico_id": "uuid opcional" }
```

Passa pelas mesmas validações de conflito/slot da tela de Agenda.

## 5. Formato de erro

```json
{ "error": { "code": "patient_not_found", "message": "...", "details": {}, "request_id": "..." } }
```

| HTTP | Código | Significado |
| --- | --- | --- |
| 400 | `invalid_json` | corpo não é JSON válido |
| 401 | `missing_api_key`, `invalid_api_key`, `api_key_revoked`, `api_key_expired` | autenticação |
| 403 | `insufficient_scope` | chave sem o escopo necessário |
| 404 | `route_not_found`, `appointment_not_found` | rota ou registro inexistente (inclui tentativa de acessar outra clínica) |
| 409 | `idempotency_key_reuse`, `request_in_progress` | idempotência |
| 422 | `invalid_body`, `invalid_query`, `invalid_period`, `patient_not_found`, `business_rule_violation` | validação e regra de negócio |
| 429 | `rate_limit_exceeded` | limite de uso |
| 5xx | `read_failed`, `availability_failed` | falha interna |

## 6. O que a API **não** faz na v1

- Não cadastra nem altera paciente.
- Não registra pagamento, orçamento ou caixa.
- Não marca atendimento como "Realizado" (isso é ato do funcionário).
- Não envia webhook nem notifica sistemas externos.

## 7. Onde está o código

| Arquivo | Papel |
| --- | --- |
| `src/routes/api/public/integrations/v1/$.ts` | rota HTTP pública (base canônica) |
| `src/routes/api/integrations/v1/$.ts` | atalho equivalente |
| `src/lib/integracoes/api.server.ts` | chave, escopo, rate limit, idempotência, log, erros |
| `src/lib/integracoes/agendamentos-v1.server.ts` | roteamento e handlers dos endpoints |
| `src/lib/agenda/*.core.server.ts` | regras de negócio, compartilhadas com a tela da Agenda |
| `src/lib/agenda/ator.server.ts` | escopo de clínica/origem sob acesso privilegiado |

---

## 8. Revisão final (v1 congelada) — 22/08/2026

Revisão de conferência, **sem nenhuma alteração de comportamento ou de código**.
Cada item abaixo foi verificado direto no código e no banco.

### 8.1 `/cancel` nunca apaga registro

`POST /appointments/{id}/cancel` chama `atualizarStatusAgendamentoCore` com
`novo_status: "cancelado"`. Não existe nenhum `DELETE` em
`agendamentos-v1.server.ts`, em `api.server.ts` nem nos núcleos
`src/lib/agenda/*.core.server.ts` (a única remoção existente no código da API é
a limpeza de uma linha de idempotência quando a resposta foi erro — nunca um
agendamento). O registro cancelado permanece no banco, com histórico e
auditoria.

A remoção do registro `[QA-API] TESTE INTEGRACAO` foi **limpeza manual de
homologação**, feita por SQL direto no banco ao final dos testes — não é um
comportamento da API. Conferência atual: `0` agendamentos com
`origem_integracao` preenchida.

### 8.2 Onde tudo é persistido

Quatro tabelas foram criadas na Etapa 1 e continuam sendo as únicas usadas:

| Tabela | Guarda |
| --- | --- |
| `integracao_api_keys` | chave (prefixo + SHA-256), clínica, origem, escopos, limites, validade, revogação |
| `integracao_rate_limit` | contador atômico por chave/janela (minuto e dia) |
| `integracao_idempotencia` | `Idempotency-Key`, hash do corpo e resposta memorizada |
| `integracao_requisicoes` | log técnico: rota, método, status, duração, IP, `request_id`, `id_externo` |

Além disso, `agendamentos` ganhou as colunas `origem_integracao` e `id_externo`.
Nenhuma tabela nova foi criada nesta revisão.

### 8.3 URLs públicas exatas

Base de produção: `https://patientpal-secure.lovable.app/api/public/integrations/v1`

| Método | URL |
| --- | --- |
| GET | `<base>/availability` |
| POST | `<base>/appointments` |
| GET | `<base>/appointments` |
| GET | `<base>/appointments/{id}` |
| POST | `<base>/appointments/{id}/cancel` |
| POST | `<base>/appointments/{id}/reschedule` |
| OPTIONS | qualquer rota acima (pré-voo CORS, sem chave) |

Prévia: mesma estrutura sob
`https://project--9cab2db5-e9b1-4209-b352-fc7a438da482-dev.lovable.app/api/public/integrations/v1`.
O atalho `/api/integrations/v1/...` existe e é idêntico, mas passa pelo login do
site publicado — o consumidor externo deve usar sempre `/api/public/...`.

### 8.4 Escopos por endpoint

| Endpoint | Escopo exigido |
| --- | --- |
| `GET /availability` | `availability:read` |
| `GET /appointments` | `appointments:read` |
| `GET /appointments/{id}` | `appointments:read` |
| `POST /appointments` | `appointments:write` |
| `POST /appointments/{id}/cancel` | `appointments:write` |
| `POST /appointments/{id}/reschedule` | `appointments:write` |

`appointments:write:all` não é exigido por nenhuma rota: ele apenas amplia o
alcance, permitindo mexer em agendamentos criados fora da própria chave. Sem
ele, a chave só alcança o que ela mesma criou.

### 8.5 Payloads

**`POST /appointments`** — obrigatórios: `id_externo`, `paciente_id`, `inicio`,
`fim`. Opcionais: `medico_id`, `especialidade_id`, `procedimento`,
`procedimentos` (até 20), `multi_exames_modo` (`laboratorio` | `imagem`),
`tipo_atendimento` (padrão `particular`), `observacoes`.

**`POST /appointments/{id}/reschedule`** — obrigatórios: `inicio`, `fim`.
Opcional: `medico_id`.

**`POST /appointments/{id}/cancel`** — corpo opcional; único campo: `motivo`.

**`GET /availability`** — tudo opcional: `medico_id`, `especialidade_id`,
`dias` (1–30, padrão 7), `limite` (1–200, padrão 60).

**`GET /appointments`** — tudo opcional: `id_externo`, `paciente_id`,
`medico_id`, `status`, `de`, `ate`, `limite` (1–200, padrão 50), `offset`.

Cabeçalho opcional em qualquer `POST`: `Idempotency-Key`.

### 8.6 Códigos HTTP e códigos de erro

| HTTP | Códigos |
| --- | --- |
| 200 | sucesso / replay (`replay: true`) |
| 201 | agendamento criado |
| 204 | pré-voo CORS (OPTIONS) |
| 400 | `invalid_json`, `request_failed` |
| 401 | `missing_api_key`, `invalid_api_key`, `api_key_revoked`, `api_key_expired` |
| 403 | `insufficient_scope` |
| 404 | `route_not_found`, `appointment_not_found` |
| 409 | `idempotency_key_reuse`, `request_in_progress` |
| 422 | `invalid_body`, `invalid_query`, `invalid_period`, `patient_not_found`, `business_rule_violation`, `appointment_rejected` |
| 429 | `rate_limit_exceeded` |
| 500 | `auth_lookup_failed`, `idempotency_failed`, `read_failed` |
| 502 | `availability_failed` |

### 8.7 Emitir e revogar chave no futuro

Rodando no banco como administrador/gestor da clínica (a chave em texto aparece
**uma única vez**; o banco guarda só o hash):

```sql
select public.integracao_criar_api_key(
  '<clinica_id>', 'Nome do sistema', 'origem-unica',
  array['availability:read','appointments:read','appointments:write'],
  null, 60, 1000
);

select public.integracao_revogar_api_key('<api_key_id>');
```

Revogar não apaga: marca `ativo = false` e a chave passa a responder `401
api_key_revoked`. Nenhuma chave nova foi emitida nesta revisão.

### 8.8 Consulta por `id_externo`

Dois caminhos, ambos restritos à clínica **e** à origem da própria chave:

```bash
curl -H "Authorization: Bearer $KEY" "$BASE/appointments/ext:OS-4711"
curl -H "Authorization: Bearer $KEY" "$BASE/appointments?id_externo=OS-4711"
```

### 8.9 A API não toca clínica, pagamento, caixa nem financeiro

- `clinica_id` nunca é aceito no corpo nem na query — vem sempre da chave.
- Criação força `data_pagamento: null`, `status: "agendado"`,
  `forma_pagamento_prevista: null` e `orcamento_id: null`.
- Não existe rota de pagamento, caixa, lançamento, orçamento ou repasse; não há
  escrita em nenhuma tabela financeira em todo o código da API.
- Marcar atendimento como "Realizado" continua sendo ato do funcionário.

### 8.10 Escopo de clínica sob service role

O handler roda com `supabaseAdmin` (sem RLS), então o escopo é verificado no
código, em toda operação:

- toda leitura de agendamento filtra `clinica_id = <clínica da chave>`;
- `assertEscopoClinica` / `assertEscopoRegistro` (`src/lib/agenda/ator.server.ts`)
  são chamados pelos núcleos e **lançam** (não retornam booleano) para que
  nenhum caller consiga ignorar o resultado por esquecimento;
- `assertEscopoRegistro` confere também a origem: uma chave não alcança o
  agendamento criado por outra integração, salvo com `appointments:write:all`;
- qualquer violação vira `404 appointment_not_found` — nunca vaza a existência
  de dado de outra clínica.

### 8.11 Especificação OpenAPI

`docs/api-integracao-agendamentos-v1.openapi.yaml` (OpenAPI 3.1), gerada a
partir do código atual, sem alterar nenhum endpoint.

**Status: v1 congelada.** Próximas mudanças só quando houver necessidade real do
futuro consumidor.
