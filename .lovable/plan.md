## Objetivo
Na tela `/app/agenda` (visão "Lista"), mover as colunas **Data** e **Horário** para antes da coluna **Ficha**, mantendo a ordem: Data → Horário → Ficha → Profissional → Cliente → Serviço → Situação → Ações.

## Escopo
- Arquivo: `src/routes/_authenticated/app.agenda.tsx` (tabela da visão Lista).
- Ajustar cabeçalho (`<thead>`) e cada linha do corpo (`<tbody>`) para refletir a nova ordem.
- Preservar checkbox de seleção (se existir) como primeira coluna antes de Data.
- Manter classes de largura/alinhamento existentes de cada célula — apenas reordenar.

## Fora do escopo
- Visão "Por médico" (grid por horário) — não é afetada.
- Lógica de filtros, cálculos, cores de status, ações.
- Versão mobile (`ResponsiveCards`) — se houver `renderCard`, ajustar apenas se a ordem de exibição também estiver explícita lá; caso contrário, deixar como está.

## Validação
- Abrir `/app/agenda` em 1280px e conferir ordem das colunas via Playwright + screenshot.
- Conferir que os dados de cada linha continuam alinhados com o header (nenhum `<td>` fora de posição).