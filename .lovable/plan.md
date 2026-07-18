## Problema

Na aba **Histórico** do contrato, quando dois eventos acontecem no mesmo minuto (mesmo timestamp), a criação do contrato aparece **abaixo** da alteração — como na foto: "Contrato criado" às 17:15 aparece depois de "Contrato alterado" às 17:15.

Isso ocorre porque a RPC ordena por `ts DESC` e, em empate, o Postgres devolve na ordem interna (o registro de alteração — inserido logo depois — vem primeiro).

## Correção

Ajustar apenas o front (arquivo `src/components/contratos/historico-contrato-tab.tsx`), sem mexer na RPC:

- No `useMemo` que gera `filtrados`, aplicar um `sort` estável adicional:
  1. Primeiro por `ts` decrescente (mantém a ordem cronológica atual).
  2. Em caso de empate no `ts`, dar prioridade ao evento `contrato_criado`, que passa a aparecer sempre no topo do grupo daquele instante.

Nenhuma outra lógica muda — filtros, busca e demais tipos de evento continuam idênticos.

## Escopo

- Alterado: `src/components/contratos/historico-contrato-tab.tsx` (só o comparador de ordenação).
- Fora do escopo: RPC `contrato_historico`, migrações, outros tipos de evento.

## Validação

- Abrir o contrato da foto (QUEDIMA SILVA) na aba Histórico e confirmar que "Contrato criado" às 17:15 aparece acima de "Contrato alterado" às 17:15.
- Conferir que a ordem geral (mais recente no topo) continua igual para todos os demais eventos.
