## Objetivo

Na tela **Triagem - Enfermagem**, quando um paciente tem várias consultas/exames no mesmo dia, mostrar **um único card** por paciente. Ao salvar a triagem, os dados vão para **todos os agendamentos** do paciente naquele dia (todos os médicos recebem).

## Mudanças na UI

Arquivo: `src/routes/_authenticated/app.triagem-enfermagem.tsx`

1. Após carregar os agendamentos em etapa `triagem`, agrupar por `paciente_id` (fallback `paciente_nome`).
2. Renderizar **um card por paciente** mostrando:
   - Nome do paciente.
   - Lista de todos os agendamentos do dia daquele paciente: horário · procedimento · médico (uma linha por agendamento).
   - Badge de prioridade se qualquer agendamento for prioritário/urgente (prevalece o mais alto).
3. Botões **Chamar** e **Atender** ficam no card do paciente (não por agendamento).
4. O diálogo de triagem exibe o nome do paciente e a lista resumida dos atendimentos do dia, para a enfermeira saber para quais médicos os dados serão enviados.

## Mudanças no comportamento

1. **Chamar**: gera uma única senha com o nome do paciente (como já faz hoje), sem mudar a lógica.
2. **Salvar / Salvar e liberar**:
   - Inserir **uma linha em `triagens_enfermagem` por agendamento** do paciente naquele dia (mesmo payload de sinais vitais/anamnese, mudando apenas `agendamento_id`). Assim cada médico/atendimento referencia a triagem.
   - Em "Salvar e liberar", atualizar `fluxo_etapa` de **todos** esses agendamentos:
     - Se o procedimento bater com regex de exame (`exame|raio|usg|ultra|tomo|ressona`) → `exame`.
     - Caso contrário → `atendimento`.
   - Cada agendamento é avaliado individualmente para a próxima etapa (um pode ir para `atendimento` e outro para `exame`).
3. Após salvar, recarregar a lista — o paciente sai da fila de triagem porque todos os seus agendamentos avançaram.

## Detalhes técnicos

- Novo tipo `PacienteTriagem = { paciente_id, paciente_nome, prioridade, agendamentos: Ag[] }`.
- `agrupados = useMemo(...)` constrói os grupos a partir de `ags`.
- `abrir(grupo)` e `chamarPaciente(grupo)` passam a receber o grupo (usam `grupo.agendamentos[0]` para id da senha/paciente).
- `salvarEAvancar`: monta `payload` base sem `agendamento_id`, então faz `insert` de um array com um item por agendamento; depois, se `avancar`, faz `update` em lote via `.in("id", ids)` separando por próxima etapa.
- Sem mudanças de schema; `triagens_enfermagem` já tem `agendamento_id` por linha, então múltiplos inserts cobrem todos os médicos.
- Nenhuma alteração nas demais telas (atendimento, exames) — elas continuam lendo a triagem pelo `agendamento_id` correspondente.
