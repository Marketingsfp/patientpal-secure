## Problema

No filtro **Situação**, ao selecionar **"Agendado"**, hoje só aparecem agendamentos cujo `status` é exatamente `agendado`. Pacientes com status `confirmado`, `realizado`, `cancelado` ou `faltou` são excluídos — mesmo que tenham sido agendados (têm cliente na coluna).

O usuário quer que **"Agendado"** mostre **todos os horários que têm paciente alocado** (qualquer linha cuja coluna *Cliente* não esteja vazia / não seja `DISPONÍVEL`), independente do status atual.

## Mudança em `src/routes/_authenticated/app.agenda.tsx`

No `useMemo` `filtrados` (linhas 709–736), ajustar o bloco do `filtroStatus`:

- `"livres"` → continua mostrando só slots `DISPONÍVEL` (sem mudança).
- `"agendado"` → mostrar todas as fichas que **têm paciente** (qualquer status), ou seja, excluir apenas slots `DISPONÍVEL`. Equivale a "qualquer ficha com cliente".
- `"confirmado"`, `"realizado"`, `"cancelado"`, `"faltou"` → continuam filtrando por `a.status === filtroStatus` exatamente como hoje.
- `"todos"` → sem mudança.

Também ajustar a busca no Supabase em `load()` (linha ~445–447): hoje, quando `filtroStatus` é um status específico, faz `q.eq("status", filtroStatus)`. Para `"agendado"`, **não** aplicar esse `eq`, deixando vir todos os agendamentos (e o filtro de cliente-presente é feito no `filtrados` em memória). Para os demais status específicos, mantém o `eq`.

## Fora do escopo

- Não mexer em outros filtros (médico, especialidade, dia da semana, cliente, ficha).
- Não alterar a lógica de reagendamento.
- Não mudar os rótulos do dropdown.
