## Objetivo

Inserir 100 agendamentos de teste na clínica atual, com data de hoje, distribuídos pelas 7 colunas do Fluxo do paciente para validar espaçamentos.

## Distribuição pelas colunas (100 total)

- Aguardando: 20
- Recepção: 15
- Caixa: 15
- Triagem: 15
- Atendimento: 15
- Exame: 10
- Finalizado: 10

Mix de prioridades: ~70% `normal`, ~20% `prioritario`, ~10% `urgente` para testar a borda colorida.

## Como serão criados

- Uma única inserção em `agendamentos` com 100 linhas.
- `clinica_id` = clínica atual (`7570ddde-8c1c-4b55-ba72-cf12b2a6c940`).
- `paciente_id` = reaproveitar 100 pacientes reais existentes dessa clínica (evita registros órfãos e passa no filtro que exige `paciente_id`).
- `paciente_nome` = nome real do paciente (para nunca cair no filtro `DISPONÍVEL`).
- `inicio` = hoje entre 08:00 e 17:59, em incrementos de ~6 min.
- `procedimento` = mistura de "Consulta clínica", "Retorno", "Exame de sangue", "Raio-X", "USG", "Ultrassom" (os que casam com regex de exame vão para coluna Exame).
- `fluxo_etapa` conforme distribuição acima.
- `prioridade` conforme mix.
- `medico_id` e demais campos: nulos/valores padrão.

## Como identificar/remover depois

Todos os 100 registros terão `procedimento` prefixado com `[TESTE FLUXO]` para permitir remoção rápida via um `DELETE` futuro.

## Fora do escopo

- Não altera código do front nem estilo das colunas.
- Não mexe em outras tabelas (senhas, pagamentos, triagens).
- Não cria pacientes novos.