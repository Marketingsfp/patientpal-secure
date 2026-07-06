# Fase E — Adoção gradual do HHP Design System na Agenda V2

Objetivo: migrar a Agenda V2 para consumir os primitivos do `src/design-system/hhp/`, mantendo aparência aprovada, sem tocar em regra de negócio e sem alterar a Agenda clássica. Cada sub-fase é atrás da flag `agenda_v2`, isolada, revertível e validada por Playwright antes da próxima.

## Princípios

- Migração **um primitivo por vez**, com PR/commit curto e verificável.
- Cada troca é **API-compatible**: o wrapper HHP recebe as mesmas props visuais já usadas hoje; nenhum callback, handler ou fluxo muda.
- **Nada em `src/components/agenda/` ou `src/routes/_authenticated/app.agenda.tsx`** é tocado.
- Se um primitivo HHP não cobrir 100% do caso, mantemos o componente atual da V2 e ampliamos o HHP em fase separada — nunca forçamos migração incompleta.

## Ordem de troca (do mais seguro ao mais sensível)

| # | Componente V2 atual | Primitivo HHP alvo | Risco | Motivo da ordem |
|---|---|---|---|---|
| E.1 | `HhpChip` interno / chips soltos em `session-card`, `kpi-bar`, filtros | `HhpChip` | Muito baixo | Puramente visual, sem estado |
| E.2 | Skeletons da timeline e KPIs | `HhpSkeletonCard` / `HhpSkeletonList` | Muito baixo | Só render de loading |
| E.3 | Estados vazios (timeline vazia, busca sem resultado) | `HhpEmptyState` | Baixo | Sem lógica, só copy + ícone |
| E.4 | Header da Agenda V2 (`agenda-v2-shell` topo) | `HhpPageHeader` | Baixo | Layout, mantém slots atuais |
| E.5 | Toolbar de filtros + pill de densidade | `HhpToolbar` + `HhpToolbarPill` | Baixo | Wrap de layout; ToggleGroup permanece |
| E.6 | `kpi-bar` cards | `HhpKpiCard` | Médio | Precisa preservar scroll horizontal mobile |
| E.7 | Painel de atalhos (dialog `?`) | `HhpShortcutsDialog` | Médio | Atalhos continuam registrados no shell |
| E.8 | `patient-drawer` shell (header, tabs container, footer sticky) | `HhpDrawer` | Alto | Conteúdo interno (tabs, timeline, ações) permanece igual |
| E.9 | `novo-agendamento-wizard` shell (stepper, footer, progress) | `HhpWizardShell` | Alto | Steps e validações intocados |

Sub-fases E.8 e E.9 só começam depois de E.1–E.7 aprovadas e estáveis por pelo menos uma rodada de validação.

## Riscos e mitigação

- **Regressão visual sutil** (padding/raio/sombra diferente) → snapshot Playwright antes/depois em cada sub-fase; ajuste feito no HHP, não no consumidor.
- **Quebra de responsividade** (mobile 390 / tablet 1024) → checklist obrigatório dos 4 breakpoints por sub-fase.
- **Perda de atalhos ou foco** ao trocar Drawer/Wizard → smoke test de teclado (`Esc`, `Enter`, `Tab`, `?`) obrigatório em E.7/E.8/E.9.
- **Divergência entre HHP e V2** durante migração parcial → sempre permitido conviver componente antigo + novo; nunca deixar tela "meio migrada" sem release de validação.
- **Vazamento para Agenda clássica** → `git status` + diff dirigido a `src/components/agenda/**` e `src/routes/_authenticated/app.agenda.tsx` ao final de cada sub-fase; qualquer alteração aborta o merge.

## Rollback

- Cada sub-fase = commit único e pequeno; rollback = reverter esse commit.
- Rollback global instantâneo: flag `agenda_v2` OFF (já em vigor por padrão) devolve 100% dos usuários à Agenda clássica, independente do estado da migração.
- Nenhuma sub-fase apaga o componente V2 antigo até E.9 concluída — assim é possível reverter apenas o wrapper HHP mantendo o resto.

## Testes Playwright por sub-fase

Roteiro fixo, executado nos 4 breakpoints (1920 / 1280 / 1024 / 390):

1. Abrir `/app/agenda-v2` com flag ON — screenshot inicial.
2. Alternar densidade Confortável → Compacto → Foco — screenshot cada uma.
3. Abrir drawer de paciente — screenshot header + tabs.
4. Abrir wizard "Nova sessão" — screenshot cada etapa.
5. Abrir painel de atalhos (`?`) — screenshot.
6. Rodar checagem de **zero overflow horizontal** (`document.documentElement.scrollWidth <= clientWidth`).
7. Coletar `console` — exigir zero erros funcionais.
8. Medir tempo de troca de modo (<200ms) e abertura de drawer (<400ms).
9. Abrir `/app/agenda` com flag OFF — screenshot para comparação pixel-a-pixel com baseline pré-Fase E.

Sub-fase só é considerada aprovada quando todos os 9 passos passam.

## Garantia da Agenda clássica

- Nenhum arquivo em `src/components/agenda/**`, `src/routes/_authenticated/app.agenda.tsx`, `src/routes/_authenticated/app.agenda.express.tsx` é editado em qualquer sub-fase.
- Ao final de cada sub-fase: `git diff --stat` restrito a essas paths deve retornar vazio.
- Baseline visual da clássica (prints capturados na validação da Fase D) é rerodada e comparada.
- Flag `agenda_v2` permanece OFF por padrão durante toda a Fase E.

## Entregáveis por sub-fase

- Diff curto (1 componente trocado).
- Prints Playwright dos 4 breakpoints.
- Métricas (troca de modo, abertura de drawer).
- Confirmação textual: "Agenda clássica intacta, flag OFF, zero regra de negócio alterada".
- Autorização explícita antes de iniciar a próxima sub-fase.

Aguardando aprovação deste plano para iniciar por E.1 (`HhpChip`).
