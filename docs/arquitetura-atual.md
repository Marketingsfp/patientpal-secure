# Arquitetura Atual — ClinicaOS / Health Hub Pro

> Cada afirmação abaixo tem um arquivo de referência. Lido diretamente do código em 2026-07-10; nada foi assumido por convenção de mercado.

## Frontend

- **React 19.2.0** com SSR via **TanStack Start** (`@tanstack/react-start` 1.167.50) — [package.json](../package.json).
- **Roteamento em arquivo** via TanStack Router (`@tanstack/react-router` 1.168.25); árvore gerada em [src/routeTree.gen.ts](../src/routeTree.gen.ts) a partir de `src/routes/**`.
- **UI**: Tailwind CSS 4 (CSS-first, sem `tailwind.config.*` — tokens em [src/styles.css](../src/styles.css)) + shadcn/ui (`style: "new-york"`, ícones lucide) — [components.json](../components.json). Componentes primitivos de Radix UI (accordion, dialog, dropdown, etc.).
- **Editor de texto rico**: Tiptap (`@tiptap/*`) — usado em prontuário/contratos.
- **Reconhecimento facial no cliente**: `face-api.js` — [src/lib/face-recognition.ts](../src/lib/face-recognition.ts).

## Backend

- **Sem Supabase Edge Functions** — não existe diretório `supabase/functions/` neste repo (confirmado por busca no filesystem).
- Lógica server-side vive em dois formatos:
  1. **Server functions do TanStack Start** (`createServerFn`), ex. [src/lib/agenda/criar-agendamento.functions.ts](../src/lib/agenda/criar-agendamento.functions.ts), [src/lib/equipe.functions.ts](../src/lib/equipe.functions.ts) — chamadas via RPC interno do TanStack Start, não são endpoints REST públicos.
  2. **Rotas HTTP públicas** em `src/routes/api/public/*` — webhooks reais: [whatsapp.$clinicaId.ts](../src/routes/api/public/whatsapp.$clinicaId.ts) (Meta Cloud API, valida HMAC `x-hub-signature-256`), [focusnfe.webhook.ts](../src/routes/api/public/focusnfe.webhook.ts), [hooks/backup-diario.ts](../src/routes/api/public/hooks/backup-diario.ts) (autenticado por header `apikey` = publishable key).

## Banco de dados

- **PostgreSQL via Supabase** (projeto `odllhxwadsrnhphzoevl` — [supabase/config.toml](../supabase/config.toml)). Schema definido por ~340 migrations SQL em `supabase/migrations/`, sem outra fonte de verdade.
- Detalhe completo (tabelas, RLS, enums, triggers) em [docs/banco-de-dados.md](banco-de-dados.md).

## Autenticação

- **Supabase Auth**, cliente browser em [src/integrations/supabase/client.ts](../src/integrations/supabase/client.ts) (chave publicável, sessão em `localStorage`).
- Bearer token é anexado às chamadas de server function pelo middleware de cliente [auth-attacher.ts](../src/integrations/supabase/auth-attacher.ts), registrado globalmente em [src/start.ts](../src/start.ts) (`functionMiddleware: [attachSupabaseAuth]`).
- No servidor, [auth-middleware.ts](../src/integrations/supabase/auth-middleware.ts) (`requireSupabaseAuth`) valida o Bearer token via `supabase.auth.getClaims()` e injeta `{ supabase, userId, claims }` no contexto da server function.
- Cliente **service_role** só existe em [client.server.ts](../src/integrations/supabase/client.server.ts), com comentário explícito "bypasses RLS... never expose to client code". Usado em `*.functions.ts` e nos webhooks `/api/public/*`.

## Autorização

- **No banco**: RLS por clínica via funções `SECURITY DEFINER` (`is_member`, `has_role`, `can_manage_clinica`, `has_role_global`) — todas com `SET search_path = public`. Ver [docs/banco-de-dados.md](banco-de-dados.md) para a lista de políticas.
- **Na aplicação**: um segundo nível de permissão por papel/módulo vive em `perfis_acesso`/`perfil_permissoes`, lido pelo hook [use-permissoes.tsx](../src/hooks/use-permissoes.tsx) — **esse nível não é espelhado em RLS** (a política de banco só verifica *membership* da clínica, não o papel/módulo). Achado de auditoria anterior (ver `docs/regras-de-negocio.md`, categoria "CONTRADITÓRIA").

