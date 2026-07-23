## Objetivo

Garantir que orçamentos cuja especialidade é **Odontologia** só possam ser vinculados/agendados com **médicos que têm a especialidade Odontologia** cadastrada em `medico_especialidades`. Hoje o sistema não faz essa checagem no momento do agendamento: qualquer médico pode receber um orçamento odonto.

## Escopo

- Aplicar nas **3 clínicas** (mudança de regra, não usa feature flag por clínica).
- Apenas frontend (validação + filtro de UI). Sem migração de banco.
- Não altera a criação do orçamento em si — o `NovoOrcamentoOdontoDialog` já filtra médicos por especialidade.

## Fora do escopo

- Alterar orçamentos/agendamentos já existentes.
- Bloquear no backend via RLS/RPC (podemos evoluir depois se necessário).
- Mudar outras especialidades (a regra vale só para Odontologia).

## Alterações

1. **`src/routes/_authenticated/app.agenda.tsx`**
   - Carregar (uma vez, junto do resto) o conjunto de `medico_id` que possuem a especialidade Odontologia (`medico_especialidades` filtrando pelo ID `f0cfaa0a-2a67-4176-97de-a7072c37077c`).
   - No `buscarOrcamento`, quando `isOdonto === true`, marcar o contexto como odonto para os fluxos abaixo.
   - No form de "Novo agendamento" (`salvar`/criar): se `orcamento_id` for de um orçamento odonto e o `medico_id` selecionado não estiver no conjunto de odontologistas, bloquear com toast:
     > "Orçamentos de Odontologia só podem ser agendados com médicos da especialidade Odontologia."
   - No `MedicoFiltroInput` do modal de agendamento: quando o orçamento vinculado for odonto, filtrar a lista para exibir apenas odontologistas (mantendo os recursos 🩺 se aplicável — validar).
   - Se o médico atual (edição) não for odontologista e o orçamento vinculado for odonto, limpar o `medico_id` e avisar.

2. **`src/components/agenda/dividir-orcamento-dialog.tsx`**
   - Receber via prop `restringirOdonto?: boolean` e `odontoMedicoIds?: Set<string>`.
   - Quando ativo, filtrar os `medicos` disponíveis em cada linha para apenas odontologistas (intersecção com o filtro atual de `medico_procedimentos`).
   - Validar no `podeSalvar` / no `salvar` e mostrar toast se algum grupo tiver médico não-odontologista.
   - Chamado a partir de `app.agenda.tsx` passando essas props quando `orc.especialidade_id` é Odonto.

3. **`src/components/agenda/selecionar-itens-orcamento-dialog.tsx`**
   - Sem mudança de UI. A validação acontece depois, no `salvar` do agendamento (item 1).

## Observações técnicas

- ID fixo da especialidade Odontologia já está em uso no arquivo: `f0cfaa0a-2a67-4176-97de-a7072c37077c`.
- A tabela `medico_especialidades` já é consultada em vários pontos; a nova query segue o mesmo padrão.
- Não altera a criação do orçamento nem o vínculo com o odontograma.

## Validação

- Buscar um orçamento odonto na agenda e tentar vincular a um clínico geral → deve bloquear.
- Vincular a um dentista → deve permitir normalmente.
- Orçamento não-odonto → comportamento inalterado.
- Dividir orçamento odonto com múltiplos itens → só dentistas aparecem no select de médico.

Confirma que devo aplicar assim nas 3 clínicas?
