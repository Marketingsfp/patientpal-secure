## Problema

A agenda do "ELETROCARDIOGRAMA" no dia 25/06 foi criada pelo botão **"Criar/gerar horários"**, que pré-gera 36 linhas vazias na tabela `agendamentos` (com `paciente_nome = 'DISPONIVEL'` e `paciente_id = null`).

Ele **não** preenche `medico_disponibilidades`. Como o cálculo de slots (no formulário da agenda e no diálogo "Dividir orçamento") só lê `medico_disponibilidades` / `enfermagem_recurso_disponibilidades`, o sistema acha que não há agenda e cai no fallback "Sem agenda configurada — horário livre". Por isso o seletor mostra só `09:00` em vez dos 36 horários reais.

## Correção

Tratar slots pré-gerados como fonte oficial de horários quando não houver disponibilidade semanal configurada.

### 1. `src/routes/_authenticated/app.agenda.tsx` (fluxo single — foto 1)

- Na função que calcula horários disponíveis, depois de consultar `medico_disponibilidades` (ou `enfermagem_recurso_disponibilidades`) e antes do fallback "horário livre", buscar em `agendamentos` no dia selecionado as linhas com `paciente_id IS NULL` **ou** `paciente_nome = 'DISPONIVEL'` (status ≠ cancelado) para o profissional/recurso.
- Se houver placeholders: usá-los como universo de slots, com `inicio` virando o horário disponível e excluindo-os do conjunto de "ocupados" (senão entrariam em conflito consigo mesmos).
- Guardar em estado um mapa `horario → placeholder_id`. Ao salvar o agendamento, se o slot escolhido tem placeholder, fazer `UPDATE` na linha pré-gerada (preenchendo paciente, procedimento, status, orcamento_id, etc.) em vez de `INSERT`. Isso evita duplicar slot e mantém a numeração de Ficha.
- Só cair no fallback "Sem agenda configurada" quando não houver nem disponibilidade semanal nem placeholders.

### 2. `src/components/agenda/dividir-orcamento-dialog.tsx`

- Mesma alteração na função `computarSlots`: se não há disponibilidades, retornar a lista de placeholders do dia em vez de `null`.
- No `handleSalvar`, quando o slot escolhido corresponde a um placeholder, atualizar a linha existente em vez de inserir. Para grupos com placeholder, manter o vínculo com `agendamento_orcamento_itens` usando o `id` da linha atualizada.

### 3. Bloqueio quando não houver mais slots

- Se todos os placeholders já estão tomados e não há disponibilidade semanal, mostrar "Nenhum horário livre nessa data" (igual ao caminho atual de disponibilidades), em vez de "horário livre".

## Não muda

- Comportamento para profissionais com `medico_disponibilidades` configurada continua igual.
- Layout da tela, regras de orçamento parcial e demais validações permanecem intactos.

## Resultado esperado

Ao abrir o formulário para "ELETROCARDIOGRAMA" em 25/06, o select "Horário disponível" listará todos os 36 horários (08:00, 08:15, … ) gerados pela agenda, e o agendamento ocupará a linha pré-existente em vez de criar outra paralela.