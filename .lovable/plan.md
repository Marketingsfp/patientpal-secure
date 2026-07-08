## Diagnóstico

Cada atendimento aparece duas vezes na tela **Repasse** do médico (uma linha "Pago" e outra "A receber" com os mesmos dados). Consultando o banco:

- 2 registros em `fin_lancamentos` (agenda → caixa), `repasse_pago = true`.
- 2 registros em `fin_atendimentos` **com `lancamento_id` preenchido apontando exatamente para os `fin_lancamentos` acima**, `repasse_pago = false`.

Ou seja, cada pagamento está duplicado: o registro correto vive em `fin_lancamentos` (gerado pelo caixa) e há um espelho redundante em `fin_atendimentos` (mesmo fluxo do bug anterior de outro usuário).

O filtro cliente atual (`app.financeiro.atendimentos.tsx`) já tenta descartar duplicados quando `fin_atendimentos.lancamento_id` está entre os `fin_lancamentos.id` carregados, mas está falhando em ao menos um caminho (ex.: quando o médico logado só enxerga `fin_atendimentos` da própria clínica e não os `fin_lancamentos` no mesmo intervalo, ou quando aparecem em páginas diferentes). O sintoma é a linha "A receber" reaparecendo ao lado do "Pago".

## Correção

### 1. Migration (banco)

- **Limpar dados atuais:** deletar as linhas de `fin_atendimentos` que possuem `lancamento_id` apontando para um `fin_lancamentos` existente (essas são cópias redundantes; o repasse fica em `fin_lancamentos`, que já é o registro autoritativo).

  ```sql
  DELETE FROM public.fin_atendimentos fa
   WHERE fa.lancamento_id IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.fin_lancamentos l WHERE l.id = fa.lancamento_id);
  ```

- **Impedir novas duplicidades** com constraint parcial única:

  ```sql
  CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_atend_lancamento_id
    ON public.fin_atendimentos(lancamento_id)
    WHERE lancamento_id IS NOT NULL;
  ```

- **Trigger de guarda** em `fin_atendimentos` (BEFORE INSERT): se já existe um `fin_lancamentos` cujo `agendamento_id` = agendamento do NEW ou cujo `id` = `NEW.lancamento_id`, **cancelar silenciosamente** o INSERT (retornar `NULL`). Cobre o caso em que o cliente tenta inserir sem preencher `lancamento_id`.

### 2. Client (`src/routes/_authenticated/app.financeiro.atendimentos.tsx`)

Reforçar o dedup no `load()`:

- Trazer também `agendamento_id` no `select` de `fin_atendimentos` (via join com o próprio `fin_lancamentos` referenciado — ou selecionar `fin_atendimentos.lancamento_id` + resolvendo o `agendamento_id` pelo mapa de `ar.data`).
- Após montar `lancIds`, também construir `lancAgendIds` (Set de `agendamento_id` dos `fin_lancamentos` carregados) e filtrar `manuaisRaw` descartando **qualquer** linha manual cujo `lancamento_id ∈ lancIds` **ou** cujo `agendamento_id` (do lancamento vinculado) ∈ `lancAgendIds`.

### 3. Fora de escopo

- Não mexer no `atendimento-ia` (a guarda `!lancExist` já existe; o unique + trigger blindam qualquer outro caminho que apareça).
- Nenhuma mudança na criação/edição manual pela tela Financeiro (esses seguem sem `lancamento_id`).
- Nada em telas de BI / relatórios.
