## GR agrupada — uma GR por médico, no mesmo arquivo

Hoje (`src/lib/print-gr.ts` → `printGuiaAtendimentoAgrupadaCore`) a impressão agrupada gera **uma única GR consolidada** com blocos por profissional e um rodapé único de totais. O usuário quer voltar ao formato de **uma GR completa por médico** (igual à GR individual da screenshot), todas concatenadas no mesmo HTML/arquivo para sair em sequência na impressora térmica 80mm, separadas por linha tracejada.

### Mudanças (apenas em `src/lib/print-gr.ts`)

Reescrever `printGuiaAtendimentoAgrupadaCore` para:

1. Manter o agrupamento por `medico_id` já existente (subtotal, prestador, clínica por médico).
2. Para cada grupo, renderizar um **ticket completo** com o mesmo layout da GR individual:
   - Cabeçalho da clínica (nome, endereço, fone, CNPJ).
   - Título `GUIA DE ATENDIMENTO` + via (`1ª VIA` / `2ª VIA — REIMPRESSÃO`).
   - Dados do paciente (nome, CPF, fone, nascimento).
   - `FICHA`, `PROFISSIONAL`, `HORÁRIO` (do 1º agendamento do médico), `USUÁRIO`.
   - Tabela `QTD / PROCEDIMENTO` com os procedimentos desse médico.
   - Bloco `VALOR RECEBIDO` = subtotal do médico, com a forma de pagamento usada (rateio simples do pagamento informado: se forma única, replica em todos; se misto/cartão, mostra a mesma forma com o subtotal do médico — sem recalcular detalhe misto por médico).
   - `CLINICA` / `PRESTADOR` do médico.
   - `DATA IMPRESSAO`.
3. Entre cada ticket inserir um separador tracejado bem visível (`<div class="sep"></div>` com margem maior ou linha dupla) para a atendente cortar entre as GRs.
4. Remover o rodapé consolidado de totais (não é mais necessário, cada GR é autônoma).
5. Manter o controle de vias e o registro em `gr_impressoes` para cada `agendamento_id` (sem mudanças).
6. Caso só haja 1 grupo (um único médico), continuar delegando para `printGuiaAtendimento` simples — já implementado.

### Observação sobre forma de pagamento por GR

Como o pagamento foi feito de forma única (mesmo que misto) e cobre todos os médicos, em cada GR individual o `VALOR RECEBIDO` será o subtotal daquele médico, e a linha `(FORMA)` exibe a mesma forma global. Para misto, mostra `(MISTO)` sem repetir a tabela de detalhe em cada GR — o detalhe completo aparece apenas na **última** GR para evitar duplicação. Para cartão crédito, parcelamento e bandeira aparecem na última também.

### Sem mudanças

- Sem mudanças em banco.
- Sem mudanças em `app.agenda.tsx` — segue chamando `printGuiaAtendimentoAgrupada` com os mesmos parâmetros.

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
