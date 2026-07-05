
# A5 — Orçamentos V2 (dev-only, atrás de flag)

Escopo: recriar `/app/orcamentos` como painel operacional, aplicando o mesmo padrão validado em Caixa V2 e Menu V2. Nada de mudança em lógica de negócio (criação, conversão, impressão, splits, cobrança). Só apresentação, filtragem, virtualização e navegação.

## 1. Estrutura de rollout (idêntico ao Caixa V2)

- Flag `orcamentos_v2` (default OFF) — hook `use-orcamentos-v2-flag.ts` reaproveitando o padrão de `use-caixa-v2-flag.ts`.
- Rota dev isolada: `/app/dev-orcamentos-shell` (nunca substitui a rota atual).
- Tela clássica `/app/orcamentos` permanece **100% intacta**.
- Promoção só depois da validação visual, e inicialmente apenas para admin/gestor (mesmo modelo do `caixa-v2-mount.tsx`).
- Recepção, financeiro e demais perfis continuam no clássico até liberação explícita.

## 2. Layout do shell V2

Usa `ListShell` já existente (`src/components/list-shell/`) para consistência com Caixa/Clientes futuros.

```
┌ Orçamentos                                    [Novo]  [Exportar] ┐
│ 🔍 Busca forte: paciente, nº, procedimento, valor, período       │
├──────────────────────────────────────────────────────────────────┤
│ [ Todos 128 ] [ Abertos 41 ] [ Aprovados 22 ] [ Convertidos 47 ] │
│                          [ Recusados 12 ] [ Expirados 6 ]        │
│ Chips: [Particular] [Associado] [Cartão de Benefícios]           │
│        [Hoje] [7d] [30d] [Personalizado]  [Com pendência]        │
├──────────────────────────────────────────────────────────────────┤
│ ● Maria Silva · #ORC-1042 · há 2h                     R$ 1.240   │
│   3 itens · Dr. Marcos · [Particular]  [🟢 Aprovar] [Converter]  │
│   ─────────────────────────────────────────────────────────────  │
│ ● João Santos · #ORC-1041 · há 3h                     R$ 850     │
└──────────────────────────────────────────────────────────────────┘
                                                        [Compacto]
```

- **Busca forte** debounced (200ms), controlada, persistida em `?q=`.
- **Abas por status** (Todos / Abertos / Aprovados / Convertidos / Recusados / Expirados) com contadores via `count head:true`.
- **Chips (quick filters)**: tipo de pagador (Particular / Associado / Cartão de Benefícios — **zero "Convênio"**), período rápido, "com pendência".
- **Cards** (não linhas de tabela) com hierarquia: paciente + nº, valor, itens, médico, badge de tipo, ações primárias.
- **Modo compacto** (Ctrl+Shift+C) reduz altura e esconde subtítulo.
- **Scroll infinito** via `VirtualList` do `list-shell/` — página de 50, prefetch quando faltarem 10.
- **Drawer lateral** ao clicar no card: detalhes, itens, histórico, ações (mesmas do clássico, reaproveitando componentes existentes: `ConversaoOrcamentoDialog`, `HistoricoOrcamentoDialog`, `printOrcamento`).

## 3. Filtros e URL

Query params validados (Zod + `fallback`):
`q`, `status`, `tipo`, `periodo`, `de`, `ate`, `compacto`, `pendencia`.
Persistência no URL para deep-link e refresh sem perder estado.

## 4. Nomenclatura

- **Particular / Associado / Cartão de Benefícios**. Nunca "Convênio" no DOM.
- Teste Playwright verifica `document.body.innerText` sem "Convênio".

## 5. Regras de negócio — inalteradas

- Criação, edição, itens, conversão em pagamento, impressão, auditoria, splits, cobrança e permissões seguem exatamente como no clássico.
- V2 apenas **consome** as mesmas queries + mesmas mutations.
- Nenhuma tabela, RLS, edge function ou server function nova.

## 6. Arquivos

Novos:
- `src/hooks/use-orcamentos-v2-flag.ts`
- `src/components/orcamentos-v2/orcamentos-shell.tsx`
- `src/components/orcamentos-v2/orcamento-card.tsx`
- `src/components/orcamentos-v2/orcamento-drawer.tsx`
- `src/components/orcamentos-v2/quick-filters.tsx`
- `src/routes/_authenticated/app.dev-orcamentos-shell.tsx`

Intocados:
- `src/routes/_authenticated/app.orcamentos.tsx` (clássico)
- Componentes de conversão, impressão, histórico, splits.

## 7. Riscos

| Risco | Mitigação |
|---|---|
| Query pesada em `orcamento_itens` para contagem | usar `count head:true` na aba ativa; agregações client-side sobre página atual |
| Divergência de status entre clássico e V2 | reusar mesma view/RPC; nada de status calculado no cliente que não exista no clássico |
| Realtime overhead | subscribe único no `orcamentos` da clínica, throttle 500ms |
| Flag on quebrando build | mount fica em rota dev isolada, `caixa-v2-mount` pattern |
| "Convênio" reaparecer via componente compartilhado | teste Playwright falha o promote |

## 8. Rollback

- Flag `orcamentos_v2` OFF → rota `/app/orcamentos` clássica intacta.
- Rota dev pode ser deletada sem impacto.
- Nenhuma migração, nenhum dado tocado.

## 9. Testes (Playwright em `/tmp/browser/orcamentos-v2/`)

1. Rota `/app/dev-orcamentos-shell` carrega, sem erros de console.
2. Busca por nome retorna resultados < 500ms após debounce.
3. Abas trocam contagem e filtragem.
4. Chips somam com abas (AND).
5. Scroll infinito carrega página 2 automaticamente.
6. Modo compacto altera altura dos cards.
7. Drawer abre, mostra itens, aciona conversão (sem finalizar) e fecha.
8. Impressão dispara `printOrcamento` (mock).
9. Zero "Convênio" no DOM.
10. Mobile 390×844: cards empilhados, abas com scroll horizontal.
11. Flag OFF → `/app/orcamentos` clássico continua idêntico.
12. Flag ON só para admin/gestor no mount de promoção (fase seguinte).

## 10. Medição

| Métrica | Clássico | Meta V2 |
|---|---|---|
| Tempo até primeira lista | ~1.5s | <500ms |
| Cliques até aprovar orçamento | 3 | 1 |
| Info visível sem abrir | 3 campos | 6 campos |
| Filtrar por status | via busca | 1 clique |

## 11. Fora de escopo (fica para depois)

- Promoção controlada para `/app/orcamentos` (fase A5.2, mesmo modelo do `caixa-v2-mount`).
- Liberação para recepção (só após validação visual do usuário).
- Qualquer alteração em conversão/cobrança/splits.

**Aguardando aprovação para implementar A5 Fase 1 (shell dev + flag).**
