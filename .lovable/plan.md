## Diagnóstico

Na tela **Atendimento médico** (`src/routes/_authenticated/app.atendimento-ia.index.tsx`):

- A consulta da fila filtra `fluxo_etapa IN ('aguardando_recepcao','recepcao','caixa','triagem','atendimento')` (linhas 97 e 157). Assim que o médico conclui um atendimento, o agendamento vira `fluxo_etapa = 'finalizado'` (ver `app.agenda.tsx:1985` e `2824`) e **some** da fila.
- A coluna `#` é apenas `idx + 1` sobre a lista já filtrada (linha 305). Como a lista encolhe, os pacientes seguintes sobem uma posição — foi o que aconteceu entre a foto 1 (Luan Carlos = #2) e a foto 2 (Luan Carlos = #1).

## Correção

1. **Trazer os finalizados de hoje para a mesma consulta**
   - Adicionar `'finalizado'` no `.in('fluxo_etapa', […])` das duas queries (a de médicos com fila do dia — linha 97 — e a `carregarFila` — linha 157).
   - Escopo continua o mesmo: mesma clínica, mesmo `medico_id`, mesmo dia (`inicio` entre 00:00 e 23:59). Ninguém de outro dia entra.
   - Continuar filtrando pacientes `DISPONÍVEL` e sem `paciente_id`, como já é feito.

2. **Estabilizar a numeração**
   - Manter a mesma ordenação híbrida atual (prioridade + horário), mas com todos os itens do dia dentro da lista os números deixam de "andar" quando alguém é atendido, porque o item finalizado ocupa o lugar dele.
   - `#` continua sendo o índice ordenado, agora estável durante o dia.

3. **Marcar visualmente "Atendido" e desabilitar ação**
   - Detectar `it.fluxo_etapa === 'finalizado'`.
   - Aplicar `className="opacity-60"` no `<TableRow>` desses itens (mantém legível, mas indica que já foi feito).
   - Substituir o botão **Atender** por um badge verde `Atendido` (ícone `Check`), sem `onClick`. Nada de navegação, nada de refazer atendimento pelo mesmo botão.
   - Manter todas as demais colunas visíveis (hora, paciente, serviço, pagamento, triagem, prioridade) para o médico continuar tendo o histórico do dia à vista.

4. **Realtime**
   - A subscription atual já reage a qualquer `event: '*'` em `agendamentos` filtrado por `medico_id`, então a transição para `finalizado` também dispara `carregarFila`. Sem mudança de subscription.

5. **Contador do label**
   - `Fila de atendimento (N)` hoje mostra o total da lista. Vou trocar para exibir **pendentes / total** (ex.: `Fila de atendimento (2 pendentes de 3)`), calculando pendentes como itens com `fluxo_etapa !== 'finalizado'`. Isso preserva a informação útil que o número original dava e evita confusão de "por que aumentou".

## Fora de escopo

- Não altero o comportamento do botão para pacientes com pagamento pendente (permanece desabilitado com o mesmo tooltip).
- Não altero a query de médicos "com fila do dia" para incluir finalizados na descoberta de médico automático — os finalizados sozinhos não devem forçar seleção de médico se não houver ninguém pendente; hoje esse caminho só usa quem tem `triagem`/`atendimento`, o que continua correto.
- Não mexo em RLS nem em índices — a filtragem por `medico_id + inicio` já é performante e o adicional `finalizado` cai no mesmo dia.

## Verificação (Playwright + banco)

1. Após o build, abrir a rota `/app/atendimento-ia`, selecionar um médico com pelo menos 2 pacientes na fila do dia, capturar screenshot inicial.
2. Simular a conclusão de um atendimento via SQL controlado (`update agendamentos set fluxo_etapa='finalizado' where id=…`) num agendamento de teste.
3. Recarregar, capturar novo screenshot e confirmar:
   - o paciente atendido continua na tabela, com badge **Atendido** e linha esmaecida;
   - a numeração `#` dos demais permanece igual à do primeiro screenshot;
   - o contador do cabeçalho reflete "pendentes de total".
4. Reverter o `fluxo_etapa` do teste para o estado original.
