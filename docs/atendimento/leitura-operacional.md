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

Aplicar `20260917233000_zap_leitura_operacional.sql`, depois da migration da
fila individual em Pausa, antes de publicar a aplicação. A migration cria
`atend_leitura_operacional`, suas permissões e assinatura Realtime, e atualiza
as rotinas de registro e contagem. A permissão de leitura operacional é
consultada pela tela antes de qualquer registro.

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
Após publicação, validar visualmente com Telefonia e supervisão abertas na
mesma conversa. Essa validação autenticada não foi executada em produção.
