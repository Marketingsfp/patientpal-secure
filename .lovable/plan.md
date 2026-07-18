## Problema

Hoje o autocomplete de pacientes (usado na Agenda e em outras telas) só reconhece como "Associado" o paciente que é **titular** de um contrato ativo (`contratos_assinatura.paciente_id`). Dependentes vinculados via `contrato_dependentes` ficam marcados como "Particular", como o Kaue Lopes Sales (prontuário 100710), que é dependente da Marcilene Barbosa de Lima no contrato 20260945.

## O que muda

1. **Banco — RPC `buscar_pacientes_global`**
   - Adicionar coluna de retorno `associado_tipo` (`'titular' | 'dependente' | null`).
   - No CTE `conv`, além de buscar em `contratos_assinatura` (titular), fazer `UNION ALL` com `contrato_dependentes` (join em `contratos_assinatura` `status='ativo'` e `contrato_dependentes.ativo = true`) para trazer o convênio também para dependentes ativos.
   - `DISTINCT ON (paciente_id)` priorizando `titular` quando o mesmo paciente for titular em um contrato e dependente em outro.

2. **Frontend — `src/components/patient-search-input.tsx`**
   - Acrescentar `associado_tipo` em `PatientOption`.
   - Trocar o texto do badge verde:
     - Titular → `Associado - titular — {convenio}`
     - Dependente → `Associado - dependente — {convenio}`
     - Sem contrato → segue `Particular` (inalterado).

3. **Escopo isolado**
   - Não altera regras de agendamento, carência, inadimplência ou bloqueio de convênio — apenas o rótulo exibido no autocomplete. As demais telas que já leem `associado_convenio` continuam funcionando; quem quiser usar `associado_tipo` faz opt-in.

## Validação

- Buscar "kaue lopes" → badge deve mostrar `Associado - dependente — {convenio}`.
- Buscar "marcilene barbosa" → badge deve mostrar `Associado - titular — {convenio}`.
- Buscar um paciente sem contrato → continua `Particular`.

## Não faz parte deste plano

- Alterar o comportamento do agendamento em si (seleção automática de "Convênio" vs "Particular" para dependentes) — se quiser que ao selecionar o dependente já venha marcado como Convênio na agenda, isso é um segundo passo e precisa de confirmação, porque envolve regra de negócio (carência/inadimplência do titular vs dependente).
