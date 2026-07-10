
# Relatório de Auditoria Técnica — ClinicaOS

**Modo:** somente leitura. Nenhum arquivo, migration, política ou secret foi alterado.
**Data:** 10/07/2026.

---

## 1. Cobertura da análise

| Área | Cobertura | Como foi lido |
|---|---|---|
| Estrutura de código (rotas, componentes, libs) | Total | listagem completa de `src/` e métricas de LOC |
| TypeScript (any, console.log, TODO) | Total | ripgrep no repositório |
| Server functions (`createServerFn`) | Total | inventário e verificação de middleware |
| Backend Supabase (RLS, policies, definers) | Parcial via metadados | `supabase--linter`, `supabase--read_query` em `pg_tables`/`pg_policies`/`pg_proc`, `pg_stat_user_tables`, `pg_stat_statements` |
| Regras de negócio (agenda, financeiro, cartão-benefícios) | Parcial | leitura de docs em `docs/` e memórias, sem abrir arquivo-a-arquivo cada regra |
| Integrações (WhatsApp, NFS-e, IA) | Parcial | leitura dos módulos `*.functions.ts` / `whatsapp.server.ts` no nível de arquivo, não linha-a-linha |
| Edge Functions | N/A — projeto não usa (`supabase/functions/` vazio) |
| Segredos concretos | Não lidos por política — apenas nomes de variáveis |

Onde não foi possível concluir, o relatório usa "Não foi possível confirmar com segurança" ou "Possível regra de negócio — validar com a equipe da clínica".

---

## 2. Resumo executivo

O ClinicaOS é um monolito React/TanStack Start + Supabase de porte médio-grande: **133 tabelas em `public`**, **404 políticas RLS**, **72 funções SECURITY DEFINER**, **337 migrations**, ~99k linhas de código-fonte, 15 módulos `createServerFn` protegidos por `requireSupabaseAuth`. A base de segurança é sólida: **0 tabelas em `public` sem RLS habilitada**, **0 funções SECURITY DEFINER sem `search_path` fixado** e **0 usos detectados de `any` / `console.log` no `src/`**.

Os problemas mais relevantes estão em **três eixos**:

1. **Performance de leitura sob carga real** — o teste de carga anterior e o `pg_stat_statements` mostram queries de agenda/pacientes com médias de 3–7s (ex.: `agendamentos ORDER BY inicio DESC` sem filtro, `pacientes` com `ilike` e sem trigram, `procedimentos` retornando lista completa por clínica). Já é hoje o maior risco operacional em picos.
2. **Superfície SECURITY DEFINER exposta** — o linter aponta ~70 funções `SECURITY DEFINER` executáveis por `anon`/`authenticated` na API pública. Não significa que estejam vazando dados (a maioria checa `auth.uid()` internamente), mas cada uma é um ponto de contrato de segurança que precisa ser revisado uma-a-uma.
3. **Dívida técnica concentrada em rotas gigantes** — `app.agenda.tsx` (5.702 linhas), `app.financeiro.atendimentos.tsx` (2.612), `contratos-page.tsx` (2.428), `app.caixa.tsx` (2.038): manutenção cara, alto risco de regressão a cada edição, difícil testar.

Não foram encontrados: tabelas sem RLS, secrets expostos no repositório, `service_role` em código cliente, `console.log` residual, ou uso de `any`.

---

## 3. Visão geral da saúde do sistema

| Métrica | Valor | Leitura |
|---|---|---|
| Tabelas em `public` | 133 | Domínio muito amplo — plataforma multiclínica confirmada |
| Tabelas sem RLS | **0** | Excelente |
| Políticas RLS | 404 | ~3 por tabela em média |
| Funções `SECURITY DEFINER` | 72 | Uso intensivo — precisa auditoria caso a caso |
| Definers sem `search_path` fixado | **0** | Excelente |
| Migrations acumuladas | 337 | Alto — sinal de evolução rápida, mas dificulta bootstrap novo |
| `createServerFn` sem `requireSupabaseAuth` | **0** | Excelente — todos os 15 módulos protegidos |
| Usos de `supabaseAdmin` (service-role) | 2 módulos (`whatsapp.server.ts`, `equipe.functions.ts`) | Escopo estreito, dentro da regra |
| Arquivos > 1.500 linhas | 9 | Dívida técnica alta |
| Ocorrências de `any` / `console.log` | 0 detectado | Excelente |
| Edge Functions | 0 | OK, alinhado ao padrão TanStack |

