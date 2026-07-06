
# Roadmap Executivo — Agenda V2

Transformação da auditoria em plano de decisão. **Nenhum código será escrito nesta etapa.**

Legenda de esforço: **XS** ≤ 2h · **S** ≤ ½ dia · **M** 1–2 dias · **L** 3–5 dias.
Frequência estimada com base em clínica média (150–300 sessões/dia, 3–5 recepcionistas, 4–8 médicos).

---

## 1. Detalhamento por item

### 🔴 P0 — Bloqueadores de adoção

#### P0-1 · Ações de status no card e no drawer (Confirmar / Check-in / Cancelar / Faltou / Salvar e cobrar)
- **Problema:** o drawer só mostra dados; nenhum botão muda status. Card idem.
- **Impacto usuário:** recepção volta à Agenda clássica para qualquer mudança de estado.
- **Frequência:** 80–150×/dia por recepcionista (confirmações + check-ins + cancelamentos).
- **Risco de manter:** V2 nunca substitui a clássica; adoção zero.
- **Complexidade:** Média (mutations já existem na clássica, precisa reusar).
- **Dependências:** nenhuma bloqueante; reaproveita RPCs da clássica.
- **Benefício:** paridade operacional mínima para recepção e médico.
- **Tempo:** M (1–2 dias).
- **Recomendação:** **Implementar agora**.

#### P0-2 · Reagendar / mover horário
- **Problema:** só é possível cancelar e recriar; wizard não move `pacote_id`.
- **Impacto:** recepção volta à clássica sempre que paciente pede novo horário.
- **Frequência:** 20–40×/dia por clínica.
- **Risco:** perda de histórico, duplicidade de agendamentos, retrabalho.
- **Complexidade:** Média (reusar `criarAgendamento` no modo UPDATE preservando id).
- **Dependências:** P0-1 (fluxo de status coerente).
- **Benefício:** fecha o gap crítico com a clássica.
- **Tempo:** M.
- **Recomendação:** **Implementar agora**.

#### P0-3 · Click-on-slot pré-preenche o wizard
- **Problema:** slot livre é decorativo; clicar não abre nada.
- **Impacto:** 7 cliques vs 4–5 da clássica.
- **Frequência:** 30–60 agendamentos/dia por clínica.
- **Risco:** percepção de que "V2 é mais lenta".
- **Complexidade:** Baixa (passar médico+horário como initialValues).
- **Dependências:** wizard já existe.
- **Benefício:** –3 cliques/agendamento; motivo de existir da timeline.
- **Tempo:** S.
- **Recomendação:** **Implementar agora**.

#### P0-4 · Auto-scroll para hora atual ao abrir
- **Problema:** médico chega às 14h e vê 08h no topo.
- **Frequência:** toda abertura da tela (dezenas de vezes/dia por usuário).
- **Risco:** atrito diário permanente.
- **Complexidade:** Baixa (XS).
- **Dependências:** nenhuma.
- **Benefício:** altíssimo, custo mínimo.
- **Recomendação:** **Implementar agora**.

#### P0-5 · Distinção visual Cancelado ≠ Faltou
- **Problema:** ambos usam `rose-400`, indistinguíveis.
- **Risco:** erro operacional grave (cobrar quem faltou como se tivesse cancelado, ou vice-versa) — impacto **financeiro e jurídico**.
- **Frequência:** leitura em cada card, o dia inteiro.
- **Complexidade:** XS (cor + ícone).
- **Recomendação:** **Implementar agora**.

#### P0-6 · Rótulo "Equipe on-line" → "Escala do dia"
- **Problema:** métrica derivada de "tem sessão hoje", não presença real.
- **Impacto:** gestor toma decisão com informação errada.
- **Frequência:** consulta gerencial diária.
- **Complexidade:** XS.
- **Recomendação:** **Implementar agora**.

#### P0-7 · Auditar/remover `patient-timeline-drawer.tsx`
- **Problema:** possível código morto (148 ln) duplicando `patient-drawer.tsx`.
- **Risco:** confusão em manutenções futuras; bundle inflado.
- **Complexidade:** XS.
- **Recomendação:** **Implementar agora** junto do P0-1 (mesma área).

---

### 🟡 P1 — Necessário nas próximas 2–3 versões

