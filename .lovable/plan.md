## Situação

Você pediu para restaurar a agenda do Dr. Carlos Eduardo (dia 29/07) para o estado de 15 minutos atrás.

### O que verifiquei no banco

- **60 slots vazios** ("DISPONIVEL") foram criados hoje às 13:35 (UTC) no intervalo das **08:00 às 12:55** (horário BR), para o dia 29/07.
- Os **13 pacientes agendados** já existiam desde **17/07** (criados às 14:15) e continuam nos horários originais das **14:20 às 17:40** (horário BR). Nenhum foi apagado, movido ou sobrescrito.
- **Nenhum novo agendamento ou pagamento** ocorreu nos últimos 15 minutos para esse médico/dia — os `updated_at` mais recentes dos pacientes são de 22/07 e 23/07 13:13 (antes da criação dos slots hoje às 13:35).
- Sobre a "sequência das fichas": o campo `ficha_numero` está **NULL** para todos os registros — a ficha é calculada dinamicamente pela ordem cronológica dos slots que existem no dia. Como os 13 pacientes originais estão em horários salteados (14:20, 14:30, 14:40, 14:50, 15:30, 15:40, 16:40, 16:50, 17:00, 17:10, 17:20, 17:30, 17:40), a numeração deles antes da criação dos 60 slots era **1 a 13 na ordem cronológica desses horários**. Ao voltar ao estado anterior (excluindo os 60 slots), eles voltam a ocupar as fichas 1 a 13 nessa mesma ordem — não em fichas alternadas, pois não havia outros slots livres intercalados antes.

## Plano

Excluir os 60 slots vazios criados hoje para o Dr. Carlos Eduardo no dia 29/07:

```sql
DELETE FROM agendamentos
WHERE medico_id = 'd552ab1c-63a9-4c88-a537-1ca4fc43641c'
  AND inicio::date = '2026-07-29'
  AND paciente_id IS NULL
  AND created_at::date = CURRENT_DATE;
```

Isso restaura o estado exato de 15 minutos atrás. Nenhum agendamento de paciente é tocado.

## Aviso

Sem alterações nos 15 minutos anteriores. Nenhum pagamento ou novo agendamento nesse intervalo — apenas a criação dos 60 slots que serão removidos.