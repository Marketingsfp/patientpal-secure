# Histórico das conversas: lotes de dez

A Inbox abre com os dez registros mais recentes, contando mensagens de paciente,
Nina, atendentes, marcadores do sistema e eventos internos na mesma paginação.
O agrupamento visual dos eventos continua valendo: dez registros podem formar
menos de dez balões. Notas do contato e o resumo da Nina são painéis separados.

Ao subir e chegar a até 100 px do início, a tela busca mais dez registros.
O carregamento é indicado no topo e a mensagem em leitura mantém sua posição.
Abrir a conversa não dispara páginas antigas em cascata. Mouse, toque e teclado
podem acionar a busca; o controle no topo também permite carregar ou repetir
uma tentativa que falhou. Pedidos simultâneos são bloqueados, e respostas de
outra conversa ou de uma seleção anterior são descartadas.

`listarPaginaHistorico` substitui as duas consultas independentes da Inbox.
Mantém autenticação, associação à clínica, autorização da conversa e RLS.
Cada fonte retorna no máximo onze candidatos; o servidor combina a ordem,
devolve dez registros e indica se há mais. Não consulta contagem total e não
altera nem apaga mensagens, eventos, atribuição ou auditoria.

O cursor contém instante, origem e ID. Isso permite atravessar registros de
duas tabelas com o mesmo horário sem saltos ou duplicação, preservando os
microssegundos do PostgreSQL. A reconexão percorre novidades em ordem crescente,
em páginas de dez, até recuperar a lacuna. O cache reabre só a janela recente;
as mensagens novas continuam chegando pelo Realtime.

Os endpoints antigos de mensagens/eventos permanecem disponíveis para o
WebMCP. A abertura de uma mensagem reportada mantém sua janela de contexto
específica, e o cursor normal continua percorrendo o intervalo entre ela e o
trecho recente. Não há migration nem mudança de retenção de dados.

Validação: testes da consulta conjunta (limites, empates, reconexão, acesso e
falhas), testes React da rolagem (posição, concorrência, troca de conversa e
retry), regressões de cache/scroll e prévia isolada no Chrome com dados fictícios.