## Storage

- Buckets confirmados (consulta direta ao projeto, 2026-07-09): `backups-diarios`, `cb-informativos`, `pacientes-fotos`. Sem `supabase/config.toml` declarando buckets — criados via migration/dashboard, não versionados neste repo.

## Integrações externas confirmadas

| Integração | Onde | Uso |
|---|---|---|
| Meta WhatsApp Cloud API | [src/lib/whatsapp.server.ts](../src/lib/whatsapp.server.ts) | Envio/recebimento de mensagens, templates HSM |
| Focus NFe | [focusnfe.webhook.ts](../src/routes/api/public/focusnfe.webhook.ts), [src/lib/nfse.functions.ts](../src/lib/nfse.functions.ts) | Emissão de NFS-e |
| Lovable AI Gateway (`ai.gateway.lovable.dev`, modelo `google/gemini-2.5-flash`) | `gerarRespostaNina()` em [whatsapp.server.ts](../src/lib/whatsapp.server.ts) | Bot "Nina" — responde pacientes via WhatsApp, **somente leitura** (não agenda/cancela por design explícito no prompt de sistema) |
| ViaCEP | citado em `mem/tests/clientes-pendentes.md` (busca de CEP no cadastro) — não localizado o client exato nesta rodada |

## Estrutura de rotas

- `src/routes/` = árvore pública (`login`, `signup`, `p.$token`, `p.contrato.$token`, `checkin.$token`, `lp.$slug`, `verificar.$codigo`, `totem`, `painel`, `diagnostico`, `sitemap[.]xml`).
- `src/routes/_authenticated/app.*` = área logada (dezenas de módulos, ver `docs/contexto-do-projeto.md`).
- `src/routes/api/public/*` = webhooks (não passam por `_authenticated`, autenticação própria por token/HMAC/apikey).

## Estado e consultas

- **TanStack Query** como cache de servidor — configuração central em [src/router.tsx](../src/router.tsx): `staleTime: 5min`, `gcTime: 30min`, `refetchOnWindowFocus: false`, `refetchOnMount: false`, `retry: 1` (mutations `retry: 0`).
- `defaultPreload: false` no router — desabilitado deliberadamente por bug documentado no próprio arquivo (`Cannot read properties of undefined ('_nonReactive')`).
- Estado local de UI: `useState`/`useEffect` diretos (sem Redux/Zustand encontrado).

## Padrões de componentes

- Diretórios `-v2` (`agenda-v2/`, `caixa-v2/`, `clientes-v2/`, `orcamentos-v2/`) coexistem com o código clássico, alternados por hooks `use-*-v2-flag.ts`. Ver `mem/constraints/governanca-dados-imutaveis.md` para a política de não remover o clássico.
- Sanitização de HTML: `dompurify`/`isomorphic-dompurify` usados antes de `dangerouslySetInnerHTML` em [contratos-page.tsx](../src/components/pages/contratos-page.tsx) e [lp.$slug.tsx](../src/routes/lp.$slug.tsx).

## Implantação

- **Cloudflare Workers**, worker `tanstack-start-app`, entry `src/server.ts`, `nodejs_compat` habilitado — [wrangler.jsonc](../wrangler.jsonc), `compatibility_date: 2025-09-24`.
- Build via `@cloudflare/vite-plugin`, agregado por `@lovable.dev/vite-tanstack-config` em [vite.config.ts](../vite.config.ts) — esse pacote já embute TanStack Start, React, Tailwind, tsConfigPaths, injeção de `VITE_*` e detecção de sandbox; o comentário no arquivo alerta para **não duplicar** esses plugins manualmente.
- **Sincronização com GitHub/Lovable**: remoto `origin` = `github.com/Marketingsfp/patientpal-secure` (confirmado via `git remote -v`). Push nesse remoto é o mecanismo pelo qual mudanças feitas fora do editor Lovable chegam até ele.
- **Sem CI configurado** (`.github/` não existe).

## Dependências críticas (ponto único de falha se indisponíveis)

Supabase (banco + auth + storage), Cloudflare Workers (runtime de produção), Meta WhatsApp Cloud API, Focus NFe, Lovable AI Gateway (bot Nina) e o próprio editor Lovable (build/deploy). Nenhum desses tem fallback documentado no código.
