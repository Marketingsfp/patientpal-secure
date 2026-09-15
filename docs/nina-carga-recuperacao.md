# Correção do executor de carga e recuperação da Nina

Data: 15/09/2026. Registro da validação local, anterior ao envio ao GitHub/Lovable.
Este relatório não confirma aplicação de migration nem ativação do job no banco remoto.

## Incidente e limites da conclusão

Na carga `6d21ec8c-4b65-424d-bed5-cf01a74e5d63`, chegaram 10 entradas e foram encontradas
8 respostas. O log remoto registrou `Worker exceeded memory limit.` e HTTP 502 às
19:48:08 UTC (16:48:08 em São Paulo). As duas conversas sem resposta eram as dos
leads de RX de tórax e mamografia. Houve consulta às ferramentas; esse incidente
não comprova ausência de informação na base de conhecimento.

O executor acumulava pipelines concorrentes dentro de uma requisição e gravava os
resultados da rodada somente depois de `Promise.allSettled`. Uma morte do worker
nessa janela deixava respostas persistidas sem os respectivos contadores. Não foi
identificada por profiling a alocação exata responsável pelo excesso de memória.

## Alterações

- O executor novo (`carga-v3-item`) inicia no máximo uma mensagem por requisição.
  Cada resultado é salvo antes de avançar; o cursor é reconstruído pelos índices
  das amostras, com ID estável e inserção idempotente.
- Uma entrada já aceita não dispara novamente o modelo. A retomada consulta a
  mensagem física e o comprovante de saída; entradas pendentes aguardam o watchdog.
- Uma pendência impede mensagens posteriores da mesma conversa, mas permite
  avançar em outra conversa. Cancelamento, sessão, autorização, orçamento, ritmo e
  reserva persistente continuam sendo verificados.
- Reservas abandonadas de cargas novas são retomadas após a quarentena existente.
  Cargas antigas mantêm o comportamento conservador e não são reativadas automaticamente.
  Falhas capturadas consecutivas do executor são limitadas a três.
- O job autenticado existente recupera no máximo um lote por chamada. Quando não
  assume um lote, pode continuar uma carga nova de homologação, mesmo com a página
  fechada, revalidando o vínculo ativo do criador com a clínica. Essa continuação
  exige `homologacao_ativa` e o job configurado e funcionando.
- O painel separa resultados registrados, entradas físicas, saídas confirmadas e
  pendências. Cargas antigas também podem mostrar 10 entradas/8 saídas, mesmo com
  contador de amostras zerado. Essa leitura não altera registros históricos.
- `success` da chamada ao modelo deixou de ser apresentado como prova de entrega.
  A UI identifica a telemetria parcial da última chamada vinculada a cada resultado.
- Há log numérico de recursos antes da chamada ao modelo: quantidade de mensagens,
  caracteres, ferramentas e heap quando suportado. Não registra conteúdo do paciente.
- A migration ainda não publicada foi corrigida para referenciar a tabela real
  `nina_teste_carga`, no singular.

O watchdog preserva a política conservadora: uma geração abandonada sem snapshot
ou um envio com resultado externo incerto pode terminar em falha explícita. Não há
repetição cega de possíveis efeitos de ferramentas ou mensagens já enviadas.

## Validação realizada

**152 testes aprovados, 0 falhas, 563 asserções, 13 arquivos.**
PostgreSQL 18.6 local e isolado; sem modelo pago, WhatsApp real ou banco remoto.

- 10 mensagens em 10 requisições, com contagem incremental após cada resposta.
- Queda após aceitar a entrada, após persistir a saída e entre amostra e contador.
- Falha de gravação de amostra, disputa entre executores, sessão alterada e cancelamento.
- Retomada sem repetir modelo/saída e avanço de outro lead enquanto um aguarda recuperação.
- Página fechada, job desabilitado e revalidação da autorização do criador.
- Saída pendente ou de outra conversa rejeitada como prova de entrega.
- Caso legado de 10 entradas/8 respostas com contador zerado.
- Migration e claims concorrentes no PostgreSQL: 43 entradas com estado terminal e
  zero pendências. Esse total inclui falhas e handoff provocados, não 43 respostas bem-sucedidas.
