# Auditoria de Navegação & Paginação — ClinicaOS

Diagnóstico completo + plano priorizado. **Nada é implementado nesta fase.**

---

## 1. Diagnóstico do estado atual

### 1.1 Menu (fonte: `permissoes-presets.ts`, `app-shell.tsx`)
- 60+ módulos registrados, agrupados em ~10 seções.
- Sub-rotas hoje aparecem como itens de menu (Financeiro tem 12, Cartão de Benefícios 6, Marketing 5, RH 5, Serviços 4).
- Sem busca de tela. Sem favoritos. Sem "recentes".

### 1.2 Paginação e limites (varredura em `src/routes/_authenticated/`)
| Tela | Padrão atual | Volume típico |
|---|---|---|
| Clientes | Busca server-side + `limit 120` sem paginação | 10k+ pacientes |
| Agenda | `limit` por dia, sem virtualização | 50–300/dia |
| Agenda Express | Lista longa, sem chips | 100+ slots |
| Orçamentos | `.range()` clássico + Pagination | 500+ |
| Caixa | `.range()` + Pagination | 200–1000/dia |
| Financeiro (movimento/atendimentos/notas/relatórios) | `.range()` + Pagination em quase todas | 1k–100k |
| Prontuários | Lista por paciente, sem filtro por tipo | 50–500/paciente |
| Documentos | Lista plana, sem agrupamento | 100+ |
| Procedimentos | Tabela com `.range()` | 200–800 |
| Relatórios | CuboBI com paginação | variável |
| NFS-e | `.range()` + Pagination | 1k+/mês |
| Auditoria | `.range()` + Pagination | 100k+ |
| Cartão de Benefícios (5 abas) | `.range()` em todas | 500–5k |

### 1.3 Sintomas confirmados
- **Excesso de cliques:** Financeiro → Movimento → filtrar → paginar → abrir. 5+ cliques para achar um lançamento.
- **Sem busca global:** só busca dentro de cada tela.
- **Sem Ctrl+K.**
- **Sem virtualização:** listas grandes renderizam DOM inteiro (Auditoria, NFS-e, Financeiro).
- **Sem skeleton consistente:** algumas telas mostram "Carregando…", outras ficam em branco.
- **Sem chips de status:** filtros ficam escondidos em selects/comboboxes.

---

## 2. Novo padrão proposto (referência para todas as telas)

Toda lista deve seguir este esqueleto:

```
┌────────────────────────────────────────────────────────────┐
│ [🔍 Busca forte 100% width no topo — 200ms debounce]        │
├────────────────────────────────────────────────────────────┤
│ [Todos] [Abertos] [Pendentes] [Concluídos] [Cancelados]     │  ← abas por status
│ 🏷 Hoje  🏷 Semana  🏷 Mês  🏷 Unidade X  🏷 Convênio Y      │  ← chips filtros rápidos
├────────────────────────────────────────────────────────────┤
│ ▸ Hoje (12)                                                 │  ← agrupamento colapsável
│    linha compacta · linha compacta · linha compacta         │
│ ▸ Ontem (8)                                                 │
├────────────────────────────────────────────────────────────┤
│         ↓ scroll infinito / "carregar mais 50"              │
└────────────────────────────────────────────────────────────┘
```

**Regras técnicas:**
- Busca sempre server-side com RPC dedicada quando envolver >1 tabela.
- Paginação clássica **só** em Auditoria, NFS-e e Relatórios (dados regulatórios que exigem paginação numerada).
- Virtualização (`@tanstack/react-virtual`) obrigatória para listas com >200 linhas renderizadas.
- Skeleton em todo carregamento inicial (usar `<Skeleton />` já existente).
- Ctrl+K global: telas + pacientes + orçamentos + agendamentos + ações.
- Favoritos e Recentes persistidos por usuário (`profiles` + localStorage).

---

## 3. Auditoria por tela (prioridade Alta)

