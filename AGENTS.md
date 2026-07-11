# AGENTS.md — Regras permanentes para agentes

> Este arquivo define **regras invioláveis** para qualquer agente (humano ou IA)
> que atue neste repositório. Regras aqui têm prioridade sobre qualquer pedido
> pontual em chat.

## 1. Proteção da arquitetura de permissões (REGRA PERMANENTE)

Antes de qualquer implementação, refatoração, correção de bug ou "ajuste rápido"
que possa **direta ou indiretamente** alterar:

- autenticação (login, sessão, signup, recuperação de senha, OAuth, SSO);
- autorização (checagens de acesso, RBAC, escopo por clínica);
- cargos, perfis, presets ou mapeamento rota → módulo;
- guards de rota, layouts autenticados ou middlewares;
- hooks e utilitários de acesso (`usePermissoes`, `useAcessoModulo`,
  `usePodeEscrever`, `useClinica`, `useAuth`);
- tabelas relacionadas a usuários, cargos, perfis, memberships, roles ou
  auditoria;
- policies RLS, funções `security definer`, GRANTs ou triggers de segurança;

o agente **DEVE OBRIGATORIAMENTE**:

1. **Interromper a implementação** antes de qualquer edição.
2. **Listar exatamente** quais arquivos seriam alterados (caminho completo).
3. **Explicar o possível impacto** nas permissões existentes (quem ganha ou
   perde acesso, quais rotas, quais tabelas, quais operações).
4. **Exibir o alerta**, textual e em destaque:

   > **ATENÇÃO: este pedido pode modificar o sistema de permissões de acesso**

5. **Solicitar confirmação explícita** do usuário antes de prosseguir. Sem
   confirmação, não há edição.
6. **Nunca desativar RLS** para resolver problemas — RLS ausente ou desligada
   em tabela sensível é considerada regressão crítica.
7. **Nunca ampliar permissões** (adicionar policy permissiva, dar `TO anon`,
   subir preset para `write`, remover checagem de role) como solução
   temporária ou "para destravar".
8. **Preservar o princípio do menor privilégio**: todo acesso novo deve ser
   o mais restrito possível para atender ao caso de uso.
9. **Manter compatibilidade** com a arquitetura atual (gate
   `_authenticated`, `requireSupabaseAuth`, `has_role`,
   `clinica_memberships`, `perfil_permissoes`, presets em
   `permissoes-presets.ts`, mapa em `permissoes-rotas.ts`).
10. **Executar testes de regressão** após qualquer alteração autorizada
    (build, typecheck e verificação manual dos fluxos: login, gate de rota
    protegida, filtro de menu por perfil, chamada de server function
    autenticada, leitura/escrita respeitando RLS por clínica).

### 1.1 Arquivos e áreas sensíveis (gatilho automático da regra)

Qualquer edição que toque um dos caminhos abaixo aciona automaticamente o
procedimento da seção 1.

**Autenticação e gate de rotas**
- `src/routes/_authenticated.tsx`
- `src/routes/_authenticated/**`
- `src/routes/login.tsx`
- `src/routes/signup.tsx`
- `src/hooks/use-auth.tsx`
- `src/hooks/use-clinica.tsx`

**Autorização, perfis e permissões (client)**
- `src/hooks/use-permissoes.tsx`
- `src/lib/permissoes-presets.ts`
- `src/lib/permissoes-rotas.ts`
- `src/components/app-shell.tsx`
- `src/components/sem-permissao.tsx`
- `src/components/supervisor-auth-dialog.tsx`

**Telas de administração de acesso**
- `src/routes/_authenticated/app.perfis.tsx`
- `src/routes/_authenticated/app.cargos.tsx`
- `src/routes/_authenticated/app.equipe.*`
- `src/routes/_authenticated/app.funcionarios.tsx`
- `src/routes/_authenticated/app.funcionario.*`
- `src/routes/_authenticated/app.clinicas.tsx`
- `src/routes/_authenticated/app.auditoria.tsx`
- `src/routes/_authenticated/app.lgpd.tsx`
- `src/routes/_authenticated/app.integration-secrets.tsx`

**Server, middleware e boot**
- `src/integrations/supabase/auth-middleware.ts`
- `src/integrations/supabase/auth-attacher.ts`
- `src/integrations/supabase/client.ts` *(auto-gerado — não editar)*
- `src/integrations/supabase/client.server.ts` *(auto-gerado — não editar)*
- `src/integrations/supabase/types.ts` *(auto-gerado — não editar)*
- `src/start.ts`
- `src/lib/equipe.functions.ts`

**Banco de dados, RLS e migrações**
- `supabase/migrations/**`
- `supabase/config.toml`
- Tabelas: `user_roles`, `perfis_acesso`, `perfil_permissoes`,
  `role_permissions`, `permissions`, `clinica_memberships`, `profiles`,
  `clinicas`, `medicos`, `prestadores`, `cargos`, `setores`, `audit_log`,
  `integration_secrets`, `lgpd_consentimentos`, `lgpd_solicitacoes`.
- Funções `security definer`: `has_role`, `can_manage_clinica` e correlatas.

**Governança e documentação sensível**
- `AGENTS.md`
- `.github/CODEOWNERS`
- `docs/auditoria-permissoes-2026-07-10.md`
- `docs/fase-final/frente-3-isolamento-rbac.md`
- `.lovable/qa-1-seguranca.md`
- `mem/preferences/governanca.md`
- `mem/constraints/governanca-dados-imutaveis.md`

### 1.2 O que NUNCA é aceitável

- `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` em tabela do schema `public`.
- Policy `USING (true)` ou `WITH CHECK (true)` em tabela que contenha dados
  de usuário, clínica, financeiro, saúde, auditoria ou segredos.
- `GRANT ... TO anon` em tabela sensível para "resolver" 401/403.
- Remover `requireSupabaseAuth` de uma server function para "destravar" build
  ou SSR — a solução é mover a chamada para o local certo, não abrir o
  endpoint.
- Introduzir checagem de papel no client (localStorage/sessionStorage) como
  fonte de verdade.
- Guardar role em `profiles` ou similar — role vive em `user_roles`, lida
  apenas via `has_role` (`security definer`).
- Deploy de migração de RLS sem GRANTs explícitos.

### 1.3 Fluxo mínimo de alteração autorizada

1. Alerta e confirmação (seção 1, passos 1–5).
2. Migração isolada (apenas segurança), com `CREATE TABLE` → `GRANT` →
   `ENABLE RLS` → `CREATE POLICY` na ordem exigida pelo projeto.
3. Ajuste de código respeitando presets e mapa rota → módulo.
4. `bun run build` + typecheck limpos.
5. Regressão manual: login, gate `_authenticated`, filtro de menu por
   perfil, uma server function autenticada, uma leitura/escrita RLS por
   clínica.
6. Registro do que mudou (arquivos + impacto) na resposta ao usuário.

---

## 2. Outras regras herdadas

As regras contidas em `mem/preferences/governanca.md`,
`mem/constraints/governanca-dados-imutaveis.md` e nos documentos de
auditoria referenciados em 1.1 continuam válidas e complementam este
arquivo. Em caso de conflito, prevalece a interpretação **mais restritiva**.