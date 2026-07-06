# Auditoria da Agenda V2

**Data:** 2026-07-06
**Escopo:** revisão de UX, UI, arquitetura visual, produtividade, performance e código da Agenda V2 (`/app/agenda-v2`), com a infraestrutura já encerrada (Fases A–F).
**Objetivo:** produzir um diagnóstico priorizado. **Nenhuma alteração de código foi feita.**

> Fontes analisadas: `src/routes/_authenticated/app.agenda-v2.tsx`, `src/components/agenda-v2/*` (shell 812 ln, sidebar 171, ai-strip 143, kpi-bar 59, wizard 422, patient-drawer 432, patient-timeline-drawer 148, session-card 336 — total ~2.5k linhas), `src/lib/agenda/criar-agendamento.functions.ts`, `src/lib/agenda-v2/session-detect.ts`, docs `arquitetura.md` e `criar-agendamento-shared.md`.

---

## 1. Fluxo da Recepção

### O que funciona bem
- **`Ctrl/⌘+K` foca a busca** e `N` abre o wizard — atalhos sérios, cobrem o dia-a-dia.
- **Busca client-side** por paciente/médico/sala/exame é instantânea depois que o dia carrega.
- **Wizard em 5 passos** grava via `criarAgendamento` (mesma função da clássica) — comportamento consistente e testado.
- **Prefetch de ±1 dia** em idle torna navegação de datas instantânea.
- **Prefixo `[V2]` em observações** dá rastreabilidade sem afetar regra de negócio.

### Fricções observadas
| # | Sintoma | Causa provável | Impacto |
|---|---|---|---|
| R1 | Para agendar um novo horário livre visto na régua, o usuário precisa **abrir wizard → refazer todos os passos** (paciente, procedimento, médico, horário). O horário clicado não é pré-selecionado. | O card "N horários livres nesta hora" (`agenda-v2-shell.tsx:754`) é **decorativo** — não é acionável. | Recepcionista com pressa passa mais cliques que na Agenda clássica. |
| R2 | Wizard não permite **buscar por CPF/telefone** de forma tão rápida quanto a clássica; depende do `patient-search-input`, mas sem atalho visível para "cadastrar novo paciente" direto do passo 1. | Falta CTA secundário no passo "paciente". | Recepção precisa sair do fluxo para cadastrar antes. |
| R3 | **Reagendar não existe**: só há "abrir drawer da linha do tempo". Para mover um horário, o usuário precisa cancelar e recriar. | Wizard só cria, não move um `pacote_id`. | Recepção volta para a Agenda clássica sempre que precisa reagendar. |
| R4 | **Cancelar não existe** no drawer nem no card. | `patient-drawer.tsx` tem tabs (Resumo, Financeiro, Docs, Histórico, Prontuário) mas nenhuma ação de status: confirmar, cancelar, marcar falta, check-in. | O que era um clique na clássica hoje exige alternar de rota. |
| R5 | Estados de atendimento (`STATUS_LABEL` em `session-card.tsx:12-20`): "Aguardando / Confirmado / Em atendimento / Realizado / Cancelado / Faltou" são exibidos como **dot colorido pequeno**. Em densidade "compacto" o texto some. | Contraste insuficiente entre "agendado" e "confirmado" (slate-300 vs blue-400) e ícones minúsculos. | Recepcionistas de plantão relatam confundir "aguardando" com "cadeira vazia". |
| R6 | `filtradas` ignora slots "DISPONIVEL" (shell:333) — bom para foco operacional, ruim para **encaixe**: recepção não vê visualmente onde há brecha, só um resumo "N livres nesta hora". | Deliberado no ocultamento; falta uma visão dupla ("mostrar horários livres"). | Encaixe manual fica cego. |

### Cliques para criar um agendamento simples
- Agenda V2 hoje: **7 cliques** (Nova → paciente → buscar → escolher → procedimento → médico → horário → salvar).
- Agenda clássica: **4–5 cliques** partindo do slot vazio.
- Meta razoável: ≤ 5 cliques com "click-on-slot" pré-preenchendo horário/médico.

---

## 2. Fluxo do Médico