| ID | Problema | Freq. | Risco | Complex. | Deps | Benefício | Tempo | Recom. |
|---|---|---|---|---|---|---|---|---|
| P1-1 | Shell de 812 ln inviabiliza F.2/F.3 | contínuo (dev) | débito técnico crescente | Alta | — | destrava próximas fases | L | Implementar após P0 |
| P1-2 | 6 round-trips no first paint | toda abertura | ~300ms de espera | Média | migration RPC | first paint mais rápido | M | Implementar |
| P1-3 | `SessionCard` re-renderiza a cada tecla | contínuo | jank em busca | Baixa | — | –80% renders | S | Implementar |
| P1-4 | Sem virtualização (300+ cards) | clínicas grandes | trava scroll | Média | P1-3 | fluidez | M | Implementar |
| P1-5 | Filtro "meus pacientes" manual | toda abertura por médico | atrito diário | Baixa | — | 1-clique para médico | S | Implementar |
| P1-6 | KPIs só operacionais, sem financeiro | reunião diária | gestor ignora tela | Média | — | tela vira ferramenta de gestão | M | Implementar |
| P1-7 | Sem Realtime (60s stale) | multi-atendente | conflitos, F5 | Média | — | colaboração ao vivo | M | Implementar |
| P1-8 | AI Strip sempre aberta | permanente | ruído visual | Baixa | — | +200px verticais | XS | Implementar |
| P1-9 | Cores hardcoded fora do DS | dev | inconsistência | Média | — | dark mode, temas | M | Adiar 1 sprint |
| P1-10 | KpiBar reimplementa `HhpKpiCard` | dev | duplicação | Baixa | — | 1 componente único | S | Implementar |
| P1-11 | Cadastro rápido de paciente inline no wizard | 5–10×/dia | troca de contexto | Média | P0-3 | fluxo contínuo | M | Implementar |

---

### 🟢 P2 — Polimento futuro

| ID | Item | Complex. | Recomendação |
|---|---|---|---|
| P2-1 | Split `patient-drawer` em 5 tabs | Média | Adiar (fazer junto de F.2/F.3) |
| P2-2 | Split wizard em `step-*` | Média | Adiar (pré-requisito de F.2) |
| P2-3 | Modo Foco esconde régua fora ±1h | Baixa | Adiar |
| P2-4 | Toggle "mostrar horários livres" | Baixa | Adiar |
| P2-5 | Ocupação real de recurso | Média | Adiar (depende de dado real de capacidade) |
| P2-6 | Percentis para analytics | Baixa | Adiar |
| P2-7 | Mover `initials()` para utils | XS | Fazer oportunisticamente |
| P2-8 | `useIsMobile` → CSS puro | Baixa | Descartar (ganho marginal) |
| P2-9 | `procedimentos.ativo=true` | XS | Fazer junto do P1-2 |
| P2-10 | Prefetch paciente no hover | Baixa | Adiar |
| P2-11 | Toast ao trocar densidade | XS | Descartar (poluição) |

---

## 2. Matriz Impacto × Esforço

Impacto ponderado por valor real para **recepção, coordenação, médico e gestor** — não apenas por dificuldade.

```text
                           ESFORÇO
                XS/S              M                  L
        ┌───────────────────┬──────────────────┬─────────────────┐
  ALTO  │ P0-3 click-slot   │ P0-1 status      │ P1-1 refactor   │
IMPACTO │ P0-4 auto-scroll  │ P0-2 reagendar   │   shell         │
        │ P0-5 cor cancel   │ P1-6 KPIs gestão │                 │
        │ P1-3 memo card    │ P1-7 realtime    │                 │
        │ P1-5 meus pac.    │ P1-2 RPC boot    │                 │
        │ P1-8 AI strip     │ P1-4 virtualizar │                 │
        │ P1-10 KpiBar HHP  │ P1-11 pac. rápido│                 │
        ├───────────────────┼──────────────────┼─────────────────┤
  MÉDIO │ P0-6 rótulo escala│ P1-9 tokens cor  │ P2-1 split      │
        │ P0-7 drawer morto │                  │   drawer        │
        │ P2-9 ativo=true   │ P2-5 ocupação    │                 │
        ├───────────────────┼──────────────────┼─────────────────┤
  BAIXO │ P2-7 initials     │ P2-2 split wiz.  │                 │
        │ P2-6 analytics    │                  │                 │
        │ P2-3, P2-4, P2-10 │                  │                 │
        └───────────────────┴──────────────────┴─────────────────┘

  Descartar: P2-8 (useIsMobile), P2-11 (toast densidade)
```

