## Diagnóstico

O saldo de R$ 535,00 mostrado para **Tatiane Barreto** é um **saldo fantasma**. Confirmei no banco:

- Sessão de caixa aberta em 10/07/2026, 5 movimentos.
- 4 recebimentos de mensalidade (R$ 120 + 120 + 120 + 175 = **R$ 535**).
- Cada um está vinculado a um `fin_lancamentos` cujo **status é `cancelado`** (estornado).
- Ou seja: os estornos foram aprovados, mas **nenhum movimento reverso foi lançado no caixa**.

### Causa raiz (código)

Em `src/routes/_authenticated/app.financeiro.estorno.tsx` (função `executarEstorno`, linhas ~226-320), ao aprovar uma solicitação de estorno o sistema:

- Marca `fin_lancamentos.status = 'cancelado'`.
- Reabre o agendamento (se houver) ou volta a parcela do contrato para `pendente`.
- **NÃO** cria um movimento de sangria/despesa em `caixa_movimentos` para reverter a entrada.

Já o `saldoAtual` do caixa (`app.caixa.tsx`, linha ~879) soma **todo `recebimento`** da sessão, sem olhar o status do lançamento vinculado. Resultado: o dinheiro "sai" do controle financeiro mas continua no saldo do caixa.

## Correção

### 1) Correção da causa (código) — `executarEstorno`

Quando o lançamento tem um `caixa_movimentos` de tipo `recebimento` apontando para ele:

- Inserir um novo `caixa_movimentos` na **mesma sessão** do movimento original, com:
  - `tipo = 'sangria'`
  - `valor = valor do recebimento` (positivo — o sinal já é −1 no cálculo)
  - `forma_pagamento` = mesma do recebimento original (para o relatório por forma bater)
  - `descricao = "Estorno — <descrição original>"`
  - `lancamento_id = lanc.id`
  - `user_id` = usuário da sessão (o dono do caixa), para não quebrar RLS
- Se a sessão do recebimento original estiver `fechada`, **não** mexer nela: inserir num movimento de estorno na sessão aberta do próprio operador do estorno (financeiro), com a mesma descrição, para que o histórico financeiro reflita a saída. Isso é o mesmo padrão de "sangria" que o front já reconhece pela palavra "Estorno" na descrição (visto em `app.caixa.tsx` linha 1072).

### 2) Blindagem (defensive) — `saldoAtual`

Em `app.caixa.tsx`, ao calcular `saldoAtual` e nos agregados diários (`porDia`, `porFormaEntradas`, etc.), quando um `caixa_movimentos.recebimento` tem `lancamento_id` cujo `fin_lancamentos.status = 'cancelado'`, **ignorar** esse movimento no saldo (equivalente a assumir que houve estorno). Assim mesmo dados retroativos (sem movimento reverso gravado) já param de contar.

Para isso, o `load` já busca `fin_lancamentos` dos `lancIds` (para enriquecer serviço/médico); vou incluir `status` no select e propagar num `Set<string>` de "lançamentos cancelados". O `useMemo` do `saldoAtual` passa a filtrar recebimentos cujo `lancamento_id ∈` esse Set.

### 3) Correção pontual dos dados (Tatiane)

Inserir 4 movimentos de sangria "Estorno — …" na sessão `94b0dc10-…` (a aberta da Tatiane), um para cada recebimento cancelado, referenciando o mesmo `forma_pagamento` e `lancamento_id`. Saldo passa a **R$ 0,00**, refletindo a realidade (não há dinheiro em caixa).

## Arquivos afetados

- `src/routes/_authenticated/app.financeiro.estorno.tsx` — gera reversal em `caixa_movimentos` ao aprovar estorno.
- `src/routes/_authenticated/app.caixa.tsx` — ignora recebimentos com lançamento cancelado no saldo/agregados; carrega `status` do `fin_lancamentos`.
- **Data fix** via `supabase--insert` — sangrias de estorno na sessão da Tatiane.

## Fora do escopo

- Não vou mudar o layout do caixa nem os relatórios.
- Não vou mexer no fluxo de solicitação de estorno (só na aprovação).
- Não vou reabrir sessões fechadas para corrigir estornos antigos: nesses casos o estorno cai como sangria na sessão aberta do financeiro que aprovou (comportamento contábil correto: o dinheiro só sai quando é devolvido ao paciente).
