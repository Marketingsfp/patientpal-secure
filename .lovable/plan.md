
## O que muda na Agenda

Hoje, quando você escolhe uma data no filtro (ex.: 01/07/26), o sistema traz **apenas** os agendamentos daquele dia. Por isso os agendamentos do Nélio para 16/07 não aparecem quando você escolhe 01/07.

Depois desta alteração:

- **Padrão**: a data selecionada passa a significar "**a partir de**". Escolhendo 01/07/26, você vê todos os agendamentos do dia 01/07 em diante, inclusive datas futuras (16/07, agosto, etc.).
- **Novo checkbox** "Exibir apenas a data selecionada": quando marcado, o filtro volta a se comportar como hoje, trazendo só o dia escolhido.
- O seletor de **intervalo de datas** (calendário com data inicial + data final) continua funcionando igual: se você definir uma data final, o sistema respeita o intervalo.

## Onde vai aparecer

O checkbox "Exibir apenas a data selecionada" fica logo abaixo do campo **Data**, na mesma barra de filtros da tela `/app/agenda` (Lista e Por médico), sem ocupar espaço extra na tabela.

## Impacto (4 eixos)

- 💰 **Financeiro**: neutro.
- ⏱️ **Operacional**: recepção deixa de precisar ampliar manualmente a janela de datas ou trocar filtros para encontrar o próximo agendamento de um paciente. Elimina cliques em quase todo atendimento em que a recepcionista precisa consultar "o próximo do paciente".
- 😊 **Experiência**: paciente é informado imediatamente sobre próximos agendamentos, sem espera.
- 🛡️ **Segurança/auditoria**: nenhuma alteração — só leitura, RLS existente permanece.

## Detalhes técnicos

Arquivo único: `src/routes/_authenticated/app.agenda.tsx`.

1. **Estado**: mudar valor inicial de `apenasData` de `true` para `false` (linha 860).
2. **Consulta** (bloco `load`, linhas 1524–1543): reescrever para:
   - `apenasData = true` → mantém `gte(dataRef 00:00) && lte(dataFim ?? dataRef 23:59)` (comportamento atual).
   - `apenasData = false`:
     - `gte(dataRef 00:00)` sempre;
     - se `dataFim` estiver definido (usuário abriu o calendário e escolheu intervalo) → `lte(dataFim 23:59)`;
     - caso contrário, **sem** limite superior — remove a janela fixa de 7/365 dias que existe hoje. O `.range(0, 9999)` do PostgREST continua limitando a 10 mil linhas, o que combinado aos filtros existentes (profissional, cliente, situação) é seguro.
3. **UI** (barra de filtros, ~linha 6503): adicionar um `<label>` compacto com `Checkbox` controlando `apenasData` / `setApenasData`, logo abaixo do `DataRefField`.
4. **Reset**: se `limparFiltros` restaurar `apenasData`, garantir que volta ao novo padrão (`false`).

## Fora de escopo

- Não altera Agenda V2 nem Agenda Express.
- Não altera regras de negócio, permissões, dados financeiros, agendamentos existentes ou consultas de outros módulos.
- Não muda o formato do calendário/range picker existente.
