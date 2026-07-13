## Antes vs. depois

**Antes (bug atual):**
- `confirmarPagamento` faz `INSERT` na `fin_lancamentos` (despesa do repasse) e **depois** `UPDATE` marcando `repasse_pago = true` nos atendimentos.
- Se o `UPDATE` falha ou a página recarrega no meio, a despesa já ficou gravada mas os atendimentos continuam como "não pagos".
- O `catch` não desfaz nada e não recarrega a lista — o usuário clica "Pagar repasse" de novo e uma nova despesa é criada. Sem trava no banco, dá para pagar N vezes.

**Depois:**
- Um atendimento com `repasse_pago = true` fica bloqueado no banco (não permite ser referenciado por outra despesa de repasse).
- O fluxo passa a: **marcar os atendimentos primeiro** (com uma coluna nova `repasse_lock_id`) → só depois inserir a despesa → gravar `repasse_lancamento_id`. Se qualquer passo falhar, desfazemos os locks.
- Botão continua com `disabled={payingNow}`, mas mesmo com duplo submit por rede/refresh o banco recusa o segundo pagamento.

## Escopo (o que muda)

### 1. Banco — migração isolada de segurança/consistência
Aciono a Regra 1 do AGENTS.md antes: essa migração toca tabelas financeiras sensíveis (`fin_lancamentos`, `fin_atendimentos`). Impacto: nenhum usuário perde acesso; apenas impede pagamento duplicado. Sem mudança em RLS/GRANT existentes.

- Adicionar coluna `repasse_lock_id uuid` em `fin_atendimentos` e `fin_lancamentos` (nullable).
- Índice **único parcial**: `UNIQUE (id) WHERE repasse_pago = true` já é dado pela PK — a trava real é uma constraint em nível de linha:
  - Trigger `BEFORE UPDATE` em ambas as tabelas: se `OLD.repasse_pago = true` e o `NEW` tenta setar `repasse_pago = true` de novo com `repasse_lancamento_id` diferente, `RAISE EXCEPTION 'Repasse já foi pago para este atendimento'`.
  - Isso garante que, mesmo com corrida de dois cliques concorrentes, apenas o primeiro `UPDATE ... SET repasse_pago = true WHERE repasse_pago = false` pega as linhas — o segundo pega 0 linhas e é abortado.
- Sem `DISABLE RLS`, sem `TO anon`, sem policy nova permissiva.

### 2. Código — `src/routes/_authenticated/app.financeiro.atendimentos.tsx`
Reescrever `confirmarPagamento` (linhas 1610–1760) para o padrão idempotente:

```text
para cada médico do agrupamento:
  1. gerar lockId = crypto.randomUUID()
  2. UPDATE fin_atendimentos / fin_lancamentos
       SET repasse_pago = true, repasse_pago_em, repasse_pago_at,
           repasse_forma_pagamento, repasse_conta_id,
           repasse_lock_id = lockId
       WHERE id IN (...) AND repasse_pago = false
       RETURNING id
     → se a contagem retornada < ids enviados: algum já estava pago;
       aborta o médico, mostra "Alguns atendimentos já haviam sido pagos" e recarrega.
  3. INSERT fin_lancamentos (despesa) — se falhar,
       UPDATE ... SET repasse_pago = false, repasse_lock_id = null
       WHERE repasse_lock_id = lockId  (rollback aplicativo)
  4. UPDATE ... SET repasse_lancamento_id = lancId WHERE repasse_lock_id = lockId
```

Também:
- No `catch`, chamar `load()` sempre (mesmo em erro) para sincronizar o estado local com o banco antes que o usuário tente de novo.
- Manter `disabled={payingNow}` no botão.

### 3. O que NÃO muda
- Regras de repasse, cálculo, comprovante, laudo.
- Permissões, presets, `permissoes-rotas.ts`, `_authenticated`.
- `client.ts`, `client.server.ts`, `types.ts` (auto-gerados).
- Nenhuma outra tela.

## Validação
- Build + typecheck.
- Simulação manual em produção (com aviso — regra 2.6): selecionar 1 atendimento, pagar, tentar clicar de novo → botão desabilita; forçar segunda tentativa via refresh → banco recusa. Sem resíduo se falhar (rollback).
- Verificar que atendimentos legítimos que ainda não foram pagos continuam pagáveis.

## Pontos de atenção
- Migrações que criam trigger em tabela sensível: aplicar em janela sem operação de caixa e revisar o `linter` do Supabase depois.
- Se já existirem duplicatas históricas de repasse pago, elas ficam intactas — a migração não faz limpeza retroativa (posso listar depois para você decidir).

Confirma que sigo com **(1) migração de trigger + coluna** e **(2) reescrita do `confirmarPagamento`**?