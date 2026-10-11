# CLAUDE.md — ClinicaOS / Health Hub Pro

> Contexto permanente para sessões do Claude Code neste repositório. Gerado por leitura direta do código em 2026-07-10. Tudo aqui é comprovável — nada foi suposto. Para o que não foi possível confirmar, ver `docs/contexto-do-projeto.md`.

## Objetivo do sistema

Sistema de gestão clínica **multi-clínica** ("ClinicaOS" / "Health Hub Pro", projeto Lovable `patientpal-secure`). Cobre agenda, recepção/check-in, pacientes, médicos, prontuário, caixa, financeiro, orçamentos, repasses médicos, cartão de benefícios, CRM/marketing, RH, LGPD e auditoria. Rodando em produção real com dados de pacientes.

## Visão geral da arquitetura

- **Frontend + SSR**: React 19 renderizado via TanStack Start (SSR), roteamento em arquivo via TanStack Router.
- **Backend**: Supabase (PostgreSQL + Auth + Storage + RLS) como banco e autenticação. Sem Edge Functions Supabase — lógica de servidor vive em *server functions* do TanStack Start (`createServerFn`) e rotas `src/routes/api/*`.
- **Deploy**: Cloudflare Workers, via `@cloudflare/vite-plugin` + `wrangler.jsonc` (entry `src/server.ts`).
- **Sincronização de código**: este repo é espelhado no GitHub (`github.com/Marketingsfp/patientpal-secure`) e sincronizado bidirecionalmente com o editor Lovable — push nesse remoto reflete no projeto Lovable.
- Detalhe completo com arquivos de referência: `docs/arquitetura-atual.md`.

## Tecnologias e versões confirmadas (package.json)

| Categoria | Pacote | Versão |
|---|---|---|
| Framework UI | react / react-dom | 19.2.0 |
| SSR/roteamento | @tanstack/react-start | 1.167.50 |
| Roteamento | @tanstack/react-router | 1.168.25 |
| Build | vite | 7.3.1 |
| Linguagem | typescript | 5.8.3 |
| Estado servidor | @tanstack/react-query | 5.83.0 |
| Estilo | tailwindcss | 4.2.1 (CSS-first, **sem** `tailwind.config.*` — config em `src/styles.css`) |
| Componentes | shadcn/ui (`components.json`: style `new-york`, ícones `lucide`) |
| Backend/DB client | @supabase/supabase-js | 2.105.4 |
| Deploy | @cloudflare/vite-plugin, wrangler | — (worker `tanstack-start-app`) |
| Validação | zod | 3.24.2 |
| Lint | eslint | 9.32.0 (+ typescript-eslint 8.56.1, prettier via eslint-plugin-prettier) |

**Gerenciador de pacotes:** ambíguo — existem `bun.lock` **e** `package-lock.json` na raiz. Confirme com o time qual é o canônico antes de instalar dependências; não presuma.

**Testes automatizados:** nenhum framework de teste (vitest/jest/playwright/cypress) encontrado em `package.json`. `docs/testes/` contém apenas um `.sql`, não uma suíte de testes. **Não existe CI configurado** (`.github/` não existe neste repo).

**Sub-projeto separado:** `remotion/` tem `package.json` e `CLAUDE.md` próprios (Remotion — geração de vídeo). Não faz parte do build do app clínico; trate como projeto independente.

## Comandos confirmados (package.json → scripts)

```bash
npm run dev        # vite dev — servidor de desenvolvimento
npm run build      # vite build — build de produção
npm run build:dev  # vite build --mode development
npm run preview    # vite preview
npm run lint       # eslint .
npm run format     # prettier --write .
```

Não existe script `test` nem `typecheck` no `package.json`. Para checagem de tipos, usar `tsc --noEmit` diretamente (o `tsconfig.json` já tem `noEmit: true` e `strict: true`).

## Organização principal de pastas

