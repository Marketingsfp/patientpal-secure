# Changelog — Regras de Negócio

## v0.1.1 — Rodada 1 (Fundação) — revisão com auditoria SQL

**Data:** 2026-07-04
**Origem:** relatório do subagent `sub_203rkpz4` (leitura profunda de migrations, RLS, enums).

### Achados críticos incorporados
- **FUN-009** 🔴 self-insert em `clinica_memberships` (elevação de privilégio)
- **FUN-010** 🟠 `base_importada` só cliente
- **FUN-011** 🔴 `/app/clinicas` é rota morta
- **FUN-031** 🔴 enum `app_role` sem `caixa`
- **FUN-032** 🔴 `user_roles` / `app_role_global` órfãos
- **FUN-033** 🔴 PRESETS duplicados divergentes
- **FUN-034** 🔴 permissão errada em `modoTodas`
- **FUN-035** ✅ menu filtra mas rota não

### Métricas atualizadas
- Regras documentadas: **35** (25 ✅ · 2 🟡 · 3 🟠 · 6 🔴 · 4 baixa confiança).
- Perguntas para a clínica: **13**.
- Nova seção **§5.6 Achados de segurança** com plano de correção.

---

## v0.1 — Rodada 1 (Fundação)

**Data:** 2026-07-04
**Escopo:** esqueleto do MD + CSV, visão geral do sistema, 3 módulos.

### Módulos cobertos
- ✅ Multi-clínica & Membership (`FUN-001`..`FUN-008`)
- ✅ Permissões & Perfis (`FUN-020`..`FUN-030`)
- ✅ Autenticação & Sessão (`AUT-001`..`AUT-007`)

### Fontes consultadas
- `src/hooks/use-clinica.tsx`
- `src/hooks/use-permissoes.tsx`
- `src/lib/permissoes-presets.ts`
- `src/routes/_authenticated.tsx`
- `src/routes/_authenticated/app.index.tsx`
- `pg_proc` (lista de RPCs `SECURITY DEFINER`)
- `pg_tables` (inventário das 128 tabelas)
- Memória: `mem://index.md`

### Não coberto ainda (fontes ainda não abertas)
- `src/hooks/use-auth.tsx` — abrir em R2.
- `src/components/app-shell.tsx` — abrir em R2 (para mapear itens de menu por módulo).
- Migrations específicas de `clinicas`, `clinica_memberships`, `perfis_acesso`, `user_roles`.
- SQL da função `handle_new_user`.
- `src/routes/login.tsx` / `signup.tsx`.
- Guards eventuais em rotas de `/app/*`.

### Rodadas seguintes
- **R2 — Pacientes** (cadastro, duplicados, dependentes, LGPD, biometria facial).
- **R3 — Agenda** (principal, Express, disponibilidades, encerramento).
- ...ver `docs/regras-negocio.md` §3 para a lista completa.

### Métricas
- Regras documentadas: 27 (20 ✅ · 2 🟡 · 5 baixa/média confiança).
- Perguntas para a clínica: 12 (ver §5.5).
- Cobertura estimada: ~7% do total esperado.