## Diagnóstico

Os 12 lançamentos "Mensalidade alterada (parcela X)" do contrato #20261547 aparecem como "Usuário não identificado" porque foram gravados na `audit_log` com `user_id = NULL` e `user_email = NULL`. Todos têm o mesmíssimo timestamp (22/07/2026 22:21:18) — foi um cancelamento em lote das 12 parcelas.

Isso acontece porque o trigger `fn_audit_trigger` lê `auth.uid()` para preencher o autor. Quando a alteração vem de:

- um script SQL executado pelo agente (contexto sem sessão de usuário — `auth.uid()` = NULL),
- uma rotina automática/cron (backup, jobs),
- uma RPC chamada com `service_role` sem JWT do usuário,

`auth.uid()` devolve NULL e o registro fica órfão. O front então cai no fallback "Usuário não identificado", o que dá a impressão errada de bug.

Regra do produto (AGENTS.md): todo histórico deve identificar o autor; quando não houver usuário, deve dizer explicitamente **"Sistema"** (com a origem, quando possível).

## Solução em definitivo

### 1. Trigger de auditoria (`fn_audit_trigger`) — nunca mais gravar autor em branco
Quando `auth.uid()` for NULL:

- Gravar `user_email = 'sistema'` e um novo campo `user_agent` já existente com a origem detectada:
  - se `current_setting('request.jwt.claim.role', true)` = `'service_role'` → origem `"sistema (service_role)"`;
  - se rodando sem PostgREST (script SQL/psql do agente) → origem `"sistema (manutenção)"`;
  - se dentro de RPC que setou `SET LOCAL app.actor_source = '<nome>'` → usar esse rótulo (`"sistema (trocar_convenio)"`, `"sistema (cancelar_contrato)"` etc.).
- Manter `user_id = NULL` — a chave estrangeira só faz sentido para usuários reais.

### 2. RPCs internas passam a declarar sua origem
Nas RPCs `SECURITY DEFINER` que fazem mutações em lote (`trocar_convenio_contrato`, `cancelar_contrato`, `regerar_parcelas`, `estornar_sangria`, `renovar_contrato`), adicionar no início:

```sql
PERFORM set_config('app.actor_source', 'trocar_convenio_contrato', true);
```

Assim, mesmo quando o `auth.uid()` estiver ausente, o histórico dirá **"Sistema (trocar convênio)"** em vez de vazio.

### 3. RPC `contrato_historico` — resolver nome final
No `SELECT` final, trocar o `COALESCE(p.nome, t.user_email)` por:

```sql
COALESCE(
  p.nome,
  NULLIF(t.user_email, ''),
  'Sistema'
) AS user_nome
```

e devolver junto um campo `user_origem` (extraído do `user_agent` quando começar com `sistema`).

### 4. UI (`historico-contrato-tab.tsx` e `historico-atendimento-dialog.tsx`)
Trocar o fallback italico "Usuário não identificado" por um badge cinza **"Sistema"** com tooltip mostrando a origem (`user_origem`) quando disponível. Mesma regra vale para o diálogo de histórico de atendimento (que também mostra "Sistema" quando `user_id` e `user_email` são nulos, mas hoje sem badge).

### 5. Registros históricos já existentes
Não é possível descobrir quem executou uma ação passada sem autor gravado. Para esses (inclusive as 12 parcelas do contrato #20261547), o histórico passará a exibir **"Sistema"** automaticamente por causa das alterações 3 e 4 — sem migração de dados destrutiva.

## Escopo e clínica-alvo

Confirmar antes de implementar: essa correção é **puramente técnica** (bug de rastreabilidade do histórico), sem regra de negócio nova. Recomendo aplicar **global (todas as clínicas)** — o comportamento atual dá informação errada em qualquer contrato/atendimento de qualquer clínica. Confirma?

## Fora de escopo

- Não vou alterar dados já auditados (não dá para inventar autor retroativo).
- Não vou mexer em outras telas de histórico além das duas citadas (contrato e atendimento) — se quiser aplicar o mesmo padrão em Auditoria/RH/Caixa, me diga que amplio.