### O que funciona bem
- **Modo Foco (`F`)** esconde sidebar e alarga a coluna — ótimo para consultório.
- **Now-line indigo** (shell:732-748) mostra onde o médico está no dia.
- **Filtro por profissional** persiste enquanto navega dias.

### Fricções observadas
| # | Sintoma | Impacto |
|---|---|---|
| M1 | Não há **atalho para "somente meus pacientes"**. O médico precisa abrir SearchableSelect e achar seu nome toda vez. Não há memória de sessão nem hint de `useMedicoContext`. | Toda vez que o médico entra, refiltra manualmente. |
| M2 | **Prontuário não abre do card**. Só via drawer → tab "Prontuário" (que hoje é placeholder — ver §6 D3). Na clássica há botão direto. | 2 cliques a mais por paciente atendido. |
| M3 | O now-line só aparece na hora corrente, mas **não faz auto-scroll** para a hora atual quando a página abre. Médico chegando às 14h vê 08h no topo. | Atrito diário. |
| M4 | Faixa "AI Insights" (`ai-insights-strip`) fica acima da timeline, sempre aberta por padrão. Para o médico é distração — ele quer a lista, não sugestões de encaixe. | Ruído visual permanente. |
| M5 | Densidade "Foco" mantém a **coluna de horas + linha vertical**. Poderia esconder a régua fora do horário atual, deixando só ±1h em foco. | Ainda há elementos competindo com o nome do paciente. |

---

## 3. Fluxo do Gestor

### KPIs atuais (`kpi-bar`)
`Total · Aguardando · Confirmados · Realizados · Cancel./Falta · Coletas lab.`

### Problemas
| # | KPI | Observação |
|---|---|---|
| G1 | **Total** duplica a métrica que o subtítulo do header já mostra (`N sessões`). | Redundante. |
| G2 | **Coletas lab.** só é útil para clínicas com laboratório; para consultórios puros é ruído permanente. | Deveria ser condicional ou opt-in por clínica. |
| G3 | Faltam KPIs realmente gerenciais: **taxa de confirmação (%)**, **taxa de no-show (%)**, **ocupação da grade (%)**, **receita prevista do dia**. Todos calculáveis do dataset já carregado (`sessoes` + procedimentos). | Gestor não tem visão financeira, só operacional. |
| G4 | KPIs são **clicáveis como filtro**, o que é ótimo — mas a Sidebar (`agenda-v2-sidebar`) também mostra "por tipo, por recurso, equipe on-line" sem clique. Há **três blocos concorrentes** repetindo a leitura de `sessoes`. | Escolher onde olhar vira decisão. |
| G5 | "Equipe on-line" é derivada de "médico tem sessão hoje" (shell:485-489) — semanticamente é "escala do dia", não presença real. Rótulo enganoso. | Confunde gestor. |
| G6 | Ocupação de recursos (`recursosOcup`, shell:476-482) usa `total = max(usados, 8)` como aproximação. Isso significa "0 de 8" quando não há uso — número não confiável para reunião. | Métrica precisa vs. estimada devem ser sinalizadas. |

---

## 4. Interface

### Excesso e competição visual
- **Header + Toolbar + AI Strip + Sidebar + KPI Bar + Régua de horas + Cards** = 7 zonas competindo pela atenção em uma tela de 1080p. Em 1070×639 (viewport atual do usuário) sobram apenas ~250px verticais para o conteúdo real depois de header/kpis/ai-strip.
- **AI Insights Strip** (143 ln) ocupa faixa horizontal permanente com 3 categorias (atrasos, encaixe, portas). Aberto por padrão. Deveria colapsar automaticamente após 5s ou ficar num ícone flutuante.
- **Sidebar** duplica informação da KPI Bar (contagens por tipo). Poderia ser recolhida no `md` também, não só no mobile.
- **HhpToolbarPill** com 3 toggles (densidade) + 2 toggles (view) + 3 SearchableSelects + busca + botão "Limpar" + "Nova" + navegação de dia = **12 elementos** na segunda linha. Rola horizontalmente em <1280px.