---

## 4. Matriz de problemas por prioridade

### CRÍTICO

**C-1. Query `agendamentos ORDER BY inicio DESC` sem filtro obrigatório** — `pg_stat_statements`: 230 chamadas, média 4.958 ms, máx 7.979 ms, total 1.140.416 ms.
- Evidência: `supabase--slow_queries` top #1.
- Impacto: em picos, trava a agenda para todas as clínicas simultaneamente; já reproduzido no teste de carga (100–500 VUs).
- Causa raiz provável: consumidor PostgREST envia SELECT sem `clinica_id` nem faixa de `inicio` (a variante "com filtro" do frontend real roda em 51 ms).
- Recomendação: identificar o call-site, exigir filtro no cliente ou aplicar policy RLS que force `clinica_id = ANY(clinicas_do_usuario())`. **Validar com a equipe**: possível regra de negócio — validar com a equipe da clínica se algum relatório legado depende dessa leitura ampla.
- Risco da correção: médio — pode quebrar relatório administrativo se existir.

**C-2. Auditoria pendente das ~70 funções SECURITY DEFINER expostas a `anon`/`authenticated`**
- Evidência: `supabase--linter` regras `0028` (anon executable) e `0029` (authenticated executable), itens 9–48 e 49–~90.
- Impacto potencial: cada função definer é um bypass de RLS. Sem inspeção do corpo de cada uma, **não foi possível confirmar com segurança** que todas validam `auth.uid()` / clínica antes de operar.
- Recomendação (etapa futura): inventariar as 72 definers, classificar (segura vs precisa gate), e revogar `EXECUTE FROM anon` onde não houver caso de uso público.
- Risco da correção: alto — revogações erradas quebram fluxos legítimos (login, checkin público, LP).

### ALTO

**A-1. Busca de pacientes lenta (`ilike` sem índice trigram)** — 432 chamadas, média 1.878 ms, total 811.657 ms. Variante em `cpf_digits ilike` tem média 5.465 ms.
- Evidência: `pg_stat_statements` #2 e #10; `pacientes` acumula 51.620 seq scans em 242k linhas.
- Recomendação: extensão `pg_trgm` + índices `gin (nome gin_trgm_ops)`, `gin (cpf_digits gin_trgm_ops)`.
- Risco: baixo — apenas leitura, ganho grande.

**A-2. Listas de procedimentos e médicos sem cache/paginação** — 2.841/2.390/2.399 chamadas retornando tudo por clínica; média 75–110 ms mas volume alto (soma > 12 min).
- Recomendação: usar `React Query` com `staleTime` alto para tabelas de referência, ou RPC dedicada leve.

**A-3. Rotas gigantes concentram risco**
- `src/routes/_authenticated/app.agenda.tsx` — 5.702 linhas.
- `src/routes/_authenticated/app.financeiro.atendimentos.tsx` — 2.612.
- `src/components/pages/contratos-page.tsx` — 2.428.
- `src/routes/_authenticated/app.caixa.tsx` — 2.038.
- Impacto: qualquer alteração toca contexto amplo, aumenta chance de regressão e dificulta code review.
- Recomendação: extrair componentes de coluna/dialog/section para arquivos próprios; segregar hooks de dados em `use-*` hooks.

**A-4. Extensões instaladas em `public`** — 4 avisos WARN do linter (`0014_extension_in_public`).
- Impacto: risco de conflito de nomes e privilégios; boa prática Supabase é `extensions` schema.
- Risco da correção: **alto** — mover extensão já em uso pode quebrar funções/policies que a referenciam por nome curto. Não fazer sem plano de rollback.

### MÉDIO

**M-1. 337 migrations acumuladas** — dificulta reset de ambiente. Sinal de evolução ativa, não bug. Recomendação: consolidar snapshot base e continuar migrations incrementais.