```
src/
  routes/            # roteamento em arquivo (TanStack Router) — públicas e _authenticated/
  routes/api/public/  # webhooks e endpoints públicos (WhatsApp, NFS-e, backup)
  components/        # UI; sufixo -v2 = módulo em reescrita paralela ao clássico
  hooks/             # inclui use-*-v2-flag.ts (feature flags) e use-permissoes.tsx
  lib/               # regras de negócio extraídas (*.functions.ts = server functions)
  integrations/supabase/  # client.ts (browser), client.server.ts (service_role — só servidor), auth-middleware.ts, types.ts (gerado)
supabase/migrations/  # ~340 migrations SQL, única fonte de verdade do schema
docs/                 # documentação viva (ver seção própria abaixo)
mem/                  # memória de convenções/decisões já registradas por sessões anteriores — LEIA ANTES de propor arquitetura nova
.claude/               # este diretório: rules/ e skills/ desta sessão em diante
```

## Convenções encontradas no código

- **Multi-clínica por `clinica_id`**: toda tabela de negócio tem `clinica_id`; isolamento via RLS usando `is_member(auth.uid(), clinica_id)` / `has_role` / `can_manage_clinica` (`SECURITY DEFINER`, `SET search_path = public`).
- **Módulos "v1/clássico" e "v2" coexistem** por feature flag (`use-agenda-v2-flag.ts`, `use-caixa-v2-flag.ts`, etc.). Não remover o clássico enquanto a v2 não for promovida — ver `mem/constraints/governanca-dados-imutaveis.md`.
- **Datas puras vs. timestamps**: `src/lib/date-utils.ts` documenta a distinção (evitar shift de fuso); nem todo código do projeto segue isso à risca — verificar caso a caso.
- **`fmt`/formatação de moeda duplicada** em ~18 arquivos em vez de reusar `src/lib/financeiro/format.ts` — dívida técnica conhecida, não repetir o padrão.
- **`docs/regras-negocio.md`** (singular, já existente) é um documento vivo de rodadas de auditoria de regras de negócio — não confundir com o novo `docs/regras-de-negocio.md` (plural) desta estrutura; eles se complementam.

## Regras para alterações seguras

1. **Verifique `git status` e a branch atual antes de tocar em qualquer arquivo.** Nunca presuma que a árvore está limpa.
2. **Preserve alterações de outros colaboradores** — não sobrescreva, não faça `git reset --hard`/`checkout .`/`clean -f` sem pedido explícito.
3. **Apresente um plano antes de mudanças amplas** (mais de um módulo, schema, RLS, ou qualquer coisa tocando produção). Mudanças pequenas e localizadas podem seguir direto.
4. **Prefira alterações pequenas e verificáveis** — um problema por vez, diff revisável.
5. **Nunca invente regra de negócio.** Se a intenção não está clara no código nem em `mem/`/`docs/`, escreva "Possível regra de negócio — validar com a equipe da clínica" e pergunte.
6. **Proibido sem autorização explícita do usuário**: alterar produção, publicar/deploy, `git push`, merge, criar ou aplicar migration, `git push --force`.
7. **Após qualquer mudança, rode as validações disponíveis** (`npm run lint`; `tsc --noEmit`; não há testes automatizados — diga isso explicitamente em vez de simular cobertura).
8. **Ao final, informe**: arquivos modificados, comandos de validação executados (e resultado), e riscos restantes/pendências.
9. Dados de pacientes são reais. Nunca exponha PII, tokens ou segredos em respostas, commits ou logs.

## Onde procurar mais contexto

- `docs/contexto-do-projeto.md` — módulos confirmados/parciais/não confirmados
- `docs/arquitetura-atual.md` — detalhe técnico com referências de arquivo
- `docs/regras-de-negocio.md` — regras de negócio por nível de confiança
- `docs/banco-de-dados.md` — schema, RLS, riscos multi-tenant
- `mem/index.md` — decisões e convenções já validadas com o usuário (ler antes de sugerir arquitetura nova)
- `.claude/rules/` — regras específicas por área (frontend, supabase, segurança/LGPD, git/Lovable)
- `.claude/skills/` — `/auditar-modulo`, `/corrigir-bug-seguro`, `/validar-regra-clinica`, `/preparar-prompt-lovable`