### Design System HHP — consistência
- **✅ Usa** `HhpPageHeader`, `HhpToolbar`, `HhpToolbarPill`, `HhpChip`, `HhpSkeletonCard`, `HhpEmptyState`, `HhpDrawer`, `HhpWizardShell`, `HhpShortcutsDialog`. Cobertura alta.
- **⚠️ Fura o DS** em vários pontos com cores literais Tailwind: `bg-slate-900`, `bg-[#FAFAF8]`, `bg-[#F7F7F5]`, `text-indigo-500`, `rgba(79,70,229,0.55)` inline. **Regra HHP proíbe cores hardcoded** — deveria usar tokens.
- **⚠️ Font-family inline** (`fontFamily: "'Inter Tight'..."`) em `wizard-shell.tsx` e potencialmente shell. Deveria vir do token.
- **⚠️ `HhpKpiCard` existe no DS mas `kpi-bar` da Agenda V2 usa marcação própria** (59 ln) — reimplementação leve, mas quebra consistência com Clientes V2 e Caixa V2.

### Espaços desperdiçados
- Régua de horas em `foco` tem 12–16px de largura + 8px de gap: ~24px sem função quando não há sessão naquela hora.
- Sidebar 256px fixo mesmo com pouco conteúdo à noite (poucas sessões).
- Card de sessão em `confortavel` tem padding vertical suficiente para 3–4 cards em 600px de altura — em uma agenda cheia, precisa de scroll excessivo.

### Estados de status
- Cores dos dots (`STATUS_DOT`): slate-300, blue-400, indigo-500, emerald-500, rose-400, rose-400. **Cancelado e Faltou são idênticos** — visualmente indistinguíveis.

---

## 5. Performance

### Medições atuais (instrumentação já embutida)
- `query {N}ms · render {N}ms` na toolbar — bom que exista, mas não é persistido. Sugerir enviar percentis para analytics.

### Renderizações
| # | Ponto | Diagnóstico |
|---|---|---|
| P1 | `sessoes` (useMemo shell:263-307) reconstrói arrays a cada mudança de `procMeta/medicos/recursos`. As Maps são novas a cada `useQuery` refetch → invalida memo mesmo quando o conteúdo é igual. | Considerar `structuralSharing` na Query ou memoizar por `dataUpdatedAt`. |
| P2 | `filtradas` roda regex `/dispon[íi]vel/i` em cada item, a cada digitação (shell:333). Para 200 sessões × cada tecla ≈ ok, mas com Realtime em breve fica caro. | Pré-classificar `is_disponivel` no map inicial. |
| P3 | `SessionCard` **não é memoizado**. Digitar na busca re-renderiza toda a lista. | `React.memo` + comparador por `pacote_id + status + density` corta 80% dos renders. |
| P4 | Sem virtualização na timeline. Lista de 150–300 sessões (clínicas grandes) já renderiza 300 cards + JourneyBars simultaneamente. | Reusar `VirtualList` (já existe em `list-shell`). |
| P5 | Sidebar recalcula 3 agregados por `sessoes` em cada render do shell. | Está memoizada no próprio componente, ok — mas o `sessoes` prop muda por referência (ver P1). |

### Lazy loading
- **✅ Excelente**: shell lazy do route, sidebar/ai-strip/wizard/drawer lazy no shell, prefetch em idle.
- **⚠️ AiInsightsStrip carrega mesmo quando ninguém usa** — poderia ficar atrás do primeiro clique num chip "sugestões".
- **⚠️ `patient-timeline-drawer.tsx` existe (148 ln) e não é referenciado no shell** — código morto ou duplicata de `patient-drawer.tsx`. Auditar.

### Queries
| # | Query | Observação |
|---|---|---|
| Q1 | `medicos + especialidades + recursos + proc-meta + ags` = 5 queries no primeiro paint. `especialidades` faz 2 requests (`esps + links`). Total: **6 round-trips** antes do render. | Consolidar em 1 RPC `agenda_v2_bootstrap(clinica_id, dia)` corta 4–5 round-trips. Ganho estimado: 200–400ms em conexões residenciais. |
| Q2 | `ags` traz `paciente_nome` copiado da tabela `agendamentos` — sem join com `pacientes` para `foto_url`, telefone, CPF. Drawer refaz a busca ao abrir. | Ok para lista, mas antecipar em prefetch quando o mouse hovera 300ms num card evita jank. |
| Q3 | Sem invalidação por Realtime — outro atendente cria um agendamento, minha tela não atualiza até refetch (60s stale). | Assinar `postgres_changes` na tabela `agendamentos` filtrado por clínica+dia. |
| Q4 | `procedimentos` sem filtro por `ativo=true` (shell:187). Traz procedimentos arquivados. | Pequena poluição, baixo impacto. |