**M-2. `supabaseAdmin` (service-role) em `whatsapp.server.ts` e `equipe.functions.ts`**
- Evidência: 15 usos, todos em `.server.ts` ou `.functions.ts`. Padrão correto do TanStack.
- Ponto de atenção: `equipe.functions.ts` cria usuários via `auth.admin.createUser` e faz `upsert` em `clinica_memberships`. **Não foi possível confirmar com segurança** que a checagem `can_manage_clinica` cobre 100% dos caminhos — precisa leitura linha-a-linha. Possível regra de negócio — validar com a equipe da clínica.

**M-3. Ausência de testes automatizados detectáveis** — não há `vitest`/`playwright` config visível no repo; validação atual é manual (12 casos documentados em `docs/agenda/criar-agendamento-shared.md`). Risco cresce com o volume de código.

**M-4. `pagamentos` tem 0 tuplas vivas em produção mas 20 colunas + 4 policies**
- `pg_stat_user_tables`: `n_live_tup=0` em `pagamentos`. Tabela paralela a `fin_lancamentos` (907k linhas)?
- Possível regra de negócio — validar com a equipe se `pagamentos` é legada ou reserva futura.

### BAIXO

**B-1. `src/routes/diagnostico.tsx`** — página pública de diagnóstico expõe URL do Supabase, e-mail do usuário logado (mascarado), contagem de clínicas e cartões. Nada crítico, mas remover/proteger em produção é higiene.

**B-2. `.env` versionado com chaves `VITE_*`** — as chaves são publishable/anon (safe by design), mas convém garantir que o arquivo não recebe secrets por engano no futuro.

**B-3. 4 tabelas com RLS habilitada e nenhuma policy** — INFO do linter (`0008_rls_enabled_no_policy`). Efetivamente locked (nenhum acesso). **Não foi possível confirmar** quais são a partir apenas do linter agregado; provavelmente tabelas de importação/staging (`_tmp_import_pacientes`, `_mj_*`).

---

## 5. Análise detalhada de riscos

### 5.1 Segurança e LGPD
- **Bom:** 0 tabelas sem RLS, 0 definers sem search_path, 404 policies ativas, todos os `createServerFn` protegidos por `requireSupabaseAuth`, `service_role` restrito a `.server.ts`. Rota `_authenticated` gatekeeper único e correto.
- **Risco residual (Alto):** superfície SECURITY DEFINER (C-2). Uma única função com bypass mal escrito derruba a garantia multi-tenant.
- **LGPD:** existem tabelas `lgpd_consentimentos` e `lgpd_solicitacoes` — sinal positivo. **Não foi possível confirmar com segurança** se o fluxo de exclusão/anonimização está implementado ponta-a-ponta.
- **Auditoria:** `audit_log` presente e citado como padrão em `mem/preferences/arquitetura-plataforma.md`. Precisa verificar cobertura real (não foi feito nesta auditoria).

### 5.2 Financeiro e integridade clínica
- **Fonte única de criação de agendamento** (`docs/agenda/criar-agendamento-shared.md`) — arquitetura correta.
- **Split e repasse médico** — `pagamento_splits`, `procedimento_split_regras`, `regras_rateio` presentes; **não foi possível confirmar com segurança** que os cálculos de repasse têm testes automatizados.
- **Estornos** — módulo `estorno_solicitacoes` + `EstornosBell` presentes; parecer arquitetural adequado.
- **Alerta:** tabela `pagamentos` sem uso (0 rows) + `fin_lancamentos` (907k rows) — possível duplicidade/legacy. Possível regra de negócio — validar com a equipe.

### 5.3 Performance e arquitetura
- Ranking claro dos gargalos: **agendamentos sem filtro > pacientes ilike > listas de referência sem cache**.
- `_do_fix_phones_prontuarios_mj` e `_do_merge_pacientes_dup_mj` aparecem entre as mais lentas: são scripts de migração/dedup pontuais — impacto passado, não recorrente.
- `n_live_tup`: `fin_lancamentos` 907k, `pacientes` 242k, `agendamentos` 30k. Volumes ainda modestos; a lentidão vem da falta de índices em predicados frequentes, não do tamanho absoluto.

