# Carga independente do navegador

O executor `carga-v5-servidor` substitui o disparador da página para testes novos.
Depois que Iniciar confirma a criação da carga, preparação e mensagens continuam
sem a aba. A redação da Luna ainda termina antes dessa confirmação. A interface
apenas acompanha o estado e permite encerrar. Executores v3/v4 são preservados.

## Funcionamento

O INSERT da carga e a primeira tarefa são transacionais. O banco enfileira uma
requisição HTTP por tarefa via pg_net. A preparação usa um slot e a mesma rotina
de baseline/reset já existente. Ao terminar a preparação, abre até dez slots,
conforme os limites revisados. Cada requisição processa uma mensagem e sua
conclusão agenda a próxima, sem aguardar os outros pacientes.

A reserva do slot é adicional à reserva por lead existente: duas entregas do
mesmo callback só podem ser assumidas uma vez; respostas antigas não liberam um
slot novo. As entradas físicas continuam usando a chave idempotente por carga e
índice. Uma pendência bloqueia somente as mensagens seguintes daquele lead.

Não há processamento de várias mensagens em um Promise.all no mesmo handler, nem
promessas soltas após a resposta. pg_net inicia o HTTP quando a transação confirma,
conforme sua [documentação oficial](https://supabase.com/docs/guides/database/extensions/pg_net).

O cron faz uma varredura SQL curta a cada segundo para esperas e recuperação. Sem
carga elegível ele não faz requisições HTTP nem chamadas de IA. O modo simultâneo
encadeia imediatamente tarefas liberadas; o cadenciado conserva o intervalo global,
com resolução aproximada de um segundo para esperas agendadas. Isso não elimina o
tempo do modelo nem garante capacidade do runtime para dez gerações simultâneas.

## Segurança, falhas e limites

- Só o servidor autenticado pode criar/alterar cargas v5 e suas amostras. Políticas
  restritivas fecham a escrita direta do cliente para esse executor. Membros mantêm
  acesso aos relatórios conforme as políticas existentes de clínica.
- A nova rota exige token interno, comparação constante e payload estrito contendo
  apenas carga, slot e token da tarefa. Clínica, autoria, texto e destino vêm do banco.
- Vínculo ativo do criador é revalidado ao despachar, assumir e renovar. Desativar
  a fila ou encerrar o teste impede novos envios; chamadas já aceitas podem terminar.
- Callback sem confirmação expira em 60 segundos. Trabalho assumido renova uma
  reserva de 420 segundos a cada 20 segundos. As reservas do executor também mantêm
  sua quarentena; uma retomada concilia entrada/resultado antes de gerar novamente.
- Três falhas consecutivas de entrega/execução encerram o teste com motivo visível.
  Não há repetição infinita de uma tarefa que o serviço não consegue atender.
- Mensagens, duração e orçamento continuam limitados pelo executor comum. O consumo
  de chamadas em andamento pode ultrapassar o saldo observado antes das respostas.
- Testes continuam restritos aos leads de homologação. Não altera catálogo, prompt,
  agenda real, mensagens reais de WhatsApp, dados financeiros ou históricos clínicos.

## Alteração no banco e ativação

Migration: `20260919210000_nina_carga_servidor.sql` (aditiva e reexecutável).

- Tabelas novas: `nina_carga_servidor_config` (ativo, URL) e
  `nina_carga_servidor_tarefas` (carga/slot, token, datas, requisição, tentativas/falhas).
- Índice parcial de cargas v5 ativas; trigger de início/transição de fase em
  `nina_teste_carga`; seis políticas restritivas de escrita nas cargas/amostras.
- RPCs internas: disponibilidade, despachar, assumir, renovar e finalizar; nenhuma
  fica acessível a anon/authenticated. Token próprio em `sistema_job_tokens`.
- Job `nina-carga-servidor`, usando pg_cron e pg_net já instalados. Não substitui
  o watchdog nem sua rotina dos 30 minutos de atendimento.

A migration deixa a configuração **inativa**. Primeiro publicar o código e
verificar `GET /api/public/nina/carga` retornando `carga-v5-servidor`. Depois ativar
`nina_carga_servidor_config.ativo` e verificar `nina_carga_servidor_disponivel()`.
Iniciar falha antes da redação paga se a infraestrutura estiver indisponível.

Rollback operacional: desativar essa configuração e encerrar cargas ativas pela
tela, aguardando as requisições em voo. Preservar tabelas, tarefas e resultados.
O código anterior continua atendendo os testes legados. Não remover históricos.

## Validação

Testes isolados cobrem o processamento real do executor com chamadas de modelo
simuladas, 2/5/10 pacientes, continuação do paciente livre, ordem por lead,
cancelamento, autenticação, rejeição de payload extra e preparação no servidor.
Regressões de UI comprovam que a página não prepara nem dispara cargas v5.

`scripts/test-nina-carga-servidor.mjs` executa a migration duas vezes em PostgreSQL
descartável (PGlite), com HTTP local simulado. Verifica fila, concorrência, callbacks
antigos/duplicados, retomada, limite de falhas, vínculo revogado e políticas RLS.

Isso não substitui a verificação do ambiente publicado. Após ativação, validar uma
carga pequena fechando a página e conferir entradas/resultados persistidos antes de
ampliar para 5/10 pacientes. Falhas de compilação do Lovable devem ser resolvidas
antes da ativação; não usar uma URL de preview temporária como destino do cron.

Validação local em 19/09/2026: 131 testes de carga aprovados, 38 verificações SQL,
checagem de tipos e ESLint sem erros. Migration instalada no Cloud e comparada
com o arquivo (MD5 `97e02c91c6bf94c3fcee2571a8c2f2ff`), seis políticas conferidas,
zero tarefas e configuração desativada. Ativação depende da publicação da rota.