### 3.1 Clientes
- **Problema:** busca funciona, mas exibe só 120 primeiros. Sem chips (ativo/inativo/aniversariante). Sem virtualização.
- **Solução:** manter RPC `buscar_pacientes`, adicionar chips (Ativos, Aniversariantes hoje, Novos 30d, Sem contato 90d), virtualizar tabela.
- **Risco:** baixo. **Perf:** neutra (virtualização melhora). **Ganho:** −40% cliques.

### 3.2 Agenda
- **Problema:** dia com 200+ slots renderiza tudo. Sem chips por status/médico.
- **Solução:** virtualizar coluna do dia, chips (Confirmados, Aguardando, Faltas), agrupamento por sala.
- **Risco:** médio (agenda tem drag). **Perf:** +30% render. **Ganho:** −25% scroll.

### 3.3 Agenda Express
- **Problema:** lista longa de horários sem filtro rápido.
- **Solução:** chips (Próxima hora, Hoje, Amanhã, Este médico) + busca por paciente.
- **Risco:** baixo. **Ganho:** −50% cliques para achar horário.

### 3.4 Orçamentos
- **Problema:** paginação clássica; filtro por status escondido.
- **Solução:** abas [Rascunho|Enviado|Aprovado|Convertido|Recusado], scroll infinito, busca por paciente/número.
- **Risco:** baixo. **Ganho:** −60% cliques.

### 3.5 Caixa
- **Problema:** paginação para movimentos do dia; recepção precisa achar pagamento rápido.
- **Solução:** modo compacto padrão, abas [Sessão Atual|Hoje|Semana], busca por paciente, chip "Últimos 10 min" (Turbo).
- **Risco:** baixo. **Ganho:** −70% tempo para localizar pagamento recente.

### 3.6 Financeiro (Movimento / Atendimentos / Notas)
- **Problema:** 3 telas separadas, todas paginadas, filtros duplicados.
- **Solução:** unificar em 1 tela com abas + chips de período + busca cross-entity. Manter paginação em Relatórios apenas.
- **Risco:** médio (refactor de 3 rotas). **Ganho:** −65% cliques, menu −2 itens.

### 3.7 Prontuários
- **Problema:** lista plana por paciente.
- **Solução:** agrupamento por ano + tipo (Consulta/Exame/Anexo), filtro por médico, busca em texto do prontuário.
- **Risco:** médio (busca full-text exige RPC nova). **Ganho:** −50% tempo.

### 3.8 Documentos
- **Problema:** lista plana, sem agrupamento.
- **Solução:** agrupar por tipo (Contrato, Receita, Atestado, LGPD) + chips por status assinatura.
- **Risco:** baixo. **Ganho:** −40% cliques.

### 3.9 Procedimentos
- **Problema:** tabela paginada, difícil achar por especialidade.
- **Solução:** chips por especialidade + tipo_servico, busca fuzzy, modo compacto.
- **Risco:** baixo. **Ganho:** −50% cliques.

### 3.10 Relatórios
- **Problema:** CuboBI carrega dados demais.
- **Solução:** manter paginação numerada (é relatório), mas adicionar "salvar visão" + presets de período.
- **Risco:** baixo. **Ganho:** menor, mas evita rework.

---

## 4. Componentes base a criar

Reutilizáveis por todas as telas — construir 1x, usar 10x.

1. `<ListShell>` — busca + chips + abas + agrupamento + skeleton.
2. `<VirtualList>` — wrap de `@tanstack/react-virtual`.
3. `<CommandPalette>` — Ctrl+K, indexa rotas + entidades.
4. `<QuickFilters>` — chips com estado em URL search params.
5. `<StatusTabs>` — abas com contagem por status.
6. `<GroupedList>` — agrupamento colapsável por data/status.
7. `<CompactRow>` — linha densa (44px) padrão.
8. `<RecentFavorites>` — sidebar/dropdown "recentes + favoritos".

---

## 5. Plano priorizado