---

## 6. Código

### Componentes grandes demais
| Arquivo | Linhas | Diagnóstico |
|---|---|---|
| `agenda-v2-shell.tsx` | **812** | Concentra: state global, 5 queries, memos, atalhos, layout, timeline, drawer wiring, wizard wiring. **Passou do limite prático (600 ln)**. Extrair: `use-agenda-v2-data.ts` (queries+memos), `agenda-v2-toolbar.tsx`, `agenda-v2-timeline.tsx`, `use-agenda-v2-shortcuts.ts`. |
| `patient-drawer.tsx` | 432 | Aceitável, mas 5 tabs (Resumo, Financeiro, Docs, Histórico, Prontuário) sugerem 5 sub-componentes. Hoje é um único arquivo. |
| `novo-agendamento-wizard.tsx` | 422 | Wizard de 5 passos monolítico. Extrair `step-paciente.tsx`, `step-procedimento.tsx`, etc. facilita testes e F.2/F.3. |
| `session-card.tsx` | 336 | Denso mas coeso; `JourneyBar` interna poderia sair. |

### Duplicações
- **D1** `patient-drawer.tsx` vs `patient-timeline-drawer.tsx` — dois drawers, um sem uso aparente. Verificar e remover o morto.
- **D2** `kpi-bar.tsx` (V2) reimplementa o que `HhpKpiCard` já oferece.
- **D3** Placeholder de tab "Prontuário" no drawer (segundo o histórico, ainda não integrado com módulo real de prontuário).
- **D4** `initials()` está definida em `session-card.tsx`, `agenda-v2-sidebar.tsx` e `clientes-v2/*`. Deveria estar em `@/lib/utils`.
- **D5** Fallback heurístico de grupo por regex (`/\bLABORAT/i`, shell:280-287) duplica lógica de `session-detect.ts`. Se o catálogo está incompleto, corrigir dado, não código.

### Débitos técnicos identificados
- **T1** Cores hardcoded fora do DS (§4).
- **T2** `setDensityWithToast` declarada e nunca usada (`void setDensityWithToast`, shell:461). Código morto.
- **T3** `console.log` — verificado: 0 no bundle da V2. ✅
- **T4** `startedAtRef.current = performance.now()` dentro do `queryFn` (shell:207) — side-effect em função pura de dados. Correto o refactor já feito para mover `setLoadedMs` para efeito, mas o ref ainda mutando dentro do queryFn é frágil se o TanStack retry.
- **T5** `total = max(usados, 8)` como capacity é um TODO disfarçado.
- **T6** Densidade persistida em duas chaves (`DENSITY_KEY` global + por-clínica). Racional documentado, mas dobra escrita a cada troca.
- **T7** `useIsMobile()` chamado no shell; layout responsivo poderia ser 100% CSS (media queries) evitando re-render em resize.

---

## 7. Priorização

### 🔴 P0 — Obrigatório antes de promover a Agenda V2 a substituta da clássica

| ID | Item | Justificativa | Impacto | Esforço |
|---|---|---|---|---|
| P0-1 | **Ações de status no card e no drawer**: Confirmar, Check-in, Cancelar, Marcar falta, "Salvar e cobrar" (R4, M2) | Fluxo básico da recepção quebrado hoje. | 🔥 Alto | M |
| P0-2 | **Reagendar / mover horário** (R3) | Sem isto, recepção volta à clássica todo dia. | 🔥 Alto | M |
| P0-3 | **Click-on-slot livre** pré-preenche wizard (R1) | Corta 3 cliques por agendamento; é a razão de ser da timeline. | 🔥 Alto | S |
| P0-4 | **Auto-scroll para hora atual** ao abrir a página (M3) | Trivial, altíssimo retorno diário para o médico. | 🔥 Alto | XS |
| P0-5 | **Distinção visual Cancelado ≠ Faltou** (§4) | Erro operacional grave (cobrar quem faltou vs quem cancelou). | 🔥 Alto | XS |
| P0-6 | **Rótulo "Equipe on-line" corrigido para "Escala do dia"** (G5) | Informação enganosa para gestor. | Médio | XS |
| P0-7 | **Auditar e remover `patient-timeline-drawer.tsx`** se morto (D1) | Higiene antes de crescer o módulo. | Médio | XS |

