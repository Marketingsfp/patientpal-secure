
# Sprint 3 — Plano Executivo

**Tema:** fechar as três lacunas que hoje mandam o usuário de volta à Agenda clássica: **prontuário**, **novo paciente durante o agendamento** e **reagendamento**.

**Invariantes obrigatórios (mesmos das sprints 1 e 2):**
- Agenda clássica (`/app/agenda`) intocada.
- `criarAgendamento.functions.ts` intocado.
- Zero migration.
- Zero alteração de regra de negócio.
- Flag `agenda_v2` continua OFF por padrão.
- Novas mutações reusam funções já auditadas (`atualizarStatusAgendamento`, `criarAgendamento`).

---

## P0 — Bloqueadores de adoção (obrigatórios)

### S3-A · Prontuário integrado (inclui item 5)

**Objetivo:** remover o `TabPlaceholder` do drawer e dar acesso ao prontuário real em 1 clique.

**Problema resolvido:** hoje o médico não usa a V2 porque a aba Prontuário é uma tela vazia. Item 1 e item 5 do usuário são unificados aqui.

**Como funciona:**
- **Card:** novo botão discreto "Prontuário" no `SessionCard` que abre `/app/atendimento-ia/$agendamentoId` (mesmo destino usado por `app.agenda.express.tsx` e pela fila de atendimento IA).
- **Drawer:** aba "Prontuário" deixa de ser placeholder — vira um mini-preview (últimos atendimentos + CTA "Abrir prontuário completo") apontando para a mesma rota.
- Nenhuma tela nova de prontuário é criada — reusamos `/app/atendimento-ia/$agendamentoId`.

**Benefício por perfil:**
- Médico: 1 clique para atender. Substitui a clássica no consultório.
- Recepção: consulta rápida histórico do paciente sem sair do drawer.
- Coordenação: rastreia se o médico já iniciou o atendimento.
- Gestor: sem impacto direto.

**Arquivos alterados:**
- `src/components/agenda-v2/session-card.tsx` — botão "Prontuário".
- `src/components/agenda-v2/patient-drawer.tsx` — aba real no lugar do placeholder + CTA.
- **Nenhum arquivo novo. Nenhuma função de servidor nova.**

**Regra de negócio:** não altera. **Migration:** não. **Risco:** 🟢 Baixo (só navegação).

**Rollback:** reverter 2 arquivos.

---

### S3-B · Cadastro rápido de paciente no Wizard

**Objetivo:** permitir cadastrar paciente novo sem sair do Wizard.

**Problema resolvido:** hoje a recepção precisa abrir `/app/clientes`, cadastrar, voltar, refazer a busca. Item R2 da auditoria.

**Como funciona:**
- No passo "Paciente" do Wizard, quando a busca não encontra resultado exato, aparece CTA **"Cadastrar '<termo digitado>'"**.
- Abre um mini-form inline (nome, CPF opcional, telefone opcional) dentro do próprio passo — sem trocar de rota.
- Ao salvar, o paciente recém-criado já vem selecionado e o Wizard avança normalmente.
- Usa `useCrud("pacientes")` já existente (`src/hooks/use-crud.tsx`) — nada de função nova.

**Benefício por perfil:**
- Recepção: fluxo linear, sem troca de contexto. -3 telas por cadastro novo.
- Médico/coordenação/gestor: indireto (menos abandono de cadastro).

**Arquivos alterados:**
- `src/components/agenda-v2/novo-agendamento-wizard.tsx` — CTA + mini-form no passo Paciente.
- Nenhum arquivo novo. Nenhuma migration. Nenhuma função de servidor nova.

**Regra de negócio:** não altera (usa o mesmo INSERT em `pacientes` que a tela de clientes usa).

**Risco:** 🟢 Baixo. **Rollback:** reverter 1 arquivo.

---

### S3-C · Reagendamento (função separada)

**Objetivo:** mover um agendamento de horário/médico sem cancelar+recriar, respeitando o pedido do usuário de **não tocar `criarAgendamento`**.

**Problema resolvido:** hoje reagendar exige voltar à clássica todo dia (R3, item 1 da Sprint 2 adiada).

**Como funciona:**
- **Nova função:** `src/lib/agenda/reagendar-agendamento.functions.ts` — server function com `requireSupabaseAuth` que faz **UPDATE** em `agendamentos` alterando apenas `inicio`, `fim`, `medico_id` (opcional) e `sala_id` (opcional). Preserva `pacote_id`, `orcamento_id`, `paciente_id`, `status`, histórico, executado_por/em.
- Espelha as validações de conflito de horário que a clássica já faz (janela do médico, sobreposição), sem duplicar `criarAgendamento`.
- Cascata de pacote: se `pacote_id` presente, oferece "mover só este" ou "mover todo o pacote proporcionalmente" (mesma UX da cascata de cancelamento da Sprint 2).
- **UI:** botão "Reagendar" no `SessionCard` e no `PatientDrawer` → abre um modal compacto (não o Wizard) com: novo dia, novo horário, opcional novo médico. Sem passos, sem paciente/serviço (já são conhecidos).

**Por que modal e não o Wizard?** o Wizard é criação. Reagendamento é UPDATE de 2-3 campos. Misturar os dois obrigaria alterar o Wizard e o `criarAgendamento` — proibido.

**Benefício por perfil:**
- Recepção: elimina a última razão diária de voltar à clássica.
- Médico: pode empurrar consulta 15 min sem ligar para recepção.
- Coordenação: reorganiza dia sem cancelamento fantasma no relatório.
- Gestor: taxa real de reagendamento passa a ser mensurável (base para KPI futuro).

