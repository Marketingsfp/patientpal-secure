# Handoff para o Claude Code — correções pré-deploy (patientpal-secure)

Este pacote saiu de uma auditoria estática do repositório feita em 15/08/2026. O ambiente da auditoria **não conseguiu rodar build, typecheck nem testes** (sem acesso ao registro npm), então **nada aqui foi validado em execução** — é exatamente esse o trabalho que precisa acontecer na máquina onde há `node_modules`.

## Conteúdo

| Arquivo | O que é |
|---|---|
| `correcoes-codigo.patch` | Diff unificado com 9 arquivos alterados (bloqueadores 3 e 5, altos 13, 14 e 15) |
| `migrations/20260816090000_fix_rls_chat_anexos.sql` | Bloqueador 1 — policy do bucket `chat-anexos` |
| `migrations/20260816090100_fix_view_duplicados_security_invoker.sql` | Bloqueador 2 — view vazando CPF entre clínicas |
| `migrations/20260816090200_revoga_grants_anon_legado.sql` | Alto 8 — grants remanescentes para `anon` |

## Como aplicar

```bash
cd caminho/do/patientpal-secure
git checkout -b fix/pre-deploy-auditoria

# 1) código
git apply --check correcoes-codigo.patch   # confere antes
git apply correcoes-codigo.patch

# 2) banco — copiar os .sql para supabase/migrations/ e aplicar pelo fluxo
#    normal do projeto (Supabase CLI ou SQL Editor). Cada arquivo traz, no
#    cabeçalho, a query de verificação do estado ANTES e DEPOIS.

# 3) validar
bun run lint && bun run typecheck && bun test
bun run build          # o CI não roda isto — é onde aparecem os problemas de bundle
```

## O que cada mudança de código faz

**`src/lib/qz/sign.functions.ts`** — adiciona `.middleware([requireSupabaseAuth])`. Era a única das 52 server functions sem autenticação, e assina com a chave privada do QZ Tray: qualquer um na internet obtinha comandos de impressão assinados, que rodam sem popup de autorização na estação.

