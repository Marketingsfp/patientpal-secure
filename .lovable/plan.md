## Diagnóstico

Analisei o banco e o código. Encontrei duas causas distintas.

### 1. Gratuidades não aparecem nas movimentações do caixa

Quando o operador aplica gratuidade / atendimento sem cobrança na agenda, o sistema grava a linha em `fin_lancamentos` (financeiro), mas **não grava nada em `caixa_movimentos`**. A aba "Movimentos da sessão" do "Meu caixa" lê exclusivamente `caixa_movimentos` — por isso a gratuidade fica invisível ali, mesmo estando registrada no financeiro.

Todos os pagamentos "normais" (dinheiro, pix, cartão, misto) passam pelo `LancamentoDialog`, que dispara um insert paralelo em `caixa_movimentos`. O caminho de gratuidade/valor-zero da agenda pula esse dispositivo.

### 2. A gratuidade "sumiu" da agenda da Tuane

Consultando `fin_lancamentos` da Tuane em 10/07/2026:

- Dois registros com **valor 9,99** e `agendamento_id` corretamente preenchido → aparecem no caixa e como pagos na agenda.
- Dois registros com **valor 0,00 / "SEM COBRANÇA"** e `agendamento_id = NULL` → não aparecem no caixa (bug 1) e, por não terem `agendamento_id`, o `pagosSet` da agenda não consegue marcá-los como pagos (o botão $ volta a vermelho).

O `agendamento_id` deveria ter sido setado na hora do insert. A investigação vai focar em duas hipóteses: `a.id` indefinido no fluxo `cobrarAgendamento` para procedimentos com valor 0 sem match no cadastro, ou o `LancamentoDialog` sendo chamado sem `agendamentoId` no fluxo de gratuidade.

Como esses registros existem mas ficaram órfãos, o consumo do benefício do dia é contado de outras formas (data + paciente + convênio), então o alerta de gratuidade continua disparando na próxima tentativa de pagamento, e o operador não tem como "reverter" pelo botão pago.

## Plano de correção

### A. Refletir gratuidade / sem cobrança no "Movimentos do caixa"

Em `src/routes/_authenticated/app.agenda.tsx`, no bloco que insere o `fin_lancamentos` de valor zero (gratuidade e SEM COBRANÇA — linhas ~3094-3110), após o insert bem-sucedido:

- Buscar a sessão de caixa aberta do operador (`caixa_sessoes` do usuário atual, sem `data_fechamento`).
- Inserir uma linha em `caixa_movimentos` com `tipo = 'recebimento'`, `valor = 0`, `forma_pagamento = 'convenio_gratuidade'` (ou `'sem_cobranca'`), `sessao_id`, `lancamento_id` (id retornado do insert), `descricao` idêntica, `criado_por` = usuário atual, `agendamento_id = a.id`.
- Se não houver sessão aberta, exibir alerta modal orientando abrir o caixa antes de registrar a gratuidade — igual ao padrão que já bloqueia recebimentos normais.

Ajustar também o `LancamentoDialog` para não deixar de gravar `caixa_movimentos` quando `valor = 0` (se hoje há um filtro `> 0`, revê-lo — a gratuidade legítima deve aparecer).

### B. Garantir `agendamento_id` no lançamento de gratuidade

- Adicionar defesa no insert: se `a.id` estiver ausente, abortar com erro visível em vez de gravar linha órfã.
- No fluxo do `LancamentoDialog` iniciado a partir da agenda, garantir que `pagamentoAgId` esteja setado antes do salvamento (não permitir salvar sem `agendamentoId` quando o dialog foi aberto por um agendamento).

### C. Detecção de consumo do benefício

Em `obterInfoConvenioPaciente`, restringir a contagem de "gratuidades já usadas" a lançamentos com `agendamento_id NOT NULL` do mesmo paciente. Isso impede que registros órfãos futuros (caso qualquer outro fluxo escape) travem novos agendamentos.

### D. Limpar os registros órfãos da Tuane

Depois que a mecânica estiver corrigida, remover (via migration/insert-only tool não cobre delete — será feito como um lançamento de estorno) ou re-vincular os dois `fin_lancamentos` de R$ 0,00 da Tuane que estão sem `agendamento_id`. Preciso confirmar com você antes de mexer nesses dados:

- **Opção 1**: apagar os dois lançamentos órfãos (eles são "sombras" de valor zero, não afetam saldo).
- **Opção 2**: re-vincular manualmente cada um ao agendamento correto (cardio 08:10 e ginecologia 12:00, por ex.).

## Detalhes técnicos

- **Arquivos alterados**: `src/routes/_authenticated/app.agenda.tsx` (inserção em `caixa_movimentos`, guard de `agendamento_id`); `src/lib/agenda/obter-info-convenio.functions.ts` (filtro `agendamento_id NOT NULL` na contagem de benefício usado); `src/components/financeiro/lancamento-dialog.tsx` (permitir/emitir movimento de caixa com valor 0 quando for gratuidade).
- **Sem migration de schema**: as tabelas `caixa_movimentos` e `fin_lancamentos` já têm todas as colunas necessárias.
- **Limpeza de dados**: feita via migration com `DELETE` restrito aos IDs órfãos (ou `UPDATE` para setar `agendamento_id`), após sua confirmação sobre qual opção seguir no item D.
