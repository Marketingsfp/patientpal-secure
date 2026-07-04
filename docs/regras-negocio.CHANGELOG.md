# Changelog — Regras de Negócio

## v0.2 — Rodada 2 (Pacientes)

**Data:** 2026-07-04
**Escopo:** módulos Pacientes, Duplicados, Biometria, Dependentes, LGPD.
**Auditoria SQL:** subagent `sub_fvd6gnek` (33 colunas de `pacientes`, 25+ índices, 5 triggers, 14 RPCs, políticas RLS de todas as tabelas correlatas).

### Módulos cobertos
- ✅ Pacientes (`PAC-001`..`PAC-027`)
- ✅ Duplicados (`PAC-040`..`PAC-044`)
- ✅ Biometria facial (`PAC-060`..`PAC-066`)
- ✅ Dependentes (`PAC-080`..`PAC-084`)
- ✅ LGPD (`LGP-001`..`LGP-007`)

### Achados críticos novos
- 🔴 **PAC-017** — `paciente_pendencias_cadastro` sem `clinica_id` nem `is_member` → vazamento cross-clínica.
- 🔴 **PAC-018** — `buscar_paciente_contato` GRANT `TO anon` retornando PII completa.
- 🔴 **PAC-019** — `paciente_cartao_inadimplente` GRANT `TO anon` retornando inadimplência.
- 🔴 **PAC-020** — triggers `ensure_paciente_*` falham silenciosamente (telefone obrigatório).
- 🔴 **PAC-021** — `/paciente/perfil` faz `.update()` sem `clinica_id`.
- 🔴 **PAC-063** — biometria facial gravada em uma tabela e lida da outra (identify quebrado).
- 🔴 **PAC-082** — `contrato_dependentes.paciente_id` sem FK.
- 🔴 **LGP-004** — `lgpd_solicitacoes` INSERT permite qualquer autenticado.
- 🟠 **PAC-003** — nome tem limite diferente no front (120) e no banco (200).
- 🟠 **PAC-022** — duas constraints CPF coexistem.
- 🟠 **PAC-023** — bloat de índices em `cpf_digits`.
- 🟠 **PAC-024** — face descriptor com storage duplicado.

### Métricas atualizadas
- Regras documentadas nesta rodada: **48** (PAC + LGP).
- Total do documento: **83** regras.
- Perguntas para a clínica adicionadas: **7** (total: **20**).
- 🔴 Achados de segurança acumulados: **13** (5 fundação + 8 pacientes/LGPD).
- Cobertura estimada: ~18% do total esperado.

### Não coberto ainda (para R3)
- `src/routes/_authenticated/app.agenda.tsx`, `app.agenda.express.tsx`
- `src/routes/_authenticated/app.disponibilidades.tsx`
- `src/components/agenda/*`, `src/components/medicos/EncerrarExpedienteButton.tsx`
- RPCs `get_horarios_disponiveis`, `top_procedimentos_agendamento`, `procedimentos_popularidade`
- Tabelas `agendamentos`, `medico_disponibilidades`, `medico_agendas`, `medico_expediente_encerramento`, `agendamento_orcamento_itens`

---

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