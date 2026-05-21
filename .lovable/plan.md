## Objetivo

Aplicar três regras de negócio ao módulo Agenda:

1. A **Data de pagamento** do agendamento é controlada pelo sistema — nunca editável manualmente.
2. Após o pagamento da consulta, o agendamento entra em modo **somente visualização** (sem edição).
3. O **Histórico de alterações** deve mostrar também se o **repasse ao médico** já foi pago (sem exibir valor).

---

## 1. Data de pagamento não-editável

Arquivo: `src/routes/_authenticated/app.agenda.tsx` (diálogo "Editar/Novo agendamento", ~linhas 845-856).

- Substituir o `<Input type="date">` editável por um campo somente leitura que exibe a data formatada (`dd/mm/aaaa`) quando existir, ou "—" quando ainda não houver pagamento.
- Remover o `onChange` que altera `form.data_pagamento`.
- Manter o campo no payload do `submit` apenas como passthrough do valor já existente (não envia `null` em update se já tinha valor).
- Atualizar a legenda abaixo: "Preenchida automaticamente pelo sistema quando o pagamento for registrado."

## 2. Agendamento pago = somente visualização

Já existe `pagosSet` indicando agendamentos pagos. Hoje só bloqueia o nome do paciente.

No mesmo diálogo:

- Quando `editing && pagosSet.has(editing.id)`:
  - Trocar o título para **"Visualizar agendamento (pago)"**.
  - Aplicar `disabled` / `readOnly` em **todos** os campos: Médico/Exame, Data consulta/exame, Procedimento, Status, Observações, botão de microfone e botão de cadastrar paciente.
  - Esconder os botões **"Salvar"** e **"Salvar e Pagar"**; manter apenas **"Fechar"** (no lugar de Cancelar).
  - Mostrar aviso curto no topo: "Este agendamento já foi pago. Para alterações, estorne o pagamento no Financeiro."
- Bloquear também a função `submit` no início (early-return) caso `editing && pagosSet.has(editing.id)`, como defesa extra.

## 3. Histórico inclui status do repasse médico

Arquivo: `src/routes/_authenticated/app.agenda.tsx` (função `abrirAuditoria` ~linha 187 e diálogo ~linha 1121).

A flag de repasse vive em `lancamentos_caixa` (campos `repasse_pago`, `repasse_pago_em`, `repasse_forma_pagamento`) e é vinculada ao agendamento via `agendamento_id`. O `audit_log` desses lançamentos é gravado pelo trigger padrão.

Mudanças em `abrirAuditoria`:

- Após carregar os audits do agendamento, buscar os IDs dos `lancamentos_caixa` com `agendamento_id = a.id`.
- Buscar no `audit_log` as linhas onde `record_id IN (ids_lancamentos)` e `table_name = 'lancamentos_caixa'`.
- Unir os dois conjuntos numa única lista ordenada por `created_at desc`.

Mudanças na renderização da lista:

- Para linhas de `table_name = 'lancamentos_caixa'`, filtrar `chaves` mantendo apenas: `repasse_pago`, `repasse_pago_em`, `repasse_forma_pagamento`. **Remover explicitamente** `valor`, `valor_medico`, `valor_clinica`, `valor_total` antes de exibir.
- Mapear rótulos amigáveis: `repasse_pago` → "Repasse ao médico", `repasse_pago_em` → "Data do repasse", `repasse_forma_pagamento` → "Forma".
- Para `repasse_pago`, exibir "Pago" / "Pendente" em vez de `true`/`false`.
- Se a entrada do lançamento não tem mudança em nenhum desses três campos (ex.: criou o lançamento mas ainda sem repasse), exibir uma linha resumo: "Pagamento da consulta registrado" (INSERT) ou ocultar (UPDATE sem campos relevantes).

## Pontos técnicos

- Nenhuma alteração de schema necessária.
- Nenhum valor monetário será exibido no histórico (requisito explícito).
- `pagosSet` já é populado a partir dos lançamentos pagos; reaproveitar.
- Manter compatibilidade do payload de `submit` (campo `data_pagamento` continua sendo enviado, só não é mais editável pela UI).

## Fora do escopo

- Não alterar regras do Financeiro / fluxo de pagamento existente.
- Não alterar o `Salvar e Pagar` para agendamentos novos (só fica oculto quando já pago).
- Não mexer em outros diálogos (recepção, financeiro, etc.).
