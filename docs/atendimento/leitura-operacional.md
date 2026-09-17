# Contador de mensagens não lidas — Zap OS

Correção de código e permissão: o indicador do atendimento real representa a
leitura operacional da equipe. Admin, gestor e supervisor observam esse número
sem consumir mensagens. Telefonia e outros perfis operacionais com acesso
autorizado à conversa registram a leitura ao abrir e visualizar as mensagens.

Antes, a lista contava todo o histórico após o marcador individual do usuário
logado, e a aplicação só registrava leitura para a responsável atual. Por isso,
um administrador podia continuar vendo 238 mensagens após uma atendente ler.

## Comportamento

- Uma leitura confirmada atualiza o badge da equipe, inclusive das sessões de
  supervisão, por Realtime. Falha de gravação não esconde o badge.
- O registro espera o perfil, a conversa carregada e a aba visível. Abertura
  pela auditoria em mensagem antiga não consome as mensagens recentes.
- Mensagens posteriores ao limite lido continuam pendentes. O limite segue a
  ordem `recebida_em, id`, não o horário da execução da requisição.
- Admin, gestão e supervisão não podem registrar leitura real por chamada
  direta ao banco nem por `automatico: false`.
- Ler não responde, assume, encerra ou ativa uma conversa na fila individual.
  As restrições de acesso à conversa e à clínica continuam sendo verificadas.
- O console de homologação mantém seus marcadores individuais de testador,
  separados do indicador operacional do atendimento real.

## Banco e publicação

O SQL foi aplicado pelo Lovable em 17/09/2026 com o identificador
`20260917170404`, depois da migration da fila individual em Pausa.
A definição canônica é `20260917170404_d758959e-1e5c-43ac-9994-9f30c52f6720.sql`. Ela cria
`atend_leitura_operacional`, suas permissões e assinatura Realtime, e atualiza
as rotinas de registro e contagem. A permissão de leitura operacional é
consultada pela tela antes de qualquer registro.

O arquivo `20260917233000_zap_leitura_operacional.sql` agora apenas verifica os
objetos, funções, índice, RLS e Realtime da canônica. Isso preserva os dois
identificadores sem executar duas vezes o mesmo `CREATE TABLE`. O histórico
consultado no projeto conectado não continha `20260917233000`; não houve
edição manual de `supabase_migrations`. Não reaplicar a canônica no banco em
que já está registrada. Para instalações que tenham aplicado somente o ID
antigo, conferir equivalência e reconciliar o histórico antes de executar a
canônica, pois ela não é idempotente.

### Correção dos quatro erros de compilação

O commit `122fd6837` regenerou os tipos enquanto a migration ainda estava
pendente e removeu `atend_permite_leitura_operacional`. Isso produziu dois
TS2345 (RPC desconhecida) nas linhas 472 e 780 de `atendimento.functions.ts`
e dois TS2367 nas linhas 476 e 787 (retorno sem tipo booleano reconhecido).
A tela também falhava com função ausente no schema cache.

Após aplicação, os tipos foram regenerados a partir do banco: tabela e duas
funções novas voltaram ao contrato, sem `any` ou supressão de erros. O Lovable
registrou `tsc --noEmit` com saída 0 e 23 chamadas autenticadas sem o erro.
O código gerado está nos commits `538ce0d1f` e `dcb3fdcf0`. A lista de conversas
também carregou na verificação independente no Chrome. Não houve publicação
do frontend ou alteração do prompt da Nina nesta correção.

A verificação local independente reproduziu os quatro erros em `38db8ebb6`
e terminou sem erros depois de sincronizar os tipos gerados em `dcb3fdcf0`.

Não há limpeza ou preenchimento retrospectivo: mensagens, registros
individuais em `atend_leituras` e `atend_conversas.unread_count` permanecem.
O primeiro acesso operacional após a publicação estabelece o novo limite.
Leituras históricas de administradores não são tratadas como leitura da equipe.
O benefício é operacional; não há alteração financeira ou de agendamento.

Para reverter, reverter o código e preparar uma migration compensatória que
restaure as definições anteriores das RPCs. Preservar a nova tabela como
histórico; não apagar mensagens ou marcadores. Aplicar somente o código sem a
migration deixa a permissão operacional indisponível e não ativa a correção.

## Validação reproduzível

- `bun test src/lib/atendimento/__tests__`
- `python3 scripts/test-zap-leitura-postgres.py --pg-bin <binário PostgreSQL>`
- `bun run typecheck` (usar heap de Node ampliado neste repositório).

O teste SQL usa apenas dados sintéticos e PostgreSQL local por socket, sem
conectar ao Supabase ou enviar mensagens. Cobre perfis, histórico, isolamento
entre clínicas, fila em Pausa, mensagens concorrentes e o console de testes.
Na correção de 17/09/2026, os 536 testes do atendimento passaram e o PostgreSQL
local validou os oito cenários operacionais, mais a repetição da migration de
compatibilidade e detecção de RLS ausente. A abertura da Inbox foi validada
com a sessão administrativa autenticada. O teste simultâneo com Telefonia e
supervisão permanece uma validação operacional posterior; não foram enviadas
mensagens nem criadas reservas para testar esta correção.
