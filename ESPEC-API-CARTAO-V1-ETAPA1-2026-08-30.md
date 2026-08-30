# Especificação técnica — API do Cartão, Etapa 1 (somente leitura)

Base: `https://patientpal-secure.lovable.app/api/public/integrations/v1`
Versão: v1 · Escrita em 30/08/2026 · **Desenho — nada foi implementado ainda.**

Consumidor previsto: PoliCardMed (`polycare-plus-hub`).
Todos os campos abaixo foram conferidos contra as colunas reais de produção.

---

## 0. O que é reaproveitado e o que é novo

**Já existe e funciona** (não precisa ser construído):
autenticação por chave, escopos, rate limit, idempotência, log de requisições,
CORS, envelope de resposta e formato de erro — em
[api.server.ts](src/lib/integracoes/api.server.ts).

**Novo nesta etapa:** 4 escopos, 6 rotas de leitura e um módulo
`src/lib/integracoes/cartao-v1.server.ts` no mesmo padrão do
[agendamentos-v1.server.ts](src/lib/integracoes/agendamentos-v1.server.ts).
O roteador atual só precisa ganhar os novos ramos `contracts`, `billing` e
`plans`.

---

## 1. Convenções (idênticas às da API de agenda)

### Autenticação

```
Authorization: Bearer hh_<8 hex>_<64 hex>
```
ou `X-API-Key: hh_...`. O banco guarda só o prefixo e o SHA-256 da chave.

Chave a criar em `integracao_api_keys`:

| Campo | Valor sugerido |
|---|---|
| `origem_integracao` | `policardmed` |
| `escopos` | `contracts:read`, `members:read`, `billing:read`, `plans:read` |
| `limite_por_minuto` | **60** |
| `limite_por_dia` | **5000** |

> Os limites da chave de homologação atual (30/min, 500/dia) **não servem**: a
> carga inicial são ~10 requisições de contratos + ~97 de parcelas, e com
> repetição por erro isso encosta no teto de 500.

### Envelope

Sucesso — sempre `{ "data": { ... } }`:

```json
{ "data": { "contracts": [ ... ], "total": 1882, "limite": 50, "offset": 0 } }
```

Erro — sempre `{ "error": { ... } }`:

```json
{
  "error": {
    "code": "insufficient_scope",
    "message": "Esta chave não tem o escopo 'billing:read'.",
    "request_id": "b1f0c7e2-..."
  }
}
```

Cabeçalhos de resposta: `content-type: application/json; charset=utf-8`,
`cache-control: no-store`, `x-request-id: <uuid>`.

### Códigos de erro usados nesta etapa

| HTTP | `code` | Quando |
|---:|---|---|
| 401 | `missing_api_key` / `invalid_api_key` | chave ausente, malformada, inativa ou expirada |
| 403 | `insufficient_scope` | a chave não tem o escopo da rota |
| 404 | `contract_not_found` | contrato inexistente ou de outra clínica |
| 404 | `route_not_found` | rota não existe na v1 |
| 422 | `invalid_query` | parâmetro inválido (traz `details` por campo) |
| 429 | `rate_limit_exceeded` | estourou minuto ou dia |
| 500 | `read_failed` | falha de leitura no banco |

### Paginação

`limite` (1–200, padrão 50) e `offset` (0–10000), como na agenda. **Para carga
inicial e sincronização, use `atualizado_desde` em vez de paginar fundo** — o
teto de offset 10.000 não cobre as 19.211 parcelas.

Toda listagem ordena por `updated_at` crescente e devolve `total` exato.

---

## 2. Escopos

| Escopo | Dá acesso a |
|---|---|
| `contracts:read` | contrato, valores, vigência, situação financeira consolidada |
| `members:read` | nome, CPF, nascimento e contato do titular e dos dependentes |
| `billing:read` | parcela a parcela, com vencimento, pagamento e situação |
| `plans:read` | os 8 convênios (produtos) para o de-para de planos |

Separar `contracts:read` de `members:read` é intencional: permite dar ao
satélite os números do contrato **sem** entregar dado pessoal de dependente,
caso a gestão queira começar assim.

---

## 3. Os campos calculados (o coração da Etapa 1)

O satélite **nunca** deve reimplementar essas regras. A API entrega prontas.

### 3.1 `situacao` de uma parcela

Espelha [cb-regras.ts](src/lib/cb-regras.ts) (`classificarParcela`), com
tolerância de **5 dias corridos** (`contrato_dias_tolerancia()` no banco, hoje = 5):

