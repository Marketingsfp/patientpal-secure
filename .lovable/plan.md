## 1. Bug — pagamento em dinheiro sem informar valor recebido

**Hoje** (`src/components/financeiro/lancamento-dialog.tsx`): quando a forma de pagamento é **Dinheiro**, o campo "Valor recebido" é opcional. Se ficar em branco, o salvamento prossegue e nenhum troco é calculado.

**Correção (modo único):** antes do `INSERT` do lançamento, se `formaPagamento === "dinheiro"` (e não-misto), exigir `recebidoNum >= valorNum`. Caso contrário, `toast.error("Informe o valor recebido (deve ser ≥ R$ X,XX)")` e abortar. Tornar o campo "Valor recebido" obrigatório visualmente (asterisco + `required`).

**Correção (modo misto):** para cada linha com `forma === "dinheiro"`, exigir `recebido > 0` e `recebido >= pago` (já é feito implicitamente, mas validar com mensagem clara). Bloquear salvamento se faltar.

Sem mudanças em banco — só validação no diálogo.

---

## 2. Check-in de pacientes (pagaram antes, confirmam presença no balcão)

### Fluxo desejado
Paciente paga antecipado → no dia comparece ao balcão → atendente busca o paciente → clica **Confirmar presença** → `fluxo_etapa` avança para **triagem** (libera enfermagem / médico). Hoje isso só acontece automaticamente quando o pagamento é feito na hora (já implementado em `app.agenda.tsx` linha ~1066).

### Mudanças

**a) Nova rota:** `src/routes/_authenticated/app.checkin.tsx`
- Lista agendamentos da clínica atual cuja data é **hoje** (com seletor de data, padrão hoje).
- Mostra apenas pacientes com pagamento já confirmado (existe `fin_lancamentos` com `agendamento_id = a.id`, `tipo = 'receita'`, `status = 'confirmado'`) **e** `fluxo_etapa IN ('aguardando_recepcao', 'recepcao')`.
- Campos por linha: foto/nome, CPF/telefone, horário, profissional, procedimento, status do pagamento (badge "PAGO"), botão grande **"Confirmar presença"**.
- Busca por nome / CPF no topo.
- Ao clicar: `UPDATE agendamentos SET fluxo_etapa='triagem', fluxo_atualizado_em=now() WHERE id = ?`, toast de sucesso, remove da lista.
- Também exibe um contador "X aguardando check-in".
- Item de menu **"Check-in"** (ícone `UserCheck` ou `BadgeCheck`) em `src/components/app-shell.tsx`, grupo "Operação".

**b) Atalho na Agenda** (`src/routes/_authenticated/app.agenda.tsx`)
- Para cada agendamento já pago (`pagosSet.has(a.id)`) cujo `fluxo_etapa` ainda seja `aguardando_recepcao` ou `recepcao`, mostrar um botão verde compacto **"✓ Confirmar presença"** ao lado das ações existentes (Editar/Imprimir/Cobrar).
- Clique → mesma atualização do `fluxo_etapa` para `triagem` + `toast.success("Presença confirmada — paciente liberado para triagem")` + recarrega a lista.
- Carregar `fluxo_etapa` no `select` da query da agenda (atualmente apenas alguns campos são lidos — adicionar `fluxo_etapa`).

### Sem mudanças de banco
Tudo já existe: `agendamentos.fluxo_etapa`, `fin_lancamentos` por `agendamento_id`. RLS já cobre por `clinica_id`.

### Suposições
- "Pago antes" = qualquer `fin_lancamentos` confirmado vinculado ao agendamento, independente da data do lançamento.
- Após confirmar presença, o paciente vai direto para **triagem** (mesma etapa usada quando o pagamento ocorre na hora). Se preferir mandar para **recepcao** antes da triagem, me avise.
- A tela mostra **apenas o dia selecionado**. Não vai listar futuros / passados nesta tela.
