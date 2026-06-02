## Problema

No cubo "Agendamentos" do Relatório BI, está aparecendo uma linha "—" (sem identificação) agrupando 753 agendamentos. Todos os médicos (PAULO ROBERTO, ROSANGELA, ELAIR, ANDREA, etc.) caem dentro desse grupo "—" em vez de aparecerem sob a especialidade correta.

**Causa:** hoje a especialidade do agendamento é resolvida apenas pelo `grupo` do procedimento (campo `procedimentos.grupo`). Quando o texto do `agendamentos.procedimento` não bate com nenhum procedimento cadastrado da clínica (ou quando o procedimento cadastrado não tem `grupo` preenchido), a especialidade fica "—" — mesmo quando o agendamento tem `medico_id` e esse médico tem especialidade cadastrada.

## Mudança

Em `src/components/relatorios/CuboBI.tsx`, no cubo `agendamentos` (lines 52–73):

1. Carregar também `lookupEspecialidadePorMedico(rows.map(r => r.medico_id))` em paralelo com os lookups existentes.
2. Na montagem da linha, resolver a especialidade em cascata:
   - 1º: especialidade do médico (`espPorMedico.get(r.medico_id)`)
   - 2º (fallback): grupo do procedimento (`espPorProc.get(normalizeProcKey(r.procedimento))`)
   - 3º: `"—"`

Sem mudanças nos demais cubos, nas tabelas do banco, ou na UI de filtros.

## Resultado esperado

Os agendamentos com médico cadastrado passam a ser agrupados pela especialidade do médico. A linha "—" deve sobrar somente para agendamentos sem médico **e** sem procedimento mapeado a uma especialidade (ex.: bloqueios de agenda, exames como "ECG" sem grupo definido).