| Valor | Regra |
|---|---|
| `paga` | `status = 'pago'` |
| `cancelada` | `status = 'cancelado'` |
| `inadimplente` | em aberto e `vencimento < hoje − 5 dias` |
| `a_vencer` | em aberto e ainda dentro da tolerância, ou vencimento futuro |

Cada parcela cai em **exatamente um** balde — os quatro somam o total.

> **Normalização obrigatória:** existem hoje **30 parcelas com `status = 'aberto'`**
> (resíduo legado) além das 16.397 `pendente`. A API precisa tratar
> `pendente`, `aberto`, `atrasado`, `vencida` e `vencido` como "em aberto" —
> é a mesma lista que a função do banco já usa. O campo `situacao` esconde
> essa bagunça do satélite; o `status` cru também é devolvido, para auditoria.

### 3.2 `situacao_financeira` do contrato

| Valor | Significado |
|---|---|
| `em_dia` | nenhuma parcela vencida em aberto |
| `em_carencia` | há parcela vencida, mas **toda** dentro dos 5 dias — **o cartão funciona normalmente** |
| `inadimplente` | há parcela vencida há mais de 5 dias — o convênio é bloqueado no balcão |

> **Atenção da gestão:** `em_carencia` **não** é inadimplência. Se o satélite
> tratar os dois como devedor, vai cobrar e bloquear gente que o balcão atende
> normalmente.

> **Nota de implementação:** as funções `paciente_cartao_status` e
> `paciente_cartao_inadimplente` **não podem ser reutilizadas pela API**. Elas
> são `SECURITY DEFINER` e validam `auth.uid()` contra `clinica_memberships`;
> a API roda com service role, sem usuário logado, então elas levantariam
> "Sem acesso a esta clínica.". O cálculo precisa ser refeito em TypeScript
> reaproveitando `classificarParcela`, que já é a mesma régua.

---

## 4. Os endpoints

### 4.1 `GET /contracts` — lista de cartões

Escopo: `contracts:read`

| Parâmetro | Tipo | Padrão | Observação |
|---|---|---|---|
| `status` | `ativo` \| `cancelado` \| `renovado` | todos | valores reais em produção |
| `situacao_financeira` | `em_dia` \| `em_carencia` \| `inadimplente` | todos | filtro pelo campo calculado |
| `convenio_id` | uuid | — | |
| `paciente_id` | uuid | — | titular |
| `atualizado_desde` | ISO 8601 | — | **use isto para sincronizar** |
| `limite` | 1–200 | 50 | |
| `offset` | 0–10000 | 0 | |

Sempre aplicado, sem parâmetro: `clinica_id` da chave e `teste = false`.

```json
{
  "data": {
    "contracts": [
      {
        "id": "3f2a...-uuid",
        "numero": 20260653,
        "status": "ativo",
        "titular": {
          "paciente_id": "9c1b...-uuid",
          "nome": "MARIA APARECIDA DA SILVA"
        },
        "convenio": {
          "id": "77aa...-uuid",
          "nome": "Cartão Consulta Família",
          "modalidade": "cartao_consulta"
        },
        "vigencia": {
          "data_inicio": "2026-02-10",
          "data_fim": null,
          "dia_vencimento": 10
        },
        "valores": {
          "valor_mensal": 49.90,
          "taxa_adesao": 30.00,
          "num_parcelas": 12,
          "forma_pagamento": "dinheiro"
        },
        "situacao_financeira": "em_carencia",
        "resumo_financeiro": {
          "parcelas_total": 12,
          "parcelas_pagas": 6,
          "parcelas_a_vencer": 6,
          "parcelas_inadimplentes": 0,
          "parcelas_canceladas": 0,
          "total_em_aberto_vencido": 49.90,
          "dias_carencia_restantes": 3,
          "dias_tolerancia": 5
        },
        "dependentes_ativos": 2,
        "renovacao": {
          "numero_renovacoes": 1,
          "contrato_origem_id": "1a2b...-uuid",
          "renovado_em": "2026-02-10T11:04:00-03:00"
        },
        "flags": {
          "tabela_legada": true,
          "sem_carencia": false,
          "titular_apenas_financeiro": false
        },
        "created_at": "2026-02-10T11:02:33-03:00",
        "updated_at": "2026-08-28T09:14:07-03:00"
      }
    ],
    "total": 1882,
    "limite": 50,
    "offset": 0
  }
}
```

Sobre `flags.tabela_legada`: **965 dos 1.991 contratos** vêm da tabela de preço
antiga. O satélite não deve inferir preço a partir do valor do convênio nesses
casos — o `valor_mensal` do contrato é que vale.

