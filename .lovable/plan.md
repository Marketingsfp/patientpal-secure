# Proteção da arquitetura de permissões

Nenhuma mudança de funcionamento. Nesta etapa vou apenas **criar `AGENTS.md`** na raiz e **apresentar a proposta de `.github/CODEOWNERS`** para revisão (sem criá-lo).

## 1) Arquivo a criar: `AGENTS.md` (raiz)

Regra permanente exigindo, antes de qualquer alteração direta ou indireta em autenticação, autorização, cargos, perfis, permissões, guards, rotas protegidas, hooks de acesso, tabelas de usuários ou policies RLS, que o agente:

1. Interrompa a implementação.
2. Liste exatamente os arquivos que seriam alterados.
3. Explique o possível impacto nas permissões existentes.
4. Exiba o alerta **"ATENÇÃO: este pedido pode modificar o sistema de permissões de acesso"**.
5. Solicite confirmação explícita antes de continuar.
6. **Nunca** desative RLS para resolver problemas.
7. **Nunca** amplie permissões como solução temporária.
8. Preserve o princípio do menor privilégio.
9. Mantenha compatibilidade com a arquitetura atual.
10. Execute testes de regressão após qualquer alteração autorizada.

O arquivo também listará os caminhos sensíveis (mesma lista do CODEOWNERS abaixo) para servir como gatilho automático da regra.

## 2) Arquitetura atual mapeada (somente leitura)

**Autenticação / gate de rotas**
- `src/routes/_authenticated.tsx` — gate `beforeLoad` com `supabase.auth.getSession()` (SSR off).
- `src/routes/_authenticated/` — toda a árvore de rotas protegidas `/app/*`.
- `src/routes/login.tsx`, `src/routes/signup.tsx`.
- `src/hooks/use-auth.tsx`, `src/hooks/use-clinica.tsx`.

**Autorização / perfis / permissões (client)**
- `src/hooks/use-permissoes.tsx` — `usePermissoes`, `useAcessoModulo`, `usePodeEscrever`.
- `src/lib/permissoes-presets.ts` — `PRESETS`, `TODOS_MODULOS`, `presetAllowedSet`.
- `src/lib/permissoes-rotas.ts` — `ROUTE_TO_MODULE`, `moduloDaRota`, `rotaLivre`.
- `src/components/app-shell.tsx` — guard de rota + filtro de menu.
- `src/components/sem-permissao.tsx`.
- `src/routes/_authenticated/app.perfis.tsx`, `app.cargos.tsx`, `app.equipe.*`, `app.funcionarios.tsx`, `app.funcionario.$userId.tsx`.

**Autorização / server**
- `src/integrations/supabase/auth-middleware.ts` (`requireSupabaseAuth`).
- `src/integrations/supabase/auth-attacher.ts`.
- `src/integrations/supabase/client.ts`, `client.server.ts` (auto-gerados — não editar).
- `src/start.ts` — registro do `functionMiddleware`.
- `src/lib/equipe.functions.ts` — `assertManager`, `can_manage_clinica`, criação/edição de membros/senhas.

**Banco de dados / RLS**
- Tabelas sensíveis: `user_roles`, `perfis_acesso`, `perfil_permissoes`, `role_permissions`, `permissions`, `clinica_memberships`, `profiles`, `clinicas`, `medicos`, `prestadores`, `cargos`, `setores`, `audit_log`, `integration_secrets`, `lgpd_*`.
- Funções security-definer: `has_role`, `can_manage_clinica` (e correlatas em `supabase/migrations/`).
- Diretório: `supabase/migrations/` (toda migração toca RLS/policies/roles).
- Documentação sensível: `docs/auditoria-permissoes-2026-07-10.md`, `docs/fase-final/frente-3-isolamento-rbac.md`, `.lovable/qa-1-seguranca.md`, `mem/preferences/governanca.md`, `mem/constraints/governanca-dados-imutaveis.md`.

## 3) Proposta de `.github/CODEOWNERS` (para revisão — NÃO será criado agora)

Substituir `@time-seguranca` pelo handle real antes de aplicar.

```
# Núcleo de autenticação e gate de rotas
/src/routes/_authenticated.tsx            @time-seguranca
/src/routes/_authenticated/**             @time-seguranca
/src/routes/login.tsx                     @time-seguranca
/src/routes/signup.tsx                    @time-seguranca
/src/hooks/use-auth.tsx                   @time-seguranca
/src/hooks/use-clinica.tsx                @time-seguranca

# Autorização / perfis / permissões (client)
/src/hooks/use-permissoes.tsx             @time-seguranca
/src/lib/permissoes-presets.ts            @time-seguranca
/src/lib/permissoes-rotas.ts              @time-seguranca
/src/components/app-shell.tsx             @time-seguranca
/src/components/sem-permissao.tsx         @time-seguranca
/src/components/supervisor-auth-dialog.tsx @time-seguranca

# Telas de administração de acesso
/src/routes/_authenticated/app.perfis.tsx        @time-seguranca
/src/routes/_authenticated/app.cargos.tsx        @time-seguranca
/src/routes/_authenticated/app.equipe.*          @time-seguranca
/src/routes/_authenticated/app.funcionarios.tsx  @time-seguranca
/src/routes/_authenticated/app.funcionario.*     @time-seguranca
/src/routes/_authenticated/app.clinicas.tsx      @time-seguranca
/src/routes/_authenticated/app.auditoria.tsx     @time-seguranca
/src/routes/_authenticated/app.lgpd.tsx          @time-seguranca
/src/routes/_authenticated/app.integration-secrets.tsx @time-seguranca

# Server / middleware / boot
/src/integrations/supabase/auth-middleware.ts    @time-seguranca
/src/integrations/supabase/auth-attacher.ts      @time-seguranca
/src/integrations/supabase/client.ts             @time-seguranca
/src/integrations/supabase/client.server.ts      @time-seguranca
/src/integrations/supabase/types.ts              @time-seguranca
/src/start.ts                                    @time-seguranca
/src/lib/equipe.functions.ts                     @time-seguranca

# Banco / RLS / migrações
/supabase/migrations/**                          @time-seguranca
/supabase/config.toml                            @time-seguranca

# Governança e documentação de segurança
/AGENTS.md                                       @time-seguranca
/.github/CODEOWNERS                              @time-seguranca
/docs/auditoria-permissoes-2026-07-10.md         @time-seguranca
/docs/fase-final/frente-3-isolamento-rbac.md     @time-seguranca
/.lovable/qa-1-seguranca.md                      @time-seguranca
/mem/preferences/governanca.md                   @time-seguranca
/mem/constraints/governanca-dados-imutaveis.md   @time-seguranca
```

## 4) Fora do escopo desta etapa

- Nenhuma edição em arquivos de permissões, hooks, guards, migrations ou RLS.
- `.github/CODEOWNERS` **não** será criado agora — fica para uma próxima aprovação, junto com o handle correto do time responsável.
