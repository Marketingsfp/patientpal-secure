## Problema

Na visão Lista da Agenda, a numeração da ficha (001, 002, …) é calculada por **(dia + profissional)**, ignorando a agenda. Por isso, quando o Dr. João Hélio tem duas agendas ("Consultas" e "Exames") geradas no mesmo dia, elas compartilham um único contador — e os números aparecem intercalados entre as duas telas (001 na Consultas, 002 na Exames, 003 na Consultas, …), como nas fotos.

## Correção

Alterar a chave de contagem em `fichaPorId` no arquivo `src/routes/_authenticated/app.agenda.tsx` (por volta da linha 2424) para incluir também o `agenda_id`.

**Antes:**
```
chave = `${dia}::${prof}`
```

**Depois:**
```
chave = `${dia}::${prof}::${agenda_id ?? "__sem_agenda__"}`
```

Assim, cada agenda do médico passa a ter sua própria sequência começando em 001, independente das outras agendas do mesmo dia, mesmo quando geradas simultaneamente.

## Escopo e riscos

- Alteração pontual, só em código de apresentação (cálculo da ficha na visão Lista). Não mexe em banco, RLS, criação de agendamento nem em `criar-agendamento.functions.ts`.
- Agendamentos antigos sem `agenda_id` (ex.: Atendimento Múltiplo) caem num bucket próprio `__sem_agenda__` e continuam numerados de forma estável entre reloads.
- Não altera o filtro por número de ficha nem a ordenação (horário → nome do paciente).

## Validação depois de aplicar

1. Abrir a agenda de "Consultas" do Dr. João Hélio → fichas 001, 002, 003…
2. Abrir a agenda de "Exames" do mesmo dia/médico → fichas 001, 002, 003… (independente).
3. Gerar as duas agendas simultaneamente e confirmar que cada uma mantém sua sequência.
4. Filtro "Nº Ficha" continua funcionando dentro de cada agenda.