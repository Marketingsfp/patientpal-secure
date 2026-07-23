## Objetivo
Adicionar 60 novos slots vazios na agenda do Dr. Carlos Eduardo Gonçalves Monteiro em 29/07/2026, começando às 18:10 (horário local), com intervalo de 4 minutos, indo até o último slot iniciando às 22:06 (fim 22:10).

## Contexto verificado
- Última ficha atual encerra às 18:00 local (21:00 UTC).
- Agenda: `agenda_id = c0d1f074-157a-4291-8a04-32f602f6aeb9`, `medico_id = d552ab1c-…`, `clinica_id = 7570ddde-…`.
- Timestamps são gravados em UTC (America/Sao_Paulo = UTC−3).

## O que será feito
Inserir 60 linhas em `agendamentos` (via ferramenta de insert), todas com paciente vazio e mesmos IDs de agenda/médico/clínica, com horários locais:

```text
Ficha 61 → 18:10
Ficha 62 → 18:14
…
Ficha 120 → 22:06 (fim 22:10)
```

Em UTC: `inicio` de 21:10 até 01:06 (dia seguinte), duração de 4 min cada.

## Observação
- A numeração de ficha aparece automaticamente na tela pela ordem cronológica (o campo `ficha_numero` fica em branco nos slots livres, igual aos 60 já existentes). Os pacientes que forem sendo agendados nesses novos horários receberão fichas 61–120 na sequência.
- Nenhum registro existente será alterado. Apenas inserção de 60 novos slots vazios.