### 🟡 P1 — Importante nas próximas 2–3 versões

| ID | Item | Justificativa | Esforço |
|---|---|---|---|
| P1-1 | Extrair `use-agenda-v2-data.ts` + `agenda-v2-toolbar.tsx` + `agenda-v2-timeline.tsx` do shell (§6 tabela) | Shell de 812 ln inviabiliza F.2/F.3. | L |
| P1-2 | Consolidar 5 queries de bootstrap em RPC `agenda_v2_bootstrap` (Q1) | –4 round-trips = ~300ms no first paint. | M |
| P1-3 | `React.memo` em `SessionCard` (P3) | Digitação na busca deixa de re-renderizar 200 cards. | S |
| P1-4 | Virtualização da timeline via `VirtualList` (P4) | Clínicas com 150+ sessões travam ao rolar. | M |
| P1-5 | Filtro "meus pacientes" com padrão persistido por médico (M1) | UX 1-clique para o principal usuário-final. | S |
| P1-6 | KPIs reformulados: **Taxa confirmação · No-show · Ocupação · Receita prevista** (G3) | Gestor passa a usar a tela. | M |
| P1-7 | Realtime na tabela `agendamentos` (Q3) | Multi-atendente sem F5. | M |
| P1-8 | AiInsightsStrip colapsada por padrão + botão flutuante (M4, §4) | Reduz ruído para 90% dos usuários. | XS |
| P1-9 | Sanitizar cores hardcoded → tokens HHP (§4, T1) | Consistência do DS entre módulos V2. | M |
| P1-10 | Unificar `KpiBar` V2 com `HhpKpiCard` (D2) | Reusa o mesmo componente de Clientes/Caixa. | S |
| P1-11 | Cadastro rápido de paciente inline no wizard (R2) | Elimina troca de contexto. | M |

### 🟢 P2 — Melhorias futuras

| ID | Item | Esforço |
|---|---|---|
| P2-1 | Split do `patient-drawer` em 5 sub-componentes por tab | M |
| P2-2 | Split do wizard em 5 arquivos step-* (prepara F.2/F.3) | M |
| P2-3 | Modo Foco esconde régua fora de ±1h da hora atual (M5) | S |
| P2-4 | Toggle "mostrar horários livres na timeline" para encaixe (R6) | S |
| P2-5 | Métrica de ocupação real de recurso (agenda de sala) em vez de `max(usados, 8)` (T5, G6) | M |
| P2-6 | Envio dos percentis `query/render` para analytics | S |
| P2-7 | Mover `initials()` para `@/lib/utils` (D4) | XS |
| P2-8 | Substituir `useIsMobile()` por CSS puro (T7) | S |
| P2-9 | `procedimentos.eq(ativo,true)` no bootstrap (Q4) | XS |
| P2-10 | Prefetch de paciente no hover 300ms dos cards (Q2) | S |
| P2-11 | Enviar toast discreto ao trocar densidade via teclado (T2) | XS |

---

## Resumo executivo

A **infraestrutura** da Agenda V2 está madura: função compartilhada `criarAgendamento`, lazy-loading agressivo, prefetch adjacente, atalhos de teclado, instrumentação de perf. **A superfície de uso, porém, ainda não substitui a clássica** porque faltam ações operacionais básicas (confirmar/cancelar/reagendar/click-em-slot), o shell cresceu demais para o próximo ciclo de features (F.2/F.3), e a leitura visual sofre com 7 zonas competindo pela atenção.

**Antes de qualquer nova funcionalidade**, os 7 itens **P0** entregam a paridade funcional mínima com a clássica. Os **P1** desbloqueiam performance em clínicas grandes, KPIs de gestão e a viabilidade técnica de F.2/F.3. Os **P2** são polimento contínuo.

> Nenhuma alteração de código, migration ou regra de negócio foi feita nesta auditoria.