**Ordem sugerida por valor (não por dificuldade):**
Recepção → Médico → Gestor → Dev (débito técnico) → Polimento.

---

## 3. Cronograma em sprints independentes

Cada sprint é **fechado e utilizável em produção**. Nenhuma sprint deixa funcionalidade parcial.

### 🚀 Sprint 1 — "Paridade com a clássica" (recepção + médico)
**Duração estimada:** 3–4 dias · **Foco:** recepção deixa de voltar para `/app/agenda`.
- P0-3 Click-on-slot pré-preenche wizard
- P0-4 Auto-scroll para hora atual
- P0-5 Cancelado ≠ Faltou (cor + ícone)
- P0-6 Rótulo "Escala do dia"
- P0-7 Auditoria e remoção do drawer morto

**Entregável:** V2 já é mais rápida que a clássica em criar agendamento e não confunde estados. Recepção pode usar sem risco de erro de cobrança.

---

### 🚀 Sprint 2 — "Operação completa" (recepção + médico)
**Duração:** 4–5 dias · **Foco:** V2 substitui a clássica para o fluxo diário.
- P0-1 Ações de status (Confirmar / Check-in / Cancelar / Faltou / Salvar e cobrar) no card e drawer
- P0-2 Reagendar / mover horário via wizard em modo UPDATE
- P1-5 Filtro "meus pacientes" persistido por médico

**Entregável:** paridade funcional 100% com a clássica para o dia-a-dia. Coordenação pode migrar plantões.

---

### 🚀 Sprint 3 — "Performance e colaboração"
**Duração:** 4–5 dias · **Foco:** clínicas grandes e multi-atendente.
- P1-3 `React.memo` em `SessionCard`
- P1-4 Virtualização da timeline
- P1-7 Realtime em `agendamentos`
- P1-8 AI Strip colapsada por padrão
- P1-10 KpiBar unificada com `HhpKpiCard`

**Entregável:** V2 pronta para clínicas com 300+ sessões/dia e mesa de trabalho compartilhada.

---

### 🚀 Sprint 4 — "Visão do gestor"
**Duração:** 3–4 dias · **Foco:** tela passa a ser ferramenta gerencial.
- P1-6 KPIs reformulados (Taxa confirmação · No-show · Ocupação · Receita prevista)
- P1-2 RPC `agenda_v2_bootstrap` (–4 round-trips)
- P2-9 `procedimentos.ativo=true` (aproveita a migration do RPC)

**Entregável:** gestor acompanha operação e financeiro do dia sem sair da tela; first paint mais rápido.

---

### 🚀 Sprint 5 — "Preparar F.2 / F.3" (dev)
**Duração:** 5–7 dias · **Foco:** destravar próximas fases funcionais.
- P1-1 Extrair `use-agenda-v2-data.ts` + `agenda-v2-toolbar.tsx` + `agenda-v2-timeline.tsx`
- P1-11 Cadastro rápido de paciente inline no wizard
- P1-9 Tokens de cor HHP (substituir hardcoded)
- P2-7 `initials()` → `@/lib/utils`

**Entregável:** shell abaixo de 400 ln, DS 100% coerente, wizard preparado para receber orçamento (F.2) e sessão laboratorial (F.3).

---

### 🌿 Backlog (P2, sem sprint reservada)
Fazer oportunisticamente durante F.2/F.3 ou em janela de polimento:
P2-1, P2-2, P2-3, P2-4, P2-5, P2-6, P2-10.

### ❌ Descartados
- **P2-8** `useIsMobile` → CSS puro: ganho marginal, risco de regressão.
- **P2-11** Toast ao trocar densidade: poluição visual sem valor.

---

## 4. Regras do cronograma

1. Cada sprint é **liberada com flag `agenda_v2` OFF por padrão** — validação admin/gestor antes de expansão.
2. Nenhuma sprint altera `criarAgendamento` sem aprovação explícita (governança da Fase F).
3. Toda sprint termina com: Playwright + SELECTs de verificação + rollback documentado.
4. F.2 (Orçamento) e F.3 (Laboratório) **só começam após a Sprint 5**, quando o shell estiver refatorado.
5. Se durante uma sprint surgir necessidade de migration, o item é pausado e volta para aprovação.

---

## 5. Próximo passo

Aprovar o roadmap acima (ou pedir ajustes de escopo/ordem) para iniciar a **Sprint 1**.
