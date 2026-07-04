# Regras de Negócio — Sistema Clínico (ClinicaOS)

> Documento vivo. Cada rodada de auditoria acrescenta módulos. Nada aqui é
> inventado: o que não estiver 100% no código está marcado como **PRECISA
> VALIDAR** e listado nas seções finais.

**Status desta versão:** Esqueleto + Rodada 1 (Fundação: Multi-clínica,
Permissões, Autenticação). Rodadas 2 a 16 pendentes — ver
`docs/regras-negocio.CHANGELOG.md`.

> ⚠️ **Achados críticos nesta rodada** — auditoria SQL profunda revelou 6
> conflitos de segurança/consistência (§5.4 e §5.6). Recomendo tratar antes
> de qualquer nova feature em Recepção ou Caixa.

---

## Sumário

1. [Visão geral do sistema](#1-visão-geral-do-sistema)
2. [Convenções deste documento](#2-convenções-deste-documento)
3. [Índice de módulos](#3-índice-de-módulos)
4. Fichas de módulo — Rodada 1
   - [4.1 Multi-clínica & Membership](#41-módulo-multi-clínica--membership)
   - [4.2 Permissões & Perfis de acesso](#42-módulo-permissões--perfis-de-acesso)
   - [4.3 Autenticação & Sessão](#43-módulo-autenticação--sessão)
5. [Seções de fechamento](#5-seções-de-fechamento)
   - Regras confirmadas pelo código
   - Regras inferidas do histórico de prompts
   - Regras incompletas
   - Regras conflitantes
   - Regras a validar com a clínica

---

## 1. Visão geral do sistema

**ClinicaOS** é um sistema **SaaS multi-clínica** para gestão operacional e
clínica de consultórios, ambulatórios e clínicas populares. O front-end é uma
SPA React 19 sobre TanStack Start (SSR opcional). O back-end é Lovable Cloud
(Postgres com RLS + Auth + Storage) mais funções TanStack `createServerFn` no
Worker Cloudflare para lógica sensível (NFS-e, WhatsApp, IA, impressão de guia
de repasse).

### 1.1 Objetivo do sistema

Substituir a colcha de retalhos "agenda + planilha + software fiscal + WhatsApp
comum" por uma única plataforma que cobre **da recepção ao repasse do médico**,
incluindo faturamento (NFS-e, boletos), cartão de benefícios próprio e
ferramentas de gestão de pessoas.

### 1.2 Áreas atendidas (identificadas no código)

| Área                | Evidência                                                                    |
| ------------------- | ---------------------------------------------------------------------------- |
| Recepção            | `app.recepcao.tsx`, `app.agenda.tsx`, `app.agenda.express.tsx`, `app.checkin.tsx`, `app.painel.tsx`, `app.fluxo.tsx`, `totem.tsx` |
| Cadastro/CRM        | `app.clientes.*`, `app.crm.tsx`, `contratos`, `cb_convenios`                 |
| Financeiro/Caixa    | `app.caixa.tsx`, `app.financeiro.*`, `app.boletos.tsx`, `app.nfse.*`         |
| Clínico             | `app.prontuarios.tsx`, `app.anamneses.tsx`, `app.odontologia.tsx`, `app.exames-resultados.tsx`, `app.atendimento-ia.*` |
| Enfermagem          | `app.triagem-enfermagem.tsx`, `app.alertas-enfermagem.tsx`, `app.enfermagem-recursos.tsx` |
| Cartão benefícios   | `app.cartao-beneficios.*` (convênios, contratos, dependentes, mensalidades)  |
| Marketing           | `app.mkt-*`, `app.campanhas.tsx`, `app.crm.tsx`                              |
| Gestão de pessoas   | `app.hr-*`, `app.treinamentos.tsx`, `app.lms-admin.tsx`, `app.cargos.tsx`    |
| Cadastros mestres   | `app.medicos.tsx`, `app.especialidades.tsx`, `app.procedimentos.tsx`, `app.planos.tsx`, `app.unidades.tsx`, `app.clinicas.tsx`, `app.tipos-servico.tsx` |
| Comunicação         | `app.chat.tsx`, `app.nina.tsx`, `atend_*` tables, `whatsapp.functions.ts`     |
| Compliance/Auditoria| `app.auditoria.tsx`, `app.lgpd.tsx`, `audit_log`, `fn_audit_trigger`         |

### 1.3 Problemas que o sistema tenta resolver

> Inferido do histórico de prompts (P2/P3/P4) e das RPCs existentes.
> **PRECISA VALIDAR** — ver seção 5.

- **Fragmentação de dados do paciente** entre clínicas irmãs (`buscar_pacientes_global`, `paciente_resumo_recepcao`).
- **Tempo de agendamento** na recepção (P4-AGENDAMENTO-FLUXO, Modo Recepção Turbo).
- **Bloqueio silencioso na NFS-e** por falta de dados do paciente (`paciente_pendencias_cadastro`).
- **Duplicidade de cadastro** por CPF/telefone (`listar_duplicados_pacientes`, `idx_pacientes_clinica_cpf_unique`).
- **Repasse médico** com regras diferentes por convênio, cartão consulta e particular (`gerar_repasse_laudador`, `print-gr.ts`, memória `repasse-cartao-consulta`).
- **Cartão de benefícios próprio** com regras de carência, gratuidade e limites por período (`cb_convenio_regras`, `cb-regras.ts`).

---

## 2. Convenções deste documento

### 2.1 Ficha de módulo (13 seções fixas)

Cada módulo é documentado exatamente nesta ordem: **Objetivo · Usuários ·
Telas · Tabelas · Campos · Fluxo principal · Regras · Validações · Status ·
Permissões · Exceções · Integrações · Pontos incompletos**.

### 2.2 CSV — `docs/regras-negocio.csv`

Colunas: `id, modulo, regra, quando_aplicada, entrada, resultado, tela,
tabela_campo, fonte, confianca, duvida_para_clinica`.

| Campo         | Valores válidos                                                 |
| ------------- | --------------------------------------------------------------- |
| `id`          | `MOD-000` (`FUN` = Fundação, `AGE` = Agenda, `CAI` = Caixa, ...) |
| `fonte`       | `codigo` \| `banco` \| `migration` \| `prompt` \| `mem` \| `inferencia` |
| `confianca`   | `alto` (código + banco concordam) \| `medio` (só uma fonte) \| `baixo` (só prompt/inferência) |

### 2.3 Marcadores de status

| Ícone | Significado                                                         |
| ----- | ------------------------------------------------------------------- |
| ✅    | Confirmada no código (SQL/migration/componente)                     |
| 🟡    | Inferida do histórico de prompts, sem código atual que a implemente |
| 🟠    | Incompleta — código parcial, fluxo/UI não fecha                     |
| 🔴    | Conflitante — código diz A, prompt/memória diz B                    |
| ❓    | Precisa validar com a equipe da clínica                             |

---

## 3. Índice de módulos

Rodadas 2 a 16 ficarão marcadas como **pendente** até serem documentadas.

| Prefixo CSV | Módulo                          | Rodada | Status         |
| ----------- | ------------------------------- | ------ | -------------- |
| `FUN`       | Fundação (multi-clínica/perms)  | R1     | ✅ Nesta versão |
| `AUT`       | Autenticação                    | R1     | ✅ Nesta versão |
| `PAC`       | Pacientes (cadastro/duplicados) | R2     | ⏳ Pendente     |
| `AGE`       | Agenda + Express + Disp.        | R3     | ⏳ Pendente     |
| `REC`       | Recepção / Fluxo / Painel       | R4     | ⏳ Pendente     |
| `CAI`       | Caixa & Pagamentos              | R5     | ⏳ Pendente     |
| `FIN`       | Financeiro                      | R6     | ⏳ Pendente     |
| `NFS`       | NFS-e                           | R7     | ⏳ Pendente     |
| `CB `       | Cartão Benefícios               | R8     | ⏳ Pendente     |
| `ORC`       | Orçamentos & Contratos          | R9     | ⏳ Pendente     |
| `CLI`       | Clínico (prontuário/anamnese)   | R10    | ⏳ Pendente     |
| `MED`       | Médicos & Prestadores           | R11    | ⏳ Pendente     |
| `ENF`       | Enfermagem                      | R12    | ⏳ Pendente     |
| `COM`       | Comunicação (WhatsApp/Chat/IA)  | R13    | ⏳ Pendente     |
| `MKT`       | Marketing & CRM                 | R14    | ⏳ Pendente     |
| `RH `       | RH & LMS                        | R15    | ⏳ Pendente     |
| `TRV`       | Transversal (audit/estoque/BI)  | R16    | ⏳ Pendente     |

---

## 4. Fichas de módulo — Rodada 1

### 4.1 Módulo: Multi-clínica & Membership

**Prefixo CSV:** `FUN` · **Fonte principal:** `src/hooks/use-clinica.tsx`, tabelas `clinicas` / `clinica_memberships` / `unidades`, RPC `criar_clinica_com_admin`.

#### Objetivo
Permitir que um mesmo usuário opere em várias clínicas (matriz + filiais) sem re-login, com um contexto ativo (`clinicaAtual`) e um modo agregado (`modoTodas`) para relatórios/superadmin.

#### Usuários envolvidos
Todos. Admin cria clínicas; gestores gerenciam membros; recepção/caixa/médico operam dentro do contexto ativo.

#### Telas relacionadas
- `/app` — SubsystemChooser (`app.index.tsx`) — saudação usa `branding` da clínica.
- `/app/clinicas` — CRUD de clínicas (só admin/gestor).
- `/app/unidades` — CRUD de unidades por clínica.
- Cabeçalho do `AppShell` — seletor de clínica + toggle "todas".

#### Tabelas do banco usadas
`clinicas`, `clinica_memberships`, `unidades`.

#### Campos importantes
- `clinicas.branding` (JSON: `logo_url`, `primary`, `accent`).
- `clinicas.base_importada` (bool) — gating de visibilidade (ver regra `FUN-004`).
- `clinica_memberships.role` — `admin` | `gestor` | `recepcao` | `caixa` | `financeiro` | `medico` | `enfermeiro` (ver 4.2).
- `clinica_memberships.ativo` — soft-disable de acesso.

#### Fluxo principal
1. Usuário faz login → `use-clinica` carrega memberships ativos.
2. Se `localStorage["clinica_atual_id"]` existe e ainda pertence ao usuário, é adotado; senão, primeiro da lista.
3. Consultas usam `clinicaIds`: `[clinicaAtual.clinica_id]` OU todos os IDs quando `modoTodas=true`.
4. Toggle "modo todas" só é oferecido a usuários com múltiplas memberships (**PRECISA VALIDAR** — não vi gating explícito).

#### Regras
- `FUN-001` ✅ Um usuário pode ter N memberships; cada `(user_id, clinica_id)` é único (`clinica_memberships`).
- `FUN-002` ✅ Membership com `ativo=false` **não** aparece no seletor (`.eq("ativo", true)` em `use-clinica.tsx:load`).
- `FUN-003` ✅ `clinicaAtual` fica cacheado em `localStorage["clinica_atual_id"]` e `localStorage["clinica_modo_todas"]`.
- `FUN-004` ✅ Clínica com `base_importada=false` **E** sem médicos ativos fica escondida para não-admin (`use-clinica.tsx` — comentário A6, caso "CLINICA CONSULTA HOJE").
- `FUN-005` ✅ Admin sempre enxerga a clínica, mesmo `base_importada=false`.
- `FUN-006` ✅ Cache de memberships em `localStorage["clinica_memberships_cache_v1"]` reduz flicker na navegação.
- `FUN-007` ✅ RPC `criar_clinica_com_admin(nome, cnpj, telefone, cidade, estado)` cria a clínica **e** já cria membership `role='admin'` para o `auth.uid()`.
- `FUN-008` 🟠 `branding` é lido em várias telas (`app.index.tsx`, `AppShell`), mas não vi UI de edição em `app.clinicas.tsx` — **PRECISA VALIDAR** se é editado só via SQL/admin.
- `FUN-009` 🔴 **BUG de segurança** — policy `memberships_self_insert_first` permite `INSERT` com `WITH CHECK (user_id = auth.uid() OR can_manage_clinica(...))`. Qualquer autenticado consegue **se auto-inscrever em qualquer clínica com qualquer role** (`migration 20260516181120:182-183`).
- `FUN-010` 🟠 `base_importada` é **puramente cliente** — não há RLS nem função SQL que a considere. Chamada direta ao Postgres passa por cima da regra `FUN-004`.
- `FUN-011` 🔴 `/app/clinicas` redireciona incondicionalmente para `/app/unidades` (rota morta). A chave `clinicas` em `TODOS_MODULOS` aponta pra lugar nenhum (`app.clinicas.tsx:1-6`).

#### Validações
- Membership ativo obrigatório para renderizar `_authenticated` — enforced por RLS + pela query em `use-clinica.tsx`.

#### Status possíveis
- `clinica_memberships.ativo` ∈ {true, false}.
- `clinicas.base_importada` ∈ {true, false, null} — `false` = não operacional; `true` = pronta; `null` **PRECISA VALIDAR**.

#### Permissões
RLS nas tabelas (4 policies em cada). Front-end filtra pela query de membership; admin vê todas via `has_role_global` (ver 4.2).

#### Exceções
- Novo signup sem membership: usuário vê `_authenticated` vazio (nenhum sistema para escolher) — **PRECISA VALIDAR** se há tela de "sem acesso".

#### Integrações
Todas as queries do sistema recebem `clinica_id` (ou lista, em `modoTodas`). RPCs `security definer` recebem `_clinica_id` como parâmetro obrigatório.

#### Pontos incompletos / confusos
- 🟠 `modoTodas` some ao trocar de clínica manualmente (`setClinicaAtual` força `false`) — comportamento intencional? **PRECISA VALIDAR**.
- 🟠 `unidades` (15 colunas) — não claro se é usada como sub-clínica ou como sala/consultório dentro da clínica. **PRECISA VALIDAR** com R11.

---

### 4.2 Módulo: Permissões & Perfis de acesso

**Prefixo CSV:** `FUN` · **Fonte principal:** `src/hooks/use-permissoes.tsx`, `src/lib/permissoes-presets.ts`, tabelas `perfis_acesso`, `perfil_permissoes`, `user_roles`, `role_permissions`, RPCs `has_role`, `has_role_global`, `is_member`, `can_manage_clinica`, `user_is_any_manager`.

#### Objetivo
Controlar quais **módulos** (menus/rotas) o usuário enxerga e com qual **nível de acesso** (`read` | `write` | `none`), com fallback a um preset por role quando o gestor ainda não configurou nada.

#### Usuários envolvidos
- **Admin** — bypass total (nenhum filtro).
- **Gestor** — configura `perfis_acesso` e `perfil_permissoes` da clínica.
- **Demais roles** — consomem os presets ou o override configurado.

#### Telas relacionadas
- `/app/perfis` — edição dos perfis e permissões.
- `AppShell` — filtra o menu com `usePermissoes()`.

#### Tabelas do banco usadas
- `perfis_acesso` (chave textual do perfil por clínica).
- `perfil_permissoes` (`perfil_id`, `modulo`, `acesso`).
- `user_roles` (tabela SEGREGADA — nunca em `profiles`; ver mem/user-roles).
- `role_permissions` (5 colunas — **PRECISA VALIDAR** o uso: parece legado).
- `permissions` (5 colunas, 1 policy — **PRECISA VALIDAR**).

#### Campos importantes
- `perfil_permissoes.acesso` ∈ {`none`, `read`, `write`}.
- `clinica_memberships.role` — texto livre no banco, mas presets só cobrem 7 chaves.
- `user_roles.role` — enum `app_role` (**PRECISA VALIDAR** valores exatos).

#### Fluxo principal
1. `usePermissoes()` observa `clinicaAtual.role`.
2. Se `role === "admin"` → `allowed = null` (sem filtro).
3. Busca `perfis_acesso.chave = role` na clínica; se não achar → aplica `presetAllowedSet(role)`.
4. Se achar mas sem `perfil_permissoes` → também cai no preset.
5. Caso contrário → conjunto = módulos com `acesso != 'none'`.
6. `AppShell` esconde itens de menu cujo `modulo` não está em `allowed`.

#### Regras
- `FUN-020` ✅ Admin **nunca** é filtrado (`usePermissoes` retorna `null`).
- `FUN-021` ✅ Roles suportadas no preset: `admin`, `gestor`, `medico`, `recepcao`, `caixa`, `financeiro`, `enfermeiro` (`permissoes-presets.ts`).
- `FUN-022` ✅ Fallback silencioso: se nenhum registro em `perfil_permissoes`, aplica preset — o sistema **nunca** fica vazio antes da 1ª configuração (`usePermissoes.tsx:66-73`).
- `FUN-023` ✅ `TODOS_MODULOS` (57 chaves) é a lista canônica de módulos filtráveis.
- `FUN-024` ✅ Roles têm que ficar em tabela separada — memória de projeto: `user_roles` (não em `profiles`).
- `FUN-025` ✅ Preset **recepcao** dá `write` em: agenda, recepcao, clientes, fluxo, orcamentos, checkin, painel, chat, caixa; `read` em consulta-rapida, cartao-beneficios, procedimentos.
- `FUN-026` ✅ Preset **caixa** dá `write` em caixa, boletos; `read` em financeiro, nfse, contratos — caixa **não** emite NFS-e (só lê).
- `FUN-027` ✅ Preset **medico** dá `write` em agenda, atendimento-ia, prontuarios, anamneses, documentos, odontologia; NÃO tem acesso a caixa/financeiro.
- `FUN-028` ✅ RPCs de permissão em banco: `has_role(_user_id, _role app_role)`, `has_role_global(...)`, `is_member(...)`, `can_manage_clinica(_user_id, _clinica_id)`, `user_is_any_manager(...)`. Todas `SECURITY DEFINER`.
- `FUN-029` ❓ `role_permissions` e `permissions` (2 tabelas antigas) coexistem com `perfil_permissoes` — **PRECISA VALIDAR** se são vestígio ou uso real.
- `FUN-030` 🟡 Chave textual `clinica_memberships.role` **deveria** casar com `perfis_acesso.chave`, mas não há FK no banco (**PRECISA VALIDAR**).
- `FUN-031` 🔴 **Enum `app_role` NÃO inclui `caixa`** — valor existe nos presets do front-end (`PerfilKey`) e é auto-upsertado em `perfis_acesso`, mas `INSERT` em `clinica_memberships` com `role='caixa'` **é rejeitado pelo Postgres** (erro de tipo). Ver `migration 20260516181120:7` vs `permissoes-presets.ts:10`.
- `FUN-032` 🔴 **Dois sistemas de role paralelos**: `clinica_memberships.role : app_role` (usado) vs `user_roles.role : app_role_global` (nunca consultado pelo front). Enums divergem: `enfermeiro` vs `enfermagem`, `financeiro` vs `tesouraria`/`marketing`. Ver `migration 20260520175438`.
- `FUN-033` 🔴 Objetos `PRESETS` **duplicados** em `src/lib/permissoes-presets.ts` e `src/routes/_authenticated/app.perfis.tsx:179-227` — divergem: a rota tem `recepcao.anamneses='write'` e `documentos='read'`, mas o runtime usa o do `.ts` (que tem `caixa='write'` e não tem `anamneses`).
- `FUN-034` 🔴 **`modoTodas` × permissões**: `usePermissoes` só olha `clinicaAtual.role`. Se usuário é `medico` em A e `admin` em B, com B ativo e `modoTodas=true`, ele vê menu de admin operando dados de A.
- `FUN-035` ✅ Permissão de módulo **filtra menu, não rota**: `AppShell.leafAllowed()` só esconde item; URL colada continua carregando (proteção fica só na RLS).

#### Validações
- Se `role` não bater com nenhum preset **e** não houver `perfis_acesso` → menu fica vazio (usuário efetivamente bloqueado). Não vi mensagem de UX explicando.

#### Status possíveis
`acesso` ∈ {none, read, write}. Chave `role` ∈ ver `FUN-021`.

#### Permissões
- Só `admin`/`gestor` deveria editar `/app/perfis` (**PRECISA VALIDAR** o gating na rota).
- RLS de `perfil_permissoes` (4 policies) — detalhamento em R16.

#### Exceções
- Se `usePermissoes` der erro na query, cai no preset da role — nunca deixa usuário travado.

#### Integrações
- Todo item de menu em `AppShell` carrega um `modulo` para filtrar.
- Server-side: RPCs `has_role` são usadas em policies e em server functions.

#### Pontos incompletos / confusos
- 🟠 Só o **menu** é filtrado; **rotas diretas** (URL colada) parecem não checar `usePermissoes` — precisam de guard? **PRECISA VALIDAR**.
- 🟠 Enum `app_role` (tabela `user_roles`) vs. texto livre (`clinica_memberships.role`) — duas fontes de "role" para o mesmo usuário; qual é a autoridade? **PRECISA VALIDAR**.

---

### 4.3 Módulo: Autenticação & Sessão

**Prefixo CSV:** `AUT` · **Fonte principal:** `src/hooks/use-auth.tsx` (não lido nesta rodada, ver ❓), `src/routes/_authenticated.tsx`, `src/routes/login.tsx`, `src/routes/signup.tsx`, `src/integrations/supabase/client.ts`.

#### Objetivo
Autenticar usuários (staff) via Supabase Auth (email/senha; potencialmente OAuth Google — **PRECISA VALIDAR**) e proteger todas as rotas `/app/*`.

#### Usuários envolvidos
Todos os operadores. Pacientes têm rotas públicas separadas (`/paciente/*`, `/p/$token`, `/verificar/$codigo`).

#### Telas relacionadas
`/login`, `/signup`, `/diagnostico`. Rotas de paciente: `/paciente.index`, `/paciente.perfil`, `/paciente.consultas`, `/paciente.cartoes`, `/paciente.financeiro`, `/checkin/$token`, `/p/$token`, `/p/contrato/$token`, `/verificar/$codigo`, `/painel`, `/totem`, `/autoatendimento`, `/lp/$slug`.

#### Tabelas do banco usadas
`auth.users` (schema `auth`, não editável), `profiles` (6 policies), `clinica_memberships`, `user_roles`.

#### Campos importantes
- `profiles.nome` — exibido na saudação.
- `profiles.id` = `auth.users.id`.
- Trigger `handle_new_user` (RPC identificada) — provavelmente cria `profiles` no signup. **PRECISA VALIDAR** (não abri o SQL do trigger).

#### Fluxo principal
1. `/login` → Supabase Auth (magic link ou senha — **PRECISA VALIDAR**).
2. `beforeLoad` de `_authenticated.tsx` verifica `supabase.auth.getSession()`; sem sessão → redireciona `/login`.
3. `AppShell` sob `ClinicaProvider` monta o restante do app.
4. Rotas de paciente autenticam via **token** (link mágico próprio, não Supabase) — ver R2/R4.

#### Regras
- `AUT-001` ✅ `_authenticated` roda `ssr: false` — sessão vive em `localStorage`.
- `AUT-002` ✅ Sem sessão em qualquer `/app/*` → `redirect({ to: "/login" })`.
- `AUT-003` ✅ Signup dispara trigger `handle_new_user` que cria linha em `profiles`.
- `AUT-004` 🟡 Sistema espera que **admin** aprove/adicione o usuário a uma clínica após signup (senão ele fica sem memberships e sem menu). **PRECISA VALIDAR** o fluxo real.
- `AUT-005` ❓ Provedores OAuth (Google) — **PRECISA VALIDAR** se estão habilitados.
- `AUT-006` ✅ Rotas de paciente usam **token único** (`/p/$token`, `/checkin/$token`) — não usam sessão Supabase.
- `AUT-007` ❓ Política de "email confirmado obrigatório" — **PRECISA VALIDAR** (memória de projeto diz "no auto-confirm unless asked").

#### Validações
- Nada explícito no client além do gate de `_authenticated`.

#### Status possíveis
Sessão presente/ausente. `profiles.nome` obrigatório? **PRECISA VALIDAR**.

#### Permissões
RLS em `profiles`: 6 policies (detalhamento em R16).

#### Exceções
- Sessão expira em uma aba → `beforeLoad` redireciona para `/login` na próxima navegação.

#### Integrações
- `use-clinica` depende de sessão via `useAuth`.
- `attachSupabaseAuth` middleware (client-side) anexa `Authorization: Bearer` em todo `createServerFn` que use `requireSupabaseAuth`.

#### Pontos incompletos / confusos
- 🟠 Não há tela "usuário sem clínica" — cai no seletor vazio.
- ❓ Recuperação de senha, mudança de email — não vi rota dedicada; talvez use dialogs (`change-password-dialog.tsx` existe). **PRECISA VALIDAR**.

---

## 5. Seções de fechamento

> Cada rodada acrescenta itens aqui. Nesta versão, apenas Rodada 1.

### 5.1 ✅ Regras confirmadas pelo código
FUN-001..FUN-007, FUN-020..FUN-028, FUN-035, AUT-001, AUT-002, AUT-003, AUT-006.

### 5.2 🟡 Regras inferidas do histórico de prompts
AUT-004, FUN-030.

### 5.3 🟠 Regras incompletas
FUN-008 (branding sem UI), FUN-010 (base_importada só cliente), FUN-029 (tabelas antigas coexistindo), FUN-035 (gating só de menu).

### 5.4 🔴 Regras conflitantes
- **FUN-009** — self-insert em `clinica_memberships` (bug de segurança).
- **FUN-011** — `/app/clinicas` é rota morta.
- **FUN-031** — enum SQL não tem `caixa`; front usa `caixa`.
- **FUN-032** — `app_role` × `app_role_global` (dois sistemas paralelos).
- **FUN-033** — PRESETS duplicados divergentes.
- **FUN-034** — vazamento de permissão em `modoTodas`.

### 5.5 ❓ Regras a validar com a clínica
- Semântica de `unidades` — sub-clínica ou consultório?
- Semântica de `base_importada = null`.
- Fluxo pós-signup (quem adiciona o usuário a uma clínica?).
- OAuth Google habilitado?
- Existe UI de branding por clínica?
- Quem tem direito ao "modo todas"?
- `role_permissions` / `permissions` são legado ou uso real?
- Enum `app_role` vs. `clinica_memberships.role` — qual manda?
- Existe guard de rota (não só menu) por módulo?
- `user_roles` / `app_role_global` — remover ou passar a usar?

### 5.6 🔴 Achados de segurança (tratar antes de novas features)

| ID       | Impacto                                                                     | Correção sugerida                                                                          |
| -------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| FUN-009  | Elevação de privilégio: qualquer autenticado vira admin de qualquer clínica | Remover ramo `user_id = auth.uid()` do WITH CHECK e trocar por fluxo de convite            |
| FUN-031  | Salvar `role='caixa'` sempre falha em produção                              | Adicionar `caixa` ao enum `app_role` via nova migration                                    |
| FUN-034  | Menu incorreto em modo agregado                                             | Calcular `allowed` como interseção OU exigir clínica única antes de operar em `modoTodas`  |
| FUN-035  | Rotas diretas ignoram permissão                                             | Adicionar `beforeLoad` gate por módulo em `_authenticated`                                 |
| FUN-010  | `base_importada` não protege chamadas diretas                               | Reforçar via RLS: policy que bloqueia `SELECT/INSERT` quando `base_importada=false` para não-admin |

---

_Próxima rodada: **R2 — Pacientes** (cadastro, duplicados, dependentes, LGPD, biometria facial)._