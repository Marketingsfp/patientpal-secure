# A4 — Refactor Caixa (redução de paginação + listas rápidas)

Feature flag: `caixa_v2` em `profiles.preferencias_ui.flags`. Rota de pré-visualização isolada: `/app/dev-caixa-shell` (não altera `/app/caixa` até aprovação). Reaproveita `ListShell` + `VirtualList` do A1 e `UniversalSearch` do A2.

---

## 1. Layout proposto

Densidade compacta, foco em operação contínua da recepção. Duas colunas em desktop, empilhado em mobile.

```
┌─ Topbar da tela ───────────────────────────────────────────────┐
│  Caixa · [Sessão #123 · aberta há 2h14]        [Fechar caixa] │
│  Saldo: R$ 1.240,00   Recebido: R$ 3.180,00   Sangrias: R$120 │
├─ Ações rápidas (pill row, sticky) ─────────────────────────────┤
│ [+ Receber] [+ Despesa] [+ Suprimento] [+ Sangria] [Imprimir] │
├─ Coluna esquerda (2/3) ────────┬─ Coluna direita (1/3) ───────┤
│ Busca forte (UB embutida)      │ Fila do caixa (pacientes)    │
│ [Abas: Hoje · Sessão · Todos]  │ virtualizada, click = receber│
│ Chips: Recebimento · Despesa · │                              │
│        Sangria · Suprim.       │                              │
│ Lista virtualizada (linhas 40px)│                              │
│  hora · tipo · descrição · R$  │                              │
│  → scroll infinito             │                              │
└────────────────────────────────┴──────────────────────────────┘
```

Modo compacto (toggle no topbar): remove coluna direita, linhas 32px, esconde subtotais na linha; ideal para recepção usar em monitor pequeno.

## 2. Busca

- Input único no topo da lista (reaproveita `ListShell` — debounce 200ms).
- Reconhece prefixos da UB (A2): `p:` paciente, `r:` recibo, `v:` valor, `d:` data (`d:hoje`, `d:07/07`).
- Sem prefixo: match em descrição + nome paciente + valor formatado + forma de pagamento.
- CPF/telefone puro entra no atalho da UB e abre paciente sem sair do caixa.

## 3. Filtros rápidos (chips)

Chips toggláveis, múltipla seleção, persistidos em URL (`?tipo=recebimento,despesa`):

- Tipo: Recebimento · Despesa · Sangria · Suprimento · Abertura/Fechamento
- Forma: Dinheiro · Pix · Cartão · Boleto
- Período: Hoje · 7d · 30d (só na aba "Todos")
- "Somente estornáveis" (recebimentos não estornados)

Chip ativo = badge com X. "Limpar filtros" aparece quando qualquer chip está ligado.

## 4. Abas

Três abas apenas (menos é mais):

- **Hoje** — todos movimentos da data atual, todas as sessões.
- **Sessão atual** — só a sessão aberta do usuário (default se houver sessão aberta).
- **Todos** — histórico completo com filtro de período obrigatório.

Contadores nas abas via `count` da `StatusTab` (agregado leve, `head: true` no query).

## 5. Modo compacto

Toggle 🡒 `Ctrl+Shift+C`. Persistido em `preferencias_ui.caixa.compact`.

- Linhas 32px (vs 40px normal).
- Esconde coluna "forma de pagamento" (vira ícone).
- Esconde subtotais inline.
- Aumenta densidade para ~24 linhas visíveis em 1080p.

## 6. Scroll infinito

- Substitui a paginação atual (páginas de 50).
- Página inicial: 60 itens. Batch subsequente: 40. Sem "carregar mais" — dispara ao chegar a 400px do fim (`endThresholdPx` já suportado em `VirtualList`).
- Query com `range()` + `order created_at desc`.
- Estado da lista preserva scroll ao voltar de dialog (recibo, estorno).
- Realtime: novo movimento inserido no topo com fade-in leve; badge "3 novos" se scroll não está no topo.

## 7. Ações críticas preservadas

Todas as ações da tela atual continuam disponíveis, apenas reagrupadas:

- Abrir caixa / Fechar caixa
- Novo recebimento (com vínculo a agendamento/orçamento)
- Nova despesa
- Sangria / Suprimento
- Ver detalhe do movimento (drawer lateral, não navega)
- Solicitar estorno (`SolicitarEstornoDialog` existente)
- Imprimir recibo (`print-gr.ts`)
- Exportar Excel (`exportToExcel`)
- Fila do caixa → receber pagamento de agendamento
- Vínculo com lançamento financeiro

Nada é removido. Somente reordenado por frequência de uso.

## 8. Riscos

| Risco | Prob | Impacto | Mitigação |
|---|---|---|---|
| Recepção não achar botão que usava | Média | Alto | Flag off por padrão + rota dev isolada; ações críticas continuam com mesmo rótulo |
| Perda de scroll ao abrir dialog | Média | Médio | Preservar posição via ref no `VirtualList` |
| Realtime duplicar linhas | Baixa | Médio | Dedup por `id` no reducer |
| Query pesada em "Todos" sem período | Média | Alto | Período obrigatório na aba "Todos" (default 7d) |
| Fechamento de caixa quebrar | Baixa | Crítico | Não tocar em lógica de fechamento; só na renderização |

## 9. Rollback

1. Usuário: desliga `caixa_v2` em Preferências → volta ao `/app/caixa` atual sem reload.
2. Global: default off; basta não promover.
3. Código: componente novo isolado em `src/components/caixa-v2/`; rota atual `app.caixa.tsx` permanece intocada até a promoção.
4. DB: sem migração — apenas leitura via mesma view/tabela atual.

## 10. Testes Playwright

Rota alvo: `/app/dev-caixa-shell`. Bateria:

- Abrir tela → sessão atual carrega em <500ms, primeiros 60 movimentos visíveis.
- Busca "p:joão" → filtra por paciente.
- Chip "Recebimento" + "Pix" → lista mostra só matches.
- Trocar aba Hoje ↔ Sessão ↔ Todos → contadores batem com query.
- Scroll até o fim → dispara próximo batch, sem duplicar itens.
- Novo recebimento → aparece no topo, badge "1 novo" se scrollado.
- Solicitar estorno de recebimento → dialog abre, aprova, linha marca "estornado".
- Modo compacto on → linha 32px, coluna forma vira ícone.
- Fechamento de caixa → dialog abre, valores conferem, salva.
- Mobile 390×844 → coluna única, fila do caixa vira sheet.
- Toggle `caixa_v2` off → redireciona para `/app/caixa` (atual).
- Zero ocorrências de "Convênio" no DOM.

## 11. Impacto esperado

| Métrica | Hoje | Meta v2 |
|---|---|---|
| Tempo até primeiro movimento visível | ~1.8s | <500ms |
| Cliques para receber pagamento da fila | 3 | 1 |
| Cliques para filtrar recebimentos em dinheiro do dia | 5 | 2 |
| Movimentos visíveis sem scroll (1080p) | ~12 | ~24 (compacto) |
| Requests ao rolar 500 itens | 10 (paginação) | 8 (infinito com batch 40) |
| Perda de contexto ao abrir dialog | scroll reseta | preservado |

Meta operacional: recepção conclui recebimento de agendamento em ≤2 cliques a partir da fila.

## 12. O que NÃO muda nesta fase

- Lógica de abertura/fechamento de caixa.
- Regras de estorno.
- Geração de recibo.
- Vínculo com lançamento financeiro.
- Fila do caixa (query e regras) — só muda a apresentação.

---

**Aguardando aprovação para implementar A4 fase 1 em `/app/dev-caixa-shell` atrás da flag `caixa_v2`.** Após estável, promovemos para `/app/caixa` mantendo o antigo como fallback pela flag, mesmo modelo do A7.
