## Objetivo

Criar 10 agendamentos de teste, todos posicionados na coluna **"Atendimento"** do Fluxo do paciente, distribuídos entre médicos variados. Em seguida, validar que os mesmos pacientes aparecem corretamente na aba **Atendimento médico** ao selecionar cada profissional.

## Escopo dos dados

- **Clínica**: `7570ddde-8c1c-4b55-ba72-cf12b2a6c940` (a mesma dos testes anteriores).
- **Data**: hoje (04/07/2026), horários entre 08:00 e 17:00 em `America/Sao_Paulo`.
- **Médicos**: até 10 médicos ativos distintos da clínica (se houver menos que 10 ativos, distribuir em rodízio).
- **Pacientes**: reutilizar pacientes reais existentes da clínica (evita passar por filtros de `paciente_nome != 'DISPONIVEL'`).
- **Estado**: `fluxo_etapa = 'atendimento'`, `status = 'confirmado'`, `prioridade` variada (~70% normal, 20% prioritario, 10% urgente).
- **Marcação**: prefixo `[TESTE FLUXO 2]` em `procedimento` para permitir remoção fácil depois.

## Passos

1. Consultar `medicos` ativos e `pacientes` da clínica para montar as combinações.
2. Inserir os 10 agendamentos via `INSERT` único.
3. Validar por query: agrupar os agendamentos criados por `medico_id` e confirmar que cada um tem pelo menos 1 registro na etapa `atendimento`.
4. Abrir a preview na aba **Atendimento médico** com Playwright, iterar pelos médicos que receberam pacientes de teste, screenshotar a fila e conferir visualmente que os pacientes aparecem.
5. Reportar o resultado (médicos ok / eventuais faltas) e listar os IDs criados para remoção futura.

## Fora do escopo

- Não altero código.
- Não crio senhas, pagamentos, triagens ou movimentos financeiros.
- Não removo os dados de teste anteriores (`[TESTE FLUXO]`).
- Não mexo em RLS/schema.

## Reversão

Todos os 10 registros carregam `procedimento` iniciado por `[TESTE FLUXO 2]`, então uma remoção posterior é feita com `DELETE FROM agendamentos WHERE procedimento LIKE '[TESTE FLUXO 2]%'`.