### 🔴 Alta prioridade (impacto direto na recepção/caixa)
| # | Item | Esforço | Telas | Risco | Ganho |
|---|---|---|---|---|---|
| A1 | Componentes base (`ListShell`, `VirtualList`, `CommandPalette`, `QuickFilters`) | M | infra | baixo | destrava todo o resto |
| A2 | Ctrl+K global (telas + pacientes + orçamentos) | M | global | baixo | −80% tempo para achar tela |
| A3 | Busca global no topbar | P | global | baixo | −60% cliques |
| A4 | Refactor **Caixa** (abas + busca + compact) | P | 1 | baixo | recepção mais rápida |
| A5 | Refactor **Orçamentos** (abas por status + infinite scroll) | P | 1 | baixo | −60% cliques |
| A6 | Refactor **Clientes** (chips + virtualização) | P | 1 | baixo | lida com 10k+ |
| A7 | Menu curto (7 grupos, sub-rotas viram tabs) | M | global | médio | −85% itens visíveis |

### 🟡 Média prioridade
| # | Item | Esforço | Telas | Risco | Ganho |
|---|---|---|---|---|---|
| M1 | Unificar Financeiro (Movimento+Atendimentos+Notas) | G | 3→1 | médio | menu −2, cliques −65% |
| M2 | Agenda Express — chips + busca | P | 1 | baixo | −50% cliques |
| M3 | Procedimentos — chips por especialidade | P | 1 | baixo | −50% cliques |
| M4 | Documentos — agrupamento por tipo | P | 1 | baixo | −40% cliques |
| M5 | Prontuários — agrupamento ano+tipo | M | 1 | médio | −50% tempo |
| M6 | Favoritos + Recentes (persistência) | M | global | baixo | conveniência |
| M7 | Agenda — virtualizar coluna do dia | M | 1 | médio | +30% render |

### 🟢 Baixa prioridade
| # | Item | Esforço | Telas | Risco | Ganho |
|---|---|---|---|---|---|
| B1 | NFS-e — manter paginação, adicionar presets | P | 1 | baixo | pequeno |
| B2 | Auditoria — manter paginação, adicionar chip por tabela | P | 1 | baixo | pequeno |
| B3 | Relatórios — salvar visão | M | 1 | baixo | conveniência |
| B4 | Cartão de Benefícios — chips nas 5 sub-telas | M | 5 | baixo | menor uso |
| B5 | Marketing (Leads, Campanhas, Envios) — mesmo padrão | M | 5 | baixo | menor uso |

**Esforço:** P=1–2 dias, M=3–5 dias, G=1+ semana.

---

## 6. Recomendação final

**Ordem de execução recomendada:**
1. **Sprint 1 (fundação):** A1 + A2 + A3 — sem eles, os demais viram trabalho duplicado.
2. **Sprint 2 (impacto imediato na operação):** A4 + A5 + A6 — recepção, caixa e clientes sentem no primeiro dia.
3. **Sprint 3 (menu curto):** A7 — só depois que as abas por status já existirem nas telas principais.
4. **Sprint 4 (média):** M1 → M2 → M5.
5. **Sprint 5+ (baixa):** o que sobrar, conforme demanda.

**Regras de segurança durante o refactor:**
- Nenhum item da lista Alta altera schema — só camada de UI + RPCs de busca (aditivas).
- Toda RPC nova entra como Migração aditiva, reversível.
- Cada sprint termina com bateria Playwright autenticada validando as telas afetadas.
- Nenhuma tela vai a produção sem: skeleton, empty state, error state, teste de 1k+ linhas.
- Perf: exigir `<200ms` para busca client-side e `<500ms` para RPC.

**Não faz parte desta fase:**
- Nenhuma alteração de backend/schema.
- Nenhuma implementação — só o plano acima está sendo entregue.

---

## 7. Próximo passo

Aprovar a lista Alta (A1–A7) e me autorizar a começar pelo **Sprint 1 (A1+A2+A3)**. Assim que aprovado, entrego mockup visual do novo `ListShell` + Ctrl+K antes de codar.