**`src/integrations/supabase/env.ts`** — o fallback hardcoded (que aponta para o projeto `odllhxwadsrnhphzoevl`, diferente do `.env`) passa a valer só em dev e nos hosts de preview do Lovable. Em produção, variável ausente volta a ser erro explícito em vez de conectar silenciosamente no projeto errado. **Antes de subir, confirme qual ref é produção e configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` e `VITE_SUPABASE_PROJECT_ID` no ambiente de build do Cloudflare** — sem isso, com este patch aplicado, o app falha ao carregar (que é o comportamento desejado, mas você quer descobrir isso antes do deploy, não depois).

**`src/hooks/use-auth.tsx` + `src/components/app-shell.tsx`** — o `signOut` passa a limpar as chaves `clinica_*` e `pep:*` do localStorage e a sair com `window.location.replace("/login")` em vez de navegação SPA. Motivo: o `QueryClient` tem `staleTime` de 5 min, `gcTime` de 30 min e `refetchOnMount: false`, e não há nenhum `queryClient.clear()` no projeto — em terminal compartilhado, o usuário seguinte via dados do anterior.

**`src/components/app-shell.tsx`** — remove o bypass de menu por e-mail fixo (`rodrigorss2301@gmail.com`). Ele não furava RLS, mas é autorização por string de e-mail, trocável no painel do Supabase e sem rastro de auditoria. *Se esse acesso for necessário, o caminho é dar o papel correspondente em Perfis de Acesso — confirme com o time antes de subir, porque isso muda o que uma pessoa real enxerga no menu.*

**5 arquivos de server function** (`agenda/status-agendamento`, `agenda/criar-agendamento`, `atendimento-multiplo/criar`, `atendimento`, `nina`) — trocam `new Date()` + `setHours()` por `janelaDiaClinica(hojeBR())`, que já existe em `src/lib/date-utils.ts`. Esse código roda no Worker do Cloudflare, que está em UTC: o sintoma mais visível é que **depois das 21h ficava impossível marcar como "Realizado" um atendimento da própria noite** ("data futura"). Os mesmos pontos existem em `src/routes/_authenticated/app.agenda.tsx` e outras telas, mas lá o código roda no navegador (fuso do usuário) — impacto menor, ficou para a próxima janela.

### Teste manual que vale a pena antes de subir

1. Marcar como "Realizado" um atendimento da noite, com o relógio depois das 21h (ou simulando).
2. Criar agendamento para hoje de manhã e para ontem — o primeiro deve passar, o segundo deve ser bloqueado.
3. Logout na recepção e login com outro usuário: nenhuma lista deve aparecer com dados do anterior.
4. Impressão via QZ Tray logado (deve funcionar) e, se der, uma chamada ao endpoint sem sessão (deve falhar).

## O que NÃO está neste pacote e ainda precisa ser feito

1. **Secrets no Cloudflare** (`wrangler secret put`): `SUPABASE_SERVICE_ROLE_KEY`, `BACKUP_WEBHOOK_TOKEN`, `FOCUS_NFE_TOKEN_PROD`, `FOCUS_NFE_TOKEN_HML`, `FOCUS_WEBHOOK_TOKEN`, `LOVABLE_API_KEY`, `QZ_PRIVATE_KEY`, `SUPABASE_PROJECT_ID`. Sete delas não estão nem no `.env` local. Sem isso, NFS-e, backup, WhatsApp, IA e impressão quebram em produção. Confirme com `wrangler secret list`.
2. **`wrangler.jsonc`**: adicionar `"observability": { "enabled": true }` (sem isso não há log nenhum em produção) e trocar o `"name": "tanstack-start-app"` pelo nome real.
3. **Permissão de módulo no RLS** das tabelas clínicas que ficaram para trás — `odonto_prontuarios`, `anamnese_respostas`, `exame_resultados`, `triagens_enfermagem`, `documentos_emitidos`, `atend_conversas`, `paciente_biometria`, entre outras. Hoje elas só têm `is_member(auth.uid(), clinica_id)`, então o bloqueio por módulo existe só no menu: um usuário de `caixa` lê laudos e prontuários odontológicos direto pela API REST. O padrão a seguir é o bloco `do $policy$` que já migrou `agendamentos`, `pacientes`, `prontuarios` e `fin_*` para `has_module_access(clinica_id, '<modulo>', 'read'|'write')`. **Não fiz esta migration porque ela mexe em 12 tabelas e não pude testar nada** — precisa de alguém que rode e valide com usuários de perfis diferentes.
4. **Funções do totem abertas para `anon`** — `totem_match_biometria` aceita `_threshold` do chamador (com um valor alto, devolve `paciente_id` + nome de qualquer paciente), `totem_checkin_cpf` funciona como oráculo de CPF, `totem_upsert_paciente` grava. Correção mínima: fixar o threshold no servidor e revogar de `anon` a sobrecarga de 3 argumentos.
5. **`nfse_emitentes`** — `REVOKE SELECT` nas colunas `certificado_pfx_base64`, `certificado_senha`, `focus_token_*` (hoje qualquer gestor lê o certificado A1 e a senha).
6. **`src/routes/autoatendimento.tsx:181`** — baixa os descritores biométricos de todos os pacientes para o navegador. O totem já usa o caminho certo (`supabase.rpc("totem_match_biometria")`, `src/routes/totem.tsx:472`); é copiar.
7. **`src/components/supervisor-auth-dialog.tsx`** — faz `signInWithPassword` do supervisor no cliente global e depois restaura a sessão. Precisa virar server function.
8. **CI** — adicionar `bun run build` ao `.github/workflows/ci.yml`.

## Regras do repositório a respeitar

O `AGENTS.md` deste projeto exige: explicar antes de alterar, resumo "antes/depois/validação/pendências" ao final, e **perguntar em qual clínica a alteração se aplica**. As correções deste pacote são técnicas e de segurança, valem para todas as clínicas e não alteram regra de negócio — com uma exceção a confirmar com o time: a remoção do bypass de menu por e-mail (item acima), que muda o que uma pessoa específica enxerga.

O projeto também pode ser testado em produção (`AGENTS.md` §1.6): qualquer simulação de fluxo (estorno, baixa, faturamento) exige avisar antes o que será tocado e limpar depois.
