## Objetivo

Na Agenda, quando o agendamento for **atendimento externo**, a linha deve ficar com fundo lavanda bem claro e o botão de cifrão ($) deve ficar roxo.

## Situação atual (verificada)

- A marcação de externo grava `origem_externa = true` na tabela `agendamentos` (`src/lib/agenda/atendimento-externo.functions.ts`).
- A Agenda (`src/routes/_authenticated/app.agenda.tsx`) **não carrega** esse campo: ele não está na lista `agendaSelect` (linha ~2441) nem no tipo `Agendamento` (linha ~118).
- A cor da linha é decidida por `bgClass` / `borderLeft` (linhas ~8750-8765), hoje só com regras para estorno pendente, realizado e presente.
- O botão $ aparece em dois lugares: ação compacta por ícone (~linha 8940) e botão "Cobrar/Pago" da versão em cards/mobile (~linha 8605).

## O que será feito

1. **Carregar o dado**
   - Adicionar `origem_externa` (e `origem_clinica_nome`, útil para o tooltip) ao `agendaSelect` e ao tipo `Agendamento`, propagando no mapeamento dos resultados.

2. **Cor da linha**
   - Nova condição no cálculo de `bgClass`: se `origem_externa`, aplicar lavanda bem claro (overlay translúcido no padrão já usado no arquivo, ex. `bg-violet-500/10 hover:bg-violet-500/15`) com borda esquerda violeta.
   - Precedência: estorno pendente continua tendo prioridade; externo vem antes de "realizado/presente" para não perder o destaque.

3. **Ícone $ roxo**
   - Nos dois botões de cobrança, quando `origem_externa`, usar borda/texto violeta (`border-violet-400 text-violet-600 hover:bg-violet-50`) em vez do verde/rosa, com tooltip "Atendimento externo — sem lançamento em caixa".

4. **Mobile/cards**
   - Aplicar o mesmo destaque lavanda no card correspondente para manter consistência.

## Detalhes técnicos

- Sem mudança de banco: a coluna `origem_externa` já existe.
- Sem alteração de regra de negócio: mudança puramente visual + inclusão do campo no `select`.
- As cores usam a escala violet do Tailwind com overlay translúcido, seguindo o comentário já existente no arquivo sobre contraste em modo escuro.