### 4.2 `GET /contracts/{id}` — um cartão

Escopo: `contracts:read` (soma `members:read` se a chave tiver, incluindo o
bloco `membros` embutido).

Aceita o UUID do contrato ou `ext:<id_externo>` — mesmo padrão da agenda, útil
depois que o satélite gravar a referência dele.

Devolve o objeto de 4.1, mais:

```json
{
  "data": {
    "...": "todos os campos de /contracts",
    "membros": { "titular": { }, "dependentes": [ ] },
    "observacao_publica": null
  }
}
```

404 `contract_not_found` quando não existe **ou** é de outra clínica — de
propósito, para não confirmar a existência de contrato alheio.

### 4.3 `GET /contracts/{id}/members` — titular e dependentes

Escopo: `members:read`

| Parâmetro | Padrão | |
|---|---|---|
| `ativos` | `true` | `false` traz também os já excluídos |

```json
{
  "data": {
    "contrato_id": "3f2a...-uuid",
    "titular": {
      "paciente_id": "9c1b...-uuid",
      "nome": "MARIA APARECIDA DA SILVA",
      "cpf": "12345678901",
      "data_nascimento": "1978-03-22",
      "telefone": "88999998888",
      "apenas_financeiro": false
    },
    "dependentes": [
      {
        "id": "5d4c...-uuid",
        "paciente_id": "8e7f...-uuid",
        "nome": "JOAO PEDRO DA SILVA",
        "cpf": null,
        "data_nascimento": "2011-07-05",
        "parentesco": "filho",
        "tipo": "dependente",
        "incluido_em": "2026-02-10",
        "excluido_em": null,
        "ativo": true
      }
    ],
    "total_dependentes_ativos": 2,
    "max_dependentes": 3
  }
}
```

Regras de formato:
- `cpf` sai **só com dígitos** (sem ponto e traço) ou `null`. Nunca inventar.
- `titular.apenas_financeiro = true` significa que o titular **paga mas não é
  atendido** pelo cartão — o satélite não deve contá-lo como vida coberta.
- `tipo` hoje é sempre `dependente` em produção (723 registros); `agregado`
  existe no modelo mas não está em uso.

### 4.4 `GET /contracts/{id}/installments` — parcelas de um cartão

Escopo: `billing:read`

```json
{
  "data": {
    "contrato_id": "3f2a...-uuid",
    "installments": [
      {
        "id": "aa11...-uuid",
        "numero_parcela": 7,
        "vencimento": "2026-08-10",
        "valor": 49.90,
        "taxa_adesao": 0.00,
        "situacao": "inadimplente",
        "status": "pendente",
        "dias_atraso": 20,
        "pago_em": null,
        "valor_pago": null,
        "forma_pagamento": null,
        "multa": 0.00,
        "juros": 0.00,
        "updated_at": "2026-08-10T00:00:00-03:00"
      }
    ],
    "total": 12,
    "dias_tolerancia": 5
  }
}
```

`dias_atraso` é `0` quando não está vencida. `taxa_adesao` na parcela é a
cobrança única da emissão — vem separada do `valor` de propósito, para o
satélite não somar adesão como mensalidade recorrente.

### 4.5 `GET /billing/installments` — parcelas por período

Escopo: `billing:read`. É o endpoint do **relatório de pagamento** e da carga
inicial.

| Parâmetro | Tipo | Observação |
|---|---|---|
| `vencimento_de` / `vencimento_ate` | data | filtra por vencimento |
| `pago_de` / `pago_ate` | data | filtra por data de pagamento |
| `situacao` | `paga` \| `a_vencer` \| `inadimplente` \| `cancelada` | aceita lista separada por vírgula |
| `contrato_id` | uuid | |
| `atualizado_desde` | ISO 8601 | sincronização incremental |
| `limite` / `offset` | | 1–200 / 0–10000 |

Cada item repete o objeto de 4.4 acrescido de `contrato_id`, `contrato_numero`
e `titular_nome` (para o relatório não precisar de segunda chamada), mais um
bloco de totais:

```json
{
  "data": {
    "installments": [ ],
    "totais": {
      "quantidade": 412,
      "valor_total": 20558.80,
      "por_situacao": {
        "paga":        { "quantidade": 310, "valor": 15469.00 },
        "a_vencer":    { "quantidade":  80, "valor":  3992.00 },
        "inadimplente":{ "quantidade":  22, "valor":  1097.80 },
        "cancelada":   { "quantidade":   0, "valor":     0.00 }
      }
    },
    "total": 412, "limite": 200, "offset": 0
  }
}
```

