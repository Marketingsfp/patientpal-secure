## Objetivo
Povoar a aba **Fluxo do paciente** (`/app/fluxo`) com dados variados para teste visual e funcional das 7 etapas.

## Passos

1. **Identificar a clínica ativa** do usuário (via `clinica_memberships` do usuário logado ou clínica mais recentemente usada) para escopar as alterações.

2. **Limpar o fluxo do dia**
   - Nos agendamentos de **hoje** da clínica, remover os pacientes reais colocando `paciente_id = NULL`, `paciente_nome = 'DISPONÍVEL'` e `fluxo_etapa = 'aguardando_recepcao'`.
   - Isso "esvazia" o quadro sem apagar horários históricos.

3. **Selecionar 140 pacientes reais** já cadastrados na clínica (variados por nome). Se houver menos que 140, reciclar os disponíveis distribuindo entre as etapas.

4. **Criar 140 agendamentos novos** para hoje, 20 em cada uma das 7 etapas:
   - `aguardando_recepcao`, `recepcao`, `caixa`, `triagem`, `atendimento`, `exame`, `finalizado`
   - Horários espaçados ao longo do dia (07:00 → 19:00) para não sobrepor.
   - Variação de:
     - **Procedimento**: consulta clínica, cardiologia, pediatria, exame (raio-X, USG, tomografia — força coluna "exame"), curativo, etc.
     - **Prioridade**: mistura de `normal`, `prioritario` e `urgente` (aprox. 70/20/10%).
     - **Médico**: distribuir entre os médicos ativos da clínica.

5. **Verificar** com `read_query` a contagem final por `fluxo_etapa` para confirmar 20 em cada.

## Detalhes técnicos
- Usar `supabase--insert` (INSERT/UPDATE em tabela existente `agendamentos`), sem migration.
- Campos preenchidos: `clinica_id`, `paciente_id`, `paciente_nome`, `procedimento`, `medico_id`, `inicio`, `fim`, `fluxo_etapa`, `prioridade`, `status = 'confirmado'`.
- Não mexer em `pagamentos`, `triagens`, `senhas` etc. — apenas o quadro de fluxo.
- Reversível: os agendamentos criados ficam marcados com uma observação `[SEED FLUXO TESTE]` para permitir limpeza futura fácil.

## Resultado esperado
Ao abrir `/app/fluxo` com a data de hoje, cada uma das 7 colunas exibe exatamente 20 cards de pacientes variados, com prioridades e procedimentos misturados.
