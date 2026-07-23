## Objetivo
Ajustar o comportamento do toggle **"Exibir apenas a data selecionada"** na Agenda para que ele altere **apenas** o escopo de data (mostrando somente o dia selecionado, em vez do intervalo semanal/período), preservando todos os demais filtros ativos (Profissional, Tipo, Situação, Especialidade, Cliente etc.).

## Comportamento
- **Antes:** proposta anterior (descartada) iria ignorar todos os outros filtros quando o toggle estivesse ativo.
- **Depois:** o toggle limita a consulta e a filtragem em memória a `data = data_selecionada`. Os outros filtros continuam sendo aplicados normalmente, como já ocorre quando o toggle está desligado.

## Clínica-alvo
Confirmar antes de aplicar: a mudança vale para as **3 clínicas** (SFP, Menino Jesus e a terceira) ou apenas uma específica? Como é um ajuste puramente de UX/filtro sem regra de negócio por clínica, o padrão sugerido é aplicar global (nas 3), mas aguardo confirmação.

## Detalhes técnicos
- Arquivo: `src/routes/_authenticated/app.agenda.tsx`.
- Localizar o bloco que consome o estado do toggle "Exibir apenas a data selecionada" e ajustar somente o predicado de data (query ao servidor + filtro em memória) para `dia === dataSelecionada`.
- **Não alterar** os demais predicados de filtro; eles permanecem no pipeline como hoje.
- Sem mudanças de schema, RPC ou regra de negócio.

## Validação
- Ativar o toggle com data X e verificar que apenas agendamentos do dia X aparecem.
- Combinar com filtro de Profissional / Situação / Cliente e confirmar que a interseção é respeitada.
- Desativar o toggle e confirmar que a Agenda volta ao comportamento de período normal.

## Pendências
- Confirmar clínica-alvo (todas as 3 ou uma específica) antes de aplicar.
