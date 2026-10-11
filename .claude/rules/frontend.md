---
description: Regras para código React/TypeScript (componentes, hooks, rotas)
paths:
  - "src/components/**"
  - "src/hooks/**"
  - "src/routes/**"
  - "src/design-system/**"
---

# Regras — Frontend (React / TypeScript)

Aplicam-se a qualquer alteração dentro de `src/components/`, `src/hooks/`, `src/routes/`, `src/design-system/`.

1. **Preserve o padrão visual existente.** O projeto usa shadcn/ui (`style: new-york`) + Tailwind 4 + Radix. Não introduza outra biblioteca de UI, outro sistema de espaçamento/cor, ou componentes fora do padrão `src/components/ui/` sem necessidade comprovada.

2. **Reutilize componentes existentes antes de criar novos.** Antes de escrever um componente, procure algo equivalente em `src/components/` (e nos hooks de `src/lib/*.functions.ts`). Duplicar lógica entre módulos é considerado bug arquitetural neste projeto (`mem/preferences/arquitetura-plataforma.md`, item 7).

3. **Evite duplicação de helpers.** Formatação de moeda, data, CPF etc. já tem util central (`src/lib/financeiro/format.ts`, `src/lib/date-utils.ts`, `src/lib/cpf.ts`). Já existem ~18 reimplementações locais de formatação de moeda no código — não adicione mais uma; se encontrar uma, prefira migrá-la para o util central como parte da tarefa, não como "extra" não solicitado.

4. **Mantenha responsividade.** O projeto tem histórico de telas cortando informação/exigindo rolagem em mobile e tablet (relatos reais de uso). Ao alterar uma tela, teste pelo menos em largura mobile antes de considerar concluído.

5. **Trate sempre os três estados de dado assíncrono**: loading, erro e vazio. Não assuma que uma query sempre retorna dado — o padrão do projeto usa TanStack Query com `retry: 1` e `refetchOnWindowFocus: false` (ver `src/router.tsx`), então falhas silenciosas não são re-tentadas automaticamente pela UI.

6. **Não use `any` sem justificativa por escrito no código.** O projeto já tem ~488 ocorrências de `@typescript-eslint/no-explicit-any` (dívida técnica conhecida) — não aumente esse número. Se o tipo do Supabase gerado (`src/integrations/supabase/types.ts`) já cobre o caso, use-o em vez de `any`/`as never`.

7. **Preserve acessibilidade.** Use os primitivos Radix/shadcn como estão (eles já trazem ARIA correto) — não substitua por `<div onClick>` cru. Labels de formulário sempre associados ao input (`htmlFor`/`id`).

8. **Evite alterações globais para corrigir problema local.** Se um bug aparece em uma tela específica, corrija o componente/hook específico. Não refatore utilitário compartilhado "de passagem" — isso já causou regressões cruzadas neste projeto (ver módulos v1/v2 coexistindo justamente para isolar risco).

9. **Não substitua bibliotecas existentes** (TanStack Router/Query, Radix, Tiptap, react-hook-form + zod, dompurify) por alternativas, mesmo que pareçam mais simples, sem necessidade concreta e aprovação explícita.

10. **Padrão v1/v2**: vários módulos têm uma versão clássica e uma `-v2` sob feature flag (`use-*-v2-flag.ts`). Ao corrigir um bug, verifique se ele existe em ambas as versões — corrigir só uma reintroduz a divergência que motivou a criação das flags.
