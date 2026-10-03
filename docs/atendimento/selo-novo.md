# Selo Novo na Inbox do OS ZAP

O selo com ícone de envelope identifica uma conversa atribuída a uma atendente
que ela ainda não abriu neste atendimento. É independente das mensagens não
lidas: novas mensagens no mesmo atendimento não fazem o selo voltar.

## Quando aparece e desaparece

- Aparece nas conversas reais abertas com responsável humano definido.
- Sai quando a responsável tem o chat carregado e visível. Não exige rolar até
  a última mensagem; o contador de mensagens não lidas segue sua própria regra.
- Hover, prefetch, cache, carregamento e aba oculta não confirmam abertura.
- Administração e supervisão não retiram o selo de outra pessoa.
- Transferência muda o responsável e a entrada na Inbox: a destinatária recebe
  uma conversa nova, mesmo se já a atendeu em um ciclo anterior.
- Encerramento esconde o selo. Depois de uma nova mensagem do paciente, ele volta
  quando o novo atendimento for atribuído a uma atendente. Na etapa da Nina ou
  na fila sem responsável não é apresentado como novo para uma atendente.
- Não altera a posição dos cards na fila de chegada.

## Persistência e compatibilidade

Reutiliza `inbox_entrada_em`, que já muda em atribuições e reaberturas. A chave
considera a conversa, a atendente e essa entrada, preservando microssegundos.
O servidor acrescenta `INBOX_ABERTA_ATENDENTE` em `atend_conversa_eventos`, com
o usuário autenticado, data do banco e `detalhes.entrada_em`. Não altera eventos
históricos, mensagens, atribuição, status ou recibos do WhatsApp.

O registro só é aceito após associação à clínica, acesso à conversa, permissão
operacional e conferência da atribuição atual. Uma confirmação atrasada só vale
para a entrada original; não retira Novo de uma transferência ou reabertura.
Repetições consultam o evento existente. Duas abas simultâneas podem acrescentar
duas evidências do mesmo ciclo; ambas representam a mesma abertura e não alteram
o resultado. Não há alteração estrutural nem migration nova.

Para conversas que já estavam em andamento, o selo considera a leitura
operacional existente (ou sua leitura individual, com RLS da própria conta) somente
se foi feita pelo responsável atual após a entrada
atual. Evidências de outra pessoa ou de um ciclo anterior são desconsideradas.
Sem essa evidência, é necessário abrir novamente; não se inventa leitura passada.

As consultas são em lote, limitadas às conversas autorizadas, à clínica e às
atribuições atuais. A consulta de eventos é paginada. A primeira abertura atualiza
os cards via Realtime, inclusive para supervisores; o evento não cria um aviso no
chat do paciente. F5 recompõe o selo com os registros persistidos.

## Validação

Os testes de `conversa-nova` cobrem primeira abertura, mensagens posteriores,
transferência, reabertura, leitura existente, supervisão, isolamento por clínica,
confirmações atrasadas, precisão de timestamps, paginação e falhas de gravação.
Serviços simulados não equivalem a um teste operacional com contas reais no Lovable.
