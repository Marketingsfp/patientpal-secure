# Ordem dos cards do atendimento real

Regra solicitada em 19/09/2026: mensagens posteriores do paciente e respostas
da atendente atualizam prévia e não lidas, mas não fazem o card subir.
Uma nova entrada na fila humana, nova atribuição ou reabertura entra no topo.
O usuário confirmou que atendimento encerrado e reaberto conta como novo e
que “Maior tempo esperando” conserva sua ordenação pela espera.

## Implementação

- `atend_conversas.inbox_entrada_em` registra a referência persistente de ordem.
  O gatilho grava somente criação, transição de encerrado para aberto,
  passagem da Nina para a fila humana ou atribuição a um novo responsável.
- Mudanças de mensagem, leitura, `assigned_at` sem troca de responsável,
  resumo e passagem de `fila_pendente` para ativa mantêm a referência.
- Registros anteriores recebem a maior data entre criação, atribuição,
  encaminhamento e evento de reabertura da mesma clínica/conversa.
  Não se usa `ultima_msg_em` nem o momento da implantação para esse preenchimento.
- A consulta ordena por essa referência e UUID antes do limite de 200 registros.
  O Realtime usa o mesmo critério. Envios locais mantêm a posição.
- O recarregamento respeita a ordem devolvida pelo servidor: espera segue
  a métrica canônica e resolvidas seguem a data de resolução.
- A homologação não usa esta lista e o gatilho ignora suas transições.
  Posse, distribuição, RLS, agenda e financeiro mantêm suas regras.

## Banco e implantação

Migração: `20260919170000_atend_inbox_ordem_estavel.sql`.
Adiciona uma coluna, um índice parcial para conversas reais, uma função e um
gatilho de apresentação. Não remove objetos, mensagens nem eventos; não altera
RLS, números de conversa ou datas de criação. O preenchimento inicial é um
UPDATE do metadado novo e passa pelos gatilhos existentes, inclusive o de
`updated_at`. Pode provocar uma atualização da lista durante a implantação.

SQL aplicado pelo editor Cloud do Lovable em 19/09/2026. Conferência somente
de leitura: 389 conversas reais, nenhuma referência nula, um gatilho ativo e
índice presente. Não foi editado manualmente o histórico de migrations.
O SQL pode ser reexecutado pelo migrador oficial sem reinicializar posições.

Publicar o aplicativo após essa preparação do banco. Reversão funcional:
retornar o código anterior da Inbox e manter a coluna/índice sem uso; não é
necessário apagar registros nem reverter atendimentos.

## Validação

- 574 testes da Inbox/atendimento passaram, incluindo sete cenários novos de
  posição fixa, nova atribuição, reabertura, reconexão, desempate e filtros.
- Verificação de tipos do projeto passou.
- ESLint dos módulos de ordenação, atualização e novos testes: nenhum erro
  (avisos preexistentes de `any` nos módulos antigos).
- PostgreSQL temporário em memória (PGlite), usando a migração real: aplicação,
  repetição idempotente, preenchimento histórico, atualizações sem movimento,
  primeira resposta, atribuição, handoff, reabertura de `closed`/`finished` e
  isolamento da homologação passaram. Fixture mínima, sem rede/banco da clínica.

Comandos:

```text
bun test src/lib/atendimento/__tests__ src/lib/atendimento/selecao-conversa-fase4.test.ts
bun run typecheck
node scripts/test-atend-inbox-ordem.mjs <caminho-do-pglite/dist/index.js>
```

Nenhuma mensagem de paciente real foi enviada para testar a alteração.
