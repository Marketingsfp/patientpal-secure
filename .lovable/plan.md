# Corrigir filtro da Agenda (modo "a partir de")

## Diagnóstico

Na Agenda (rota `/app/agenda`, `src/routes/_authenticated/app.agenda.tsx`, função `load` em ~L1473), a busca no banco:

1. Ordena por `inicio` **descendente** (L1483).
2. Quando "Exibir apenas a data selecionada" está **desligado**, aplica `gte(inicio, dataRef 00:00)` sem limite superior (L1541-1546) e limita a `range(0, 9999)` (L1548-1550).

O problema: com ordem **descendente** + `gte(hoje)`, o Postgres retorna as 10.000 linhas **mais futuras** (agendamentos meses/anos à frente na clínica), e o dia selecionado (ex.: 16/07/2026) fica **fora da janela retornada**. Resultado: lista vazia.

Quando o usuário marca "Exibir apenas a data selecionada", o `lte(inicio, 23:59)` restringe ao próprio dia e a lista aparece. Ou seja, o filtro de situação (Agendado) e demais filtros nunca foram o problema — o defeito está no modo padrão "a partir de".

## Correção

Arquivo único: `src/routes/_authenticated/app.agenda.tsx`, dentro da função `load`.

- Quando `apenasData === false` (modo "a partir de"), aplicar `order("inicio", { ascending: true })` na query, para que as 10.000 linhas retornadas comecem no dia selecionado e sigam em direção ao futuro — garantindo que o dia escolhido apareça primeiro.
- Manter `order("inicio", { ascending: false })` (comportamento atual) quando `apenasData === true`, preservando exatamente o comportamento que já funciona.

Isso é apenas troca de ordenação condicional na query; a ordenação visual da lista já é recalculada em memória por outros `useMemo` (agrupamento por horário/ficha), então a UI final não muda.

## Fora do escopo

- Nenhuma mudança em regra de negócio, filtros de situação, permissões, RLS, componentes de UI ou outros módulos.
- Nenhum outro arquivo é tocado.

## Validação após aplicar

- Selecionar data 16/07/2026 + Situação "Agendado" + clicar Exibir → deve listar os agendamentos do dia e seguintes.
- Marcar "Exibir apenas a data selecionada" → deve continuar listando só o dia (comportamento atual preservado).
- Filtros combinados (profissional, cliente, especialidade) devem continuar funcionando nos dois modos.
