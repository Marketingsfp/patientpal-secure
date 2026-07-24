# Adicionar coluna "DIA" na Agenda

Escopo: todas as 3 clínicas (mudança visual global na tabela da Agenda).

## O que muda

Na tabela da Agenda (visualização Lista, desktop), antes da coluna **DATA**, aparecerá uma nova coluna **DIA** com a abreviação do dia da semana em português, 3 letras, maiúsculas, sem acento:

- 23/07/26 → `QUI`
- 24/07/26 → `SEX`
- 25/07/26 → `SAB`
- 26/07/26 → `DOM`
- 27/07/26 → `SEG`
- 28/07/26 → `TER`
- 29/07/26 → `QUA`

Fora do escopo:
- Visualização "Por médico" (não tem coluna Data).
- Cards mobile/tablet (a data já aparece por extenso lá).
- Comprovantes, impressões, exports do Excel.

## Detalhes técnicos

- Arquivo: `src/routes/_authenticated/app.agenda.tsx` (tabela desktop da view Lista).
- Adicionar cabeçalho `<th>DIA</th>` imediatamente antes de `DATA`.
- Adicionar célula correspondente em cada linha, calculando o dia da semana a partir do mesmo campo de data já usado na linha (parse local, sem UTC, para evitar o off-by-one que já corrigimos antes na numeração de ficha).
- Mapeamento fixo `['DOM','SEG','TER','QUA','QUI','SEX','SAB']` para garantir 3 letras sem acento, independentemente da locale do navegador.
- Estilo: mesma tipografia da coluna DATA, em `tabular-nums`, largura mínima suficiente para 3 letras.
- Linhas de slot vazio e linhas agrupadas exibem o DIA normalmente (é derivado da data da linha).

## Validação

- Abrir `/app/agenda` em cada uma das 3 clínicas e confirmar que:
  1. A coluna DIA aparece antes de DATA.
  2. Para 23/07/26 mostra QUI; navegando o filtro de data para outros dias, o valor acompanha.
  3. Alinhamento da tabela permanece correto (nenhuma coluna desloca).
  4. Ordenação e filtros continuam funcionando.
- Não há mudança de dados, RLS ou regra de negócio; risco operacional baixo.