- Regressões de agrupamento, planejamento, preflight e montagem/continuidade da UI.

Com um banco local **descartável** chamado `nina_watchdog_test` já criado:

```powershell
$env:NINA_WATCHDOG_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:55439/nina_watchdog_test'
bun test src/lib/nina/__tests__/watchdog-postgres.test.ts src/lib/nina/__tests__/watchdog.test.ts src/lib/nina/__tests__/carga-por-item.test.ts src/lib/nina/__tests__/carga-controle.test.ts src/lib/nina/__tests__/carga-handlers.test.ts src/lib/nina/__tests__/carga.test.ts src/lib/nina/__tests__/agrupamento-persistido.test.ts src/lib/nina/carga-preflight.test.ts src/lib/nina/carga-planejamento.test.ts src/lib/nina/carga-redacao-luna.test.ts src/lib/nina/carga-fase4-contexto-limpo.test.ts src/components/nina/carga-teste-ui.test.ts src/components/nina/carga-teste-montagem.test.ts
```

A suíte SQL recria o schema `public` apenas desse banco local dedicado. Nunca apontar
para um banco com dados úteis. Os testes de UI e processadores usam adaptadores simulados.

Lint dos arquivos principais alterados: sem erros. `git diff --check`: sem erros.
O typecheck terminou com os dois erros anteriores de `number | null` em
`src/lib/atendimento.functions.ts:3018` e `src/lib/atendimento/distribuicao.server.ts:28`.
O build foi tentado com `bunx vite build`, mas o plugin `@lovable.dev/mcp-js`
interrompeu a configuração ao comparar barras Windows com o caminho normalizado
de `src/routes`, antes de compilar a aplicação. Não há build completo aprovado.

O conjunto acima verifica recuperação e persistência; não prova capacidade de atender
10 chamadas simultâneas do modelo real nem garante ausência de novos erros de memória.
O limite efetivo de uma mensagem por requisição aparece no painel, separado da
concorrência solicitada no planejamento do teste.

## Pendências para uso remoto

1. Resolver os impedimentos existentes de typecheck/build no ambiente de publicação.
2. Validar a migration em uma cópia completa do banco de homologação, com seus triggers/RLS.
3. Publicar o código junto com a migration; configurar e verificar o job autenticado.
4. Habilitar homologação, mantendo produção desativada inicialmente.
5. Repetir as 10 conversas reais de teste e conferir entrada, saída e estado por ID;
   provocar uma interrupção e verificar a retomada sem duplicação.
6. Medir fila, latência, consumo e memória no runtime publicado antes de aumentar a carga.

## Preparação do envio ao Lovable

Antes do envio autorizado pelo usuário, foi incorporado por fast-forward o commit
`b89566b8c` de importação de serviços, sem conflitos com esta alteração.
Os dois impedimentos de typecheck descritos acima foram resolvidos corrigindo apenas
as declarações de `_max_simultaneas` e `_versao` em `src/integrations/supabase/types.ts`
para aceitar `null`, como já permitem as funções SQL. Não há mudança do comportamento
de presença ou capacidade. `bun run typecheck` passou e os 12 testes existentes de
presença manual e contrato de distribuição passaram. O impedimento do build local
no plugin do Lovable/Windows permanece; o resultado no Lovable deve ser conferido
depois da sincronização.

A migration usada nesta validação foi
`supabase/migrations/20260915170000_nina_watchdog_processamento.sql`, SHA-256
`8838fa377b2ab7de89f379d389b5d67471942076a26d01258699ceee057c60cd`.

As duas mensagens do incidente antigo não foram reenviadas. A revisão adiciona
recuperação para execuções rastreadas e corrige a leitura dos registros antigos;
não inventa respostas nem muda estados históricos para declarar sucesso.

Depois da validação, o banco descartável foi removido e os servidores PostgreSQL
locais iniciados nesta verificação foram desligados. A instalação usada foi
PostgreSQL 18.6 no Ubuntu/WSL; nenhum serviço de testes ficou ativo.
