## Problemas identificados

**1. "Nenhum paciente selecionado" ao trocar de agenda:** após selecionar os 6 pacientes do Dr. Alex (01/06) e mudar o filtro para Dr. Eugenio (03/06), a lista `items` em memória é recarregada e passa a conter só os agendamentos do Dr. Eugenio. Quando você clica em um slot disponível, `confirmarReagLoteNoSlot` faz `items.filter(a => ids.includes(a.id))` — como os IDs originais (Dr. Alex) não estão mais em `items`, o resultado fica vazio e dispara o toast de erro. Os IDs ficam guardados em `reagLoteIds` mas a "fonte de verdade" dos dados depende da lista filtrada na tela.

**2. Fichas vazias bloqueando seleção:** hoje `abrirReagLote` bloqueia toda a operação se algum item selecionado for slot vazio (`DISPONÍVEL`). O comportamento desejado é simplesmente ignorar esses itens vazios e seguir com o restante. A ordem sequencial no destino já funciona corretamente: a partir do slot clicado, ocupa os próximos `N` slots livres em sequência.

## Mudanças em `src/routes/_authenticated/app.agenda.tsx`

### Em `abrirReagLote`

- Remover slots vazios (`DISPONÍVEL`) da seleção em vez de bloquear; manter o bloqueio apenas para itens com status `realizado`.
- Se a seleção, depois de descartar os vazios, ficar com 0 pacientes válidos, mostrar toast informativo e abortar.

### Em `confirmarReagLoteNoSlot`

- Não depender mais de `items` para reconstruir as fontes. Buscar os agendamentos de origem direto no Supabase pelos IDs guardados em `reagLoteIds` (campos: `id, paciente_id, paciente_nome, inicio, fim, medico_id, status, procedimento, observacoes, data_pagamento`), filtrando novamente quem for `realizado` ou já tiver virado `DISPONÍVEL` desde a seleção.
- Continuar ordenando por `inicio` ascendente para preservar a ordem original das fichas.
- O resto da lógica (achar a ficha clicada no destino, pegar os próximos N slots livres a partir dela, mover paciente e liberar a origem) permanece igual — já é exatamente o "seguir ordem sequencial" descrito no exemplo (fichas 001 e 004 do origem → fichas 007 e 008 do destino, ignorando lacunas no destino se houver slots ocupados no meio).

### Faixa azul de status

- Atualizar a contagem mostrada (`reagLoteIds.length`) para refletir só os pacientes válidos depois do filtro de `abrirReagLote` (já é o caso, mas precisa continuar consistente).

## Fora do escopo

- Não mexer na lógica de reagendamento individual.
- Não alterar a UI de filtros nem o comportamento da seleção em si.