### 4.6 `GET /plans` — os convênios

Escopo: `plans:read`. Sem paginação (são 8).

```json
{
  "data": {
    "plans": [
      {
        "id": "77aa...-uuid",
        "nome": "Cartão Consulta Família",
        "modalidade": "cartao_consulta",
        "ativo": true,
        "valor_mensal": 49.90,
        "taxa_adesao": 30.00,
        "taxa_inclusao_dependente": 10.00,
        "num_parcelas": 12,
        "max_dependentes": 3,
        "fidelidade_meses": 12,
        "vigencia_meses": 12,
        "adesao_no_ato": true,
        "contratos_ativos": 431
      }
    ],
    "total": 8
  }
}
```

Serve para o de-para com `plano_catalogo` / `plans` do satélite, que hoje tem
**10 planos que não correspondem** aos 8 reais.

---

## 5. O que a API deliberadamente NÃO devolve

Decisão de segurança, não omissão:

| Campo / dado | Por quê |
|---|---|
| `token_publico` do contrato | é a chave de assinatura pública — vazar dá acesso ao contrato a qualquer um |
| `assinatura_svg`, `assinatura_ip`, `assinado_em` | assinatura e rastro pessoal; o satélite não precisa |
| `observacoes` do contrato e da parcela | campo livre digitado na recepção; pode conter dado clínico |
| `criado_por`, `sem_carencia_por` | identifica funcionário |
| Qualquer agendamento, procedimento, exame, médico ou prontuário | **dado de saúde não sai nesta API.** A Etapa 1 é financeira e cadastral |
| `cb_convenio_regras` (as 244 regras de preço) | o satélite não recalcula preço; se um dia precisar exibir benefícios, sai texto pronto, não a regra |

Toda requisição já fica registrada em `integracao_requisicoes` (rota, status,
duração, IP, request_id) — auditoria de quem leu o quê.

---

## 6. Como o satélite sincroniza (sem webhook ainda)

1. **Carga inicial**
   `GET /plans` → `GET /contracts?limite=200` paginando → para cada contrato,
   `GET /contracts/{id}/members` → `GET /billing/installments` por faixa de
   vencimento. Guardar **sempre** o `id` (UUID) de contrato, paciente e parcela
   como referência externa.
2. **Incremental** (a cada 15 min, por exemplo)
   `GET /contracts?atualizado_desde=<último updated_at recebido>` e
   `GET /billing/installments?atualizado_desde=...`.
   Guardar o maior `updated_at` da resposta como marca d'água.
3. Na Etapa 2 isso vira webhook de saída e o polling cai para rede de segurança.

**A ligação é sempre por UUID, nunca por CPF** — decisão já aprovada. Lembrando
o motivo: 942 dos 1.882 titulares ativos (50%) não têm CPF válido, mais 109
dependentes, e há 14 CPFs duplicados na base.

---

## 7. Definição de pronto

- [x] 4 escopos acrescentados a `ESCOPOS_CONHECIDOS`
- [x] `cartao-v1.server.ts` criado, sem nenhum `INSERT`/`UPDATE`
- [x] `situacao` e `situacao_financeira` calculados reaproveitando `classificarParcela`
- [x] Status legado `aberto` normalizado junto com `pendente`
- [x] Contratos com `teste = true` excluídos de todas as respostas
- [x] Campos da seção 5 ausentes de toda resposta
- [x] Conferência dos números contra os dados de produção (seção 8)
- [x] **Chave `policardmed` criada com 60/min e 5.000/dia**
- [x] Publicado e conferido no site publicado (seção 9)


Nada nesta etapa escreve no banco. A primeira escrita é a Etapa 3, e só depois
de a leitura estar estável.

---

## 8. Conferência contra produção — 30/08/2026

A mesma régua da API foi rodada em SQL sobre os dados reais, para servir de
linha de base depois que a API subir.

**Contratos ativos — 1.882**

| Situação financeira | Contratos |
|---|---:|
| `inadimplente` | 1.169 |
| `em_carencia` | 19 |
| `em_dia` | 694 |
| **soma** | **1.882** ✓ |

**Parcelas — 19.211**

| `situacao` | Parcelas |
|---|---:|
| `paga` | 1.294 |
| `a_vencer` | 14.325 |
| `inadimplente` | 2.102 |
| `cancelada` | 1.490 |
| **soma** | **19.211** ✓ |

Os dois fechamentos batem exatamente com o total do banco — os quatro baldes
somam sem sobra nem repetição, que é a propriedade de que os relatórios do
outro lado dependem.

> **Leitura de gestão:** 1.169 dos 1.882 contratos ativos (62%) estão
> inadimplentes pela régua dos 5 dias, e há 16.397 parcelas em aberto. Isso é o
> retrato da cobrança do cartão hoje, não um defeito da API — mas é bom saber
> antes de o satélite ligar régua de bloqueio automático em cima desse número.
> Vale conferir se as parcelas antigas em aberto são dívida real ou resíduo da
> importação.

**Testes automatizados:** 16 casos em
[cartao-v1.test.ts](src/lib/integracoes/cartao-v1.test.ts), cobrindo a
normalização do status `aberto`, a virada da tolerância no 5º/6º dia, carência
que não vira dívida, e a soma dos quatro baldes. Suíte completa do projeto:
422 testes, 0 falhas. `tsc --noEmit`: 0 erros.

---

## 9. Teste de ponta a ponta em produção — 30/08/2026

Rodado contra `https://patientpal-secure.lovable.app`, com a chave
`policardmed`, depois do Publish do commit `56803863`.

### Segurança

| Cenário | Resultado |
|---|---|
| Sem chave | 401 `missing_api_key` ✓ |
| Chave inventada | 401 `invalid_api_key` ✓ |
| Rota de outro escopo (`/appointments`) | 403 `insufficient_scope` ✓ |
| Tentativa de escrita (`POST /appointments`) | 403 `insufficient_scope` ✓ |
| Rota inexistente | 404 `route_not_found` ✓ |
| Campos proibidos da seção 5 no corpo | todos ausentes ✓ |

A chave só lê o cartão: não alcança agenda nem nenhuma escrita.

### Números — API contra a linha de base do banco

| Consulta | Esperado | API |
|---|---:|---:|
| Contratos ativos | 1.882 | **1.882** ✓ |
| … inadimplentes | 1.169 | **1.169** ✓ |
| … em carência | 19 | **19** ✓ |
| … em dia | 694 | **694** ✓ |
| Contratos (todos os status) | 1.991 | **1.991** ✓ |
| Parcelas — paga | 1.294 | **1.294** ✓ |
| Parcelas — a vencer | 14.325 | **14.325** ✓ |
| Parcelas — inadimplente | 2.102 | **2.102** ✓ |
| Parcelas — cancelada | 1.490 | **1.490** ✓ |
| **Total de parcelas** | 19.211 | **19.211** ✓ |

Valores: R$ 204.323,50 pagas · R$ 1.753.843,45 a vencer ·
R$ 237.073,45 inadimplentes · R$ 220.585,00 canceladas.

### Casos concretos conferidos

**Carência funcionando** — contrato 20260132 (CARTÃO CONSULTA + SEGUROS),
parcela vencida em 28/08: `situacao_financeira = em_carencia`,
`dias_carencia_restantes = 3`, `total_em_aberto_vencido = 0` e
`total_em_carencia = 120`. É exatamente o comportamento do balcão: parcela
vencida há 2 dias, cartão funcionando.

**Status legado normalizado** — contrato com 11 parcelas gravadas como
`aberto`: a vencida em 10/08 saiu `inadimplente` (20 dias de atraso) e as 10
futuras saíram `a_vencer`. Sem a normalização, o satélite receberia um status
que não sabe interpretar.

### Desempenho

| Chamada | Tempo |
|---|---:|
| `/billing/installments` sem filtro (19.211 parcelas) | 8,6 s |
| `/billing/installments` filtrado por mês | 1,7 s |
| `/contracts` com filtro de situação | ~1,8 s |
| `/contracts/{id}` e sub-recursos | 0,6–0,9 s |

> **Orientação ao satélite:** varrer a base inteira leva ~8,6 s e só deve
> acontecer na carga inicial. O uso normal é filtrar por período ou usar
> `atualizado_desde`, que fica abaixo de 2 s.

Auditoria: as 16 chamadas ficaram registradas em `integracao_requisicoes`,
com rota, status, duração e IP.

### Um achado dos dados, para a Etapa 2

Existem **58 parcelas com `numero_parcela` menor ou igual a zero** (−5 a 0),
todas de R$ 20 a R$ 30: é a **taxa de adesão lançada como parcela**, não no
campo `taxa_adesao`. Duas consequências para quem consumir a API:

1. não assumir que a numeração das parcelas começa em 1;
2. não contar essas linhas como mensalidade recorrente — a adesão é cobrada
   uma única vez, na emissão do cartão.