### 5.4 Integrações e resiliência
- WhatsApp e NFS-e implementados como `createServerFn` — bom. Timeouts/retentativas: **não foi possível confirmar com segurança** sem leitura linha-a-linha dos handlers.
- IA (Nina, atendimento-ai, exames-ia) via `createServerFn` — correto.
- Webhook FocusNFe em `src/routes/api/public/focusnfe.webhook.ts` — precisa confirmar verificação de assinatura HMAC (não lido nesta auditoria).

---

## 6. Inventário de revisão

**Rotas / componentes prioritários para refactor**
- `src/routes/_authenticated/app.agenda.tsx` (5.702)
- `src/routes/_authenticated/app.financeiro.atendimentos.tsx` (2.612)
- `src/components/pages/contratos-page.tsx` (2.428)
- `src/routes/_authenticated/app.caixa.tsx` (2.038)
- `src/components/medicos/MedicoFormDialog.tsx` (1.651)
- `src/routes/_authenticated/app.procedimentos.tsx` (1.555)
- `src/components/clientes/cliente-form.tsx` (1.484)
- `src/routes/_authenticated/app.nina.tsx` (1.440)

**Server functions com uso de service-role a auditar**
- `src/lib/equipe.functions.ts`
- `src/lib/whatsapp.server.ts` / `src/lib/whatsapp.functions.ts`

**Tabelas com queries mais custosas**
- `agendamentos`, `pacientes`, `procedimentos`, `medico_procedimentos`, `medico_convenios`, `fin_lancamentos`

**Rota pública sensível**
- `src/routes/diagnostico.tsx`
- `src/routes/api/public/focusnfe.webhook.ts` (verificar HMAC)
- `src/routes/api/public/hooks/backup-diario.ts` (verificar secret)
- `src/routes/api/public/whatsapp.$clinicaId.ts` (verificar autorização)

**Regras do linter a tratar (etapa futura)**
- `0028` / `0029` — 72 funções `SECURITY DEFINER` expostas.
- `0014` — 4 extensões em `public`.
- `0008` — 4 tabelas com RLS sem policy.

---

## 7. Perguntas para a equipe da clínica

1. A query "todos os agendamentos ordenados por data" sem filtro de clínica é usada por algum relatório administrativo intencional? Se não, podemos bloquear.
2. A tabela `pagamentos` (vazia hoje) está prevista para uso futuro ou é legada e pode ser deprecada?
3. Existe rotina periódica que precisa executar SECURITY DEFINER como `anon`? Ou toda função definer deveria exigir usuário logado?
4. Fluxos LGPD (direito ao esquecimento, portabilidade) já foram testados ponta-a-ponta em produção com pacientes reais?
5. Cálculo de repasse médico e comissão têm caso-a-caso conhecido de divergência entre `fin_lancamentos` e o valor "sentido" pela clínica? Isso guia a prioridade de reconciliação.

---

## 8. Plano de correção sugerido (etapas futuras — aguardando aprovação)

Ordem sugerida, cada etapa independente e reversível:

1. **Índices e paginação** (Alto ganho, baixo risco) — resolver A-1 e A-2 com trigram + índices compostos.
2. **Bloquear query sem filtro de agendamentos** (C-1) — depende da resposta da pergunta #1 acima.
3. **Inventário e triagem das 72 definers** (C-2) — apenas leitura, gera um relatório derivado.
4. **Refactor incremental de `app.agenda.tsx`** (A-3) — extrair 3–5 subcomponentes/hooks sem mudar comportamento; validar com os 12 testes já documentados.
5. **Auditoria de `equipe.functions.ts` / webhooks públicos** (M-2, inventário).
6. **Cobertura de testes automatizados** para `criar-agendamento`, repasse e estorno.
7. **Extensões em `public` → `extensions`** (A-4) — só depois dos passos acima, com plano de rollback.

Nenhuma alteração de código, migration, RLS ou secret foi feita nesta auditoria. Aguardando comando para avançar em qualquer uma das etapas acima.