**Arquivos alterados:**
- `src/lib/agenda/reagendar-agendamento.functions.ts` (**novo**).
- `src/components/agenda-v2/session-card.tsx` — botão Reagendar.
- `src/components/agenda-v2/patient-drawer.tsx` — botão Reagendar.
- `src/components/agenda-v2/agenda-v2-shell.tsx` — wiring do modal.
- `src/components/agenda-v2/reagendar-modal.tsx` (**novo**).

**Regra de negócio:** **NÃO altera regra existente.** Apenas materializa um caminho de UPDATE que a clássica também faz. `criarAgendamento` permanece intocado.

**Migration:** **não**.

**Risco:** 🟠 Médio-Alto — é a mutação mais sensível da sprint. Mitigações:
- Guard `WHERE status IN ('agendado','confirmado')` — não reagenda cancelado/realizado.
- Log de auditoria (trigger `fn_audit_trigger` já cobre `agendamentos`).
- Playwright end-to-end obrigatório antes de fechar.

**Rollback:** deletar 2 arquivos novos + reverter 3 arquivos.

---

## P1 — Melhorias importantes

### S3-D · KPIs realmente gerenciais

**Objetivo:** substituir KPIs operacionais redundantes por métricas de gestão.

**Novos KPIs:**
- **Taxa de confirmação** = confirmados / (total − cancelados) — %
- **Taxa de no-show** = faltou / realizados_esperados — %
- **Ocupação da grade** = minutos ocupados / minutos disponíveis do dia — %
- **Receita prevista do dia** = soma de valores dos procedimentos ainda não cancelados — R$

**Removidos:** "Total" (redundante) e "Coletas lab." (opt-in por clínica, fica só quando há sessão de coleta detectada).

**Cálculo:** 100% client-side sobre o dataset já carregado. **Zero query nova. Zero migration.**

**Arquivos alterados:** `src/components/agenda-v2/kpi-bar.tsx`, `src/components/agenda-v2/agenda-v2-shell.tsx` (fórmulas).

**Risco:** 🟢 Baixo. **Rollback:** reverter 2 arquivos.

---

### S3-E · Produtividade do médico (navegação paciente-a-paciente)

**Objetivo:** dar ao médico atalhos de teclado para percorrer a fila do dia.

**Como funciona:**
- No drawer aberto: `↑` / `↓` navega para o paciente anterior/próximo da lista **filtrada** (respeita "meus pacientes").
- `Enter` no drawer abre o prontuário do paciente atual.
- `Esc` fecha (já existe).
- Novo atalho `P` no shell abre o drawer do próximo paciente do médico (o mais próximo do horário atual).

**Arquivos alterados:** `src/components/agenda-v2/patient-drawer.tsx`, `src/components/agenda-v2/agenda-v2-shell.tsx`.

**Risco:** 🟢 Baixo. **Rollback:** reverter 2 arquivos.

---

## P2 — Fora do escopo da Sprint 3

Os itens 7 (Realtime), 8 (Virtualização), 9 (Drag & Drop) e 10 (AI Insights) ficam **explicitamente fora** desta sprint. Cada um tem risco/complexidade que merece sprint própria:

- **Realtime** exige política de invalidação de cache + política de conflito de UI — 1 sprint.
- **Virtualização** exige refactor da timeline + JourneyBar — 1 sprint.
- **Drag & Drop** só faz sentido depois de S3-C (reagendamento) estar consolidado; herda de lá.
- **AI Insights** precisa de métrica de aceite antes de mudar UX — antes disso é chute.

---

## Ordem de execução proposta

1. **S3-A** (Prontuário) — 🟢 rápido, alto impacto, baixo risco. Começa por aqui.
2. **S3-B** (Cadastro rápido) — 🟢 fecha o Wizard.
3. **S3-D** (KPIs) — 🟢 destrava adoção do gestor sem código novo de servidor.
4. **S3-E** (Atalhos do médico) — 🟢 polimento produtivo.
5. **S3-C** (Reagendamento) — 🟠 último, isolado, com Playwright obrigatório. Se qualquer problema aparecer, os itens 1-4 já estão em produção.

Justificativa: 4 entregas verdes primeiro. Se S3-C precisar ser adiada, a sprint ainda entrega valor completo.

---

## Testes obrigatórios ao final

- Playwright: abrir prontuário via card e via drawer (S3-A).
- Playwright: cadastrar paciente novo dentro do wizard e concluir agendamento (S3-B).
- Playwright: reagendar 1 sessão simples + 1 sessão de pacote (S3-C).
- Verificar KPIs recalculados após mudança de status (S3-D).
- Navegar 3 pacientes com `↑/↓` (S3-E).
- Typecheck 0 erros.
- Console 0 erros.
- Agenda clássica: abrir, criar 1 agendamento, mudar status — smoke test para provar que ficou intocada.
- Comparar `criarAgendamento.functions.ts` git-diff = vazio.

---

## Pontos que preciso da sua decisão antes de começar

1. **Destino do prontuário:** ok usar `/app/atendimento-ia/$agendamentoId` (mesmo destino do fluxo IA e da agenda express)?
2. **Reagendamento com mudança de médico:** liberar já na Sprint 3, ou restringir a "mesmo médico, novo horário" para reduzir risco?
3. **Cascata de pacote no reagendar:** oferecer "mover todo o pacote" agora, ou só "mover este" no MVP?
4. **KPI "Receita prevista":** usar valor de tabela de procedimento (sem convênio) ou pular esse KPI se não houver preço confiável?

Nenhum código será escrito até sua aprovação item-a-item.
