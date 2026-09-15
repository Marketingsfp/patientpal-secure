# Watchdog de processamento da Nina

Atualização após o incidente de memória de 15/09/2026: veja
[Correção do executor e recuperação da carga](nina-carga-recuperacao.md).
Esse relatório complementa a validação inicial abaixo; contagens e hash da
validação inicial são históricos, anteriores às correções do executor por item.

## Fase 1 — diagnóstico do código (15/09/2026)

Base: `da7f37225`. Análise estática; não é uma constatação de incidentes no banco de produção.

Fluxo atual: webhook `whatsapp.$clinicaId.ts` / console `teste-console.server.ts` →
`persistirEntradaNina` (unicidade de wa_message_id) → revisão persistida →
`aguardarTurnoNina` → `nina_batch_registrar` → espera de 1 s, teto de 2,5 s →
`nina_lock_adquirir` → `nina_batch_reivindicar` → validação de dono/sessão →
`nina_batch_iniciar_processamento` → `gerarRespostaNina` → contexto e prompt →
AI Gateway → Tool Broker → Confidence Engine → finalização → transporte →
persistência da saída → conclusão do lote no finally → liberação da trava.

Estruturas existentes: `whatsapp_mensagens`, `nina_message_batches`,
`nina_message_batch_itens`, `nina_conversa_locks`, `nina_conversa_revisoes`,
`nina_execucoes`, `nina_trace_eventos`, registros de entrega/confiança,
`nina_teste_carga` e `nina_teste_carga_amostras`.

Concorrência existente: advisory lock no registro do lote, índice único para
lote COLLECTING por clínica/telefone, claim transacional, token de proprietário,
lease de 90 s e heartbeat de 20 s; espera do chamador limitada a 25 s.
Revisão bloqueia respostas antigas. O lease de teste de carga é separado do lote.

Falhas encontradas:

- A recuperação de lotes é oportunista, chamada por outra entrada; não existe
  varredura periódica de processamento. COLLECTING pode ficar sem worker.
- Depois de iniciar a geração, a recuperação antiga transforma PROCESSING em
  SUPERSEDED; isso não comprova resposta nem transferência.
- O finally do webhook conclui PROCESSED inclusive após falha no envio.
- O console registra erro de persistência mas pode retornar RESPONDIDA e declarar
  response_saved pela existência de texto em memória.
- Texto do WhatsApp é enviado antes de gravar a mensagem. Morte entre essas etapas
  deixa resultado incerto. Repetir o POST pode duplicar o envio.
- A renovação pode continuar indefinidamente quando a geração fica travada:
  o adapter explicitamente não tem timeout. Falhas de rede lançadas não entram
  no laço de retry do gateway.
- O cache de idempotência do Tool Broker é um Map da invocação. Não prova que
  uma escrita não aconteceu em uma execução anterior.
- Os testes de carga classificam o retorno da chamada; não conciliam todos os
  IDs de entrada persistidos com estados terminais duráveis.

## Estratégia

Evoluir os lotes existentes, sem segunda fila. Separar desfecho de processamento
de entrega e de telemetria do modelo. Registrar a aceitação e o resultado por
mensagem física, para que batching não altere a contagem.

Reaproveitar RPCs e travas com token; recuperar somente com claim atômico,
heartbeat vencido e estado compatível. Heartbeat válido protege o dono mesmo se
o lease nominal venceu. Prazo máximo cerca a execução: trabalho atrasado perde
autorização para novos efeitos.

Guardar a resposta final antes da entrega. Retomar a entrega sem repetir IA.
Resultado externo incerto não autoriza retry cego: terminar failed com motivo
explícito; só retomar quando houver prova de ausência do efeito ou confirmação.
Não é possível prometer exactly-once de um POST externo só com um lock local.

Reutilizar pg_cron/pg_net e autenticação por `sistema_job_tokens`. Preparar
ativação explícita, inicialmente desativada; nenhuma migration aplicada nem
job ativado em produção nesta tarefa.

Áreas previstas: migration aditiva de lotes/mensagens e RPCs; burst/lock;
gateway/adapter; checkpoints do núcleo; transporte WhatsApp e console;
job de recuperação; conciliação do teste de carga; testes SQL e TypeScript.

Impacto financeiro: retries de IA podem consumir créditos, por isso são limitados.
Operacional e paciente: entradas deixam de desaparecer e falhas ficam visíveis.
Segurança: autorização de worker verificada no banco, sem conteúdo clínico nos
eventos técnicos. Risco principal: duplicação de efeitos e mensagens atrasadas;
o desenho prefere falha explícita quando não há prova para repetir. As regras
clínicas, System Prompt e política de confiança permanecem sob o fluxo atual.

Estimativa: mudança ampla de infraestrutura; os resultados serão apresentados
após testes de concorrência, sem prazo de publicação presumido.

## Implementação e evidência local

Classificação: correção de concorrência, consistência de dados e integração externa.
O código e a migration estão preparados localmente. **Produção e homologação remotas
não foram alteradas; nenhuma migration, job, commit ou publicação foi enviada.**

A validação abaixo demonstra o mecanismo em PostgreSQL real isolado e em adaptadores
com falhas controladas. Não representa um teste de atendimento real, uma auditoria
de respostas clínicas nem uma prova de entrega no aparelho do paciente.

### 1. Causas mais prováveis

As falhas descritas na Fase 1 foram encontradas no código: recuperação dependente de
nova entrada, conclusão no finally sem comprovante, ausência de timeout no adapter,
janela entre envio e gravação e telemetria do console baseada em texto na memória.
São caminhos capazes de explicar desaparecimentos; não foi feita consulta aos logs
remotos para atribuir um incidente específico a cada um deles.

### 2–3. Antes e depois

Antes, lote PROCESSED não comprovava envio e um lote abandonado dependia de outra
mensagem para ser encontrado. Depois:

1. O commit da entrada registra received quando o ambiente está habilitado.
2. A mesma tabela de lotes registra queued; cada mensagem física aponta ao lote.
3. O claim original estabelece processing com token, processing_id, tentativa e prazo.
4. O núcleo continua usando contexto, prompt, ferramentas e confiança existentes.
5. A resposta gerada e o texto finalizado são salvos antes do envio.
6. Uma saída pendente e seu checkpoint de entrega são criados na mesma transação.
7. Só um claim por parte permite enviar. A confirmação da Meta ou persistência do
   console é registrada; só então o lote pode terminar completed.
8. O finally conclui com prova ou falha explícita e libera a reserva original.
9. O job periódico reclama os mesmos lotes e chama os mesmos processadores.

Não há segunda fila, novo provedor ou substituição do motor de confiança. O webhook
teve seu bloco de resposta extraído para um módulo reutilizável; autenticação,
persistência da entrada e roteamento continuam na rota existente.

### 4. Arquivos afetados

| Área | Arquivos |
| --- | --- |
| Coordenação | src/lib/nina/watchdog.ts, watchdog-contexto.server.ts, watchdog.server.ts |
| Transporte WhatsApp | src/lib/nina/whatsapp-processamento.server.ts; src/routes/api/public/whatsapp.$clinicaId.ts; src/lib/whatsapp.server.ts |
| Homologação e entrada | src/lib/nina/teste-console.server.ts; entrada-persistida.server.ts |
| Modelo e ferramentas | src/lib/nina/ai-gateway.server.ts; adapters/gemini-adapter.server.ts; tool-broker.server.ts |
| Job | src/routes/api/public/nina.watchdog.ts; src/routeTree.gen.ts |
| Conciliação | src/lib/nina/watchdog-metricas.server.ts; carga.functions.ts; src/components/nina/CargaTeste.tsx |
| Testes | src/lib/nina/__tests__/watchdog.test.ts; watchdog-postgres.test.ts; agrupamento-persistido.test.ts; fixtures/watchdog-runtime.fixture.ts; watchdog-gateway.fixture.ts |
| Compatibilidade das fixtures | fixtures/teste-console-mj53.fixture.ts; fixtures/webhook-agrupamento.fixture.ts |

Os nomes abreviados na tabela são relativos à pasta indicada na mesma célula.

### 5. Migration

supabase/migrations/20260915170000_nina_watchdog_processamento.sql.

Aditiva: mantém tabelas e estados legados. Acrescenta:

- nina_watchdog_config: ativação por ambiente e limites, inicialmente desativada.
- whatsapp_mensagens: nina_status, nina_batch_id, nina_finished_at, nina_error.
- nina_message_batches: estado/etapa do watchdog, token, processing_id, revisão,
  contador de tentativas, retry, deadline, snapshot da resposta e recuperações.
- nina_batch_entregas: checkpoint por lote e parte, vinculado à saída existente;
  guarda payload necessário ao reenvio, tentativas e comprovante do transporte.
- nina_teste_carga.watchdog_ativo: registra se a carga nasceu com rastreamento,
  permitindo reprovar mesmo quando nenhuma entrada é encontrada.
- Índices de pendências e associação; triggers de entrada, lote, proteção e auditoria.

Reutiliza created_at, first_message_at, claimed_at, processamento_iniciado_em,
processed_at, erro_tecnico e os campos de lease já existentes. A chave física é
wa_message_id; a chave de entrega é o par (batch_id, parte).

As funções novas são restritas a service_role. A configuração não é legível pelo
frontend. Checkpoints de entrega têm RLS por clínica. Um trigger impede que o cliente
altere o estado de processamento. Nenhum dado histórico é migrado para estado novo.

### 6. RPCs, funções e agendamento

Novas RPCs: nina_watchdog_iniciar, nina_watchdog_checkpoint,
nina_watchdog_finalizar, nina_watchdog_reivindicar, nina_watchdog_entrega_preparar,
nina_watchdog_entrega_claim, nina_watchdog_entrega_resultado,
nina_watchdog_vincular_saida, nina_watchdog_evento e nina_watchdog_configurar_job.
As funções terminadas em trigger/estado/entrada_evento implementam a sincronização
e a proteção das tabelas, não são endpoints de cliente.

RPCs evoluídas: nina_batch_registrar, nina_batch_iniciar_processamento,
nina_batch_concluir_seguro, nina_batch_recuperar_travados, nina_lock_adquirir e
nina_lock_renovar. nina_batch_reivindicar, nina_lock_liberar e nina_revisao_* continuam
participando do fluxo original.

Endpoint: POST /api/public/nina/watchdog, autenticado com x-job-token e comparação
em tempo constante. O segredo é obtido da estrutura existente sistema_job_tokens,
nunca do navegador. O job nina-watchdog-processamento usa pg_cron e pg_net já adotados
no projeto. A migration não agenda nem ativa esse job automaticamente.

### 7–8. Lease e heartbeat

Padrões: lease 90 s, renovação a cada 20 s, heartbeat considerado antigo após 60 s,
prazo de execução de 300 s. O banco configura lease, heartbeat antigo, prazo,
fila e tentativas. POLITICA_WATCHDOG concentra os padrões do runtime, timeout de
modelo/transporte, paralelismo e backoff; a renovação existente continua em 20 s.

Recuperação exige ausência de lease válido **e** de heartbeat recente. Valida token,
lote, estado e predecessor. O claim usa advisory lock da conversa e row lock com
SKIP LOCKED para o lote. A troca do token e a atribuição do processamento são atômicas.

Prazo excedido impede novos checkpoints/efeitos e novas renovações. O job aguarda a
expiração da reserva, não remove uma reserva apenas porque atingiu certa idade.
Lock sem lote e lock de execução terminal só são liberados com evidência de ausência
de trabalho ativo e heartbeat antigo. Conversas distintas podem executar em paralelo;
um lote posterior não ultrapassa predecessor não terminal da mesma conversa.

### 9. Retries

| Situação | Comportamento |
| --- | --- |
| Lote queued sem worker | Claim após o prazo da fila, padrão 30 s |
| Abandono antes de gerar | Retoma o mesmo lote, com novo token e tentativa |
| Timeout/429/5xx na chamada ao modelo | Retry limitado no gateway, dentro da mesma execução; não repete ferramentas já executadas pelo broker |
| Geração iniciada, worker perdido, sem snapshot | failed / GENERATION_OUTCOME_UNKNOWN; não reexecuta possíveis escritas |
| Resposta salva, rejeição explícita 429 no transporte | retry_pending; retoma o snapshot e a entrega |
| Transporte rejeita com erro permanente | failed |
| Timeout/rede/5xx de transporte ou ACK perdido | failed com resultado externo incerto; nenhum reenvio cego |
| Entrega comprovada, worker morreu antes de concluir | Recupera completed sem nova inferência/envio |
| Limite atingido | failed explícito; não há retry infinito |

Padrão de três tentativas de processamento e três tentativas de entrega. Modelo usa
o limite da configuração no contexto rastreado. Backoff do runtime: base 2 s, teto
30 s, jitter; o agendador roda a cada minuto, portanto o reenvio ocorre na varredura
posterior ao next_retry_at. A conclusão de retry respeita também o prazo da entrega.
O timeout do modelo é 60 s por chamada e o de envio 30 s. O prazo geral cerca as
rodadas e ferramentas; não é ampliado indefinidamente por heartbeat.

### 10. Idempotência e significado dos estados

- O índice de entrada e a revisão por mensagem impedem nova entrada física no retry.
- O lote fica vinculado às entradas originais e a revisão protege contra resposta antiga.
- O snapshot recuperado não chama novamente modelo, ferramentas ou handoff.
- A persistência da saída e a chave de entrega são transacionais; envio confirmado
  devolve o mesmo ID. Dois watchdogs não conseguem assumir a mesma reserva.
- Falha após confirmação da Meta é tratada como incerta mesmo se falhar a gravação
  do ACK: o transporte não cai para um segundo envio de texto após áudio.
- Áudio resumido sozinho não conclui uma resposta que também exige texto completo.
- Aviso de protocolo já entregue é vinculado mediante prova na mesma conversa e
  referência no snapshot; o watchdog não cria outro aviso.
- Mídia sem texto permanece no caminho determinístico atual: redelivery da entrada
  rastreada não repete o retorno. Saída comprovada conclui a entrada; abandono sem
  prova vira failed, sem reiniciar esse fluxo. Entradas com humano já responsável
  terminam handoff, usando a atribuição existente.

completed no WhatsApp significa que a API Meta aceitou e devolveu ID, com saída
persistida; **não significa confirmação de entrega/leitura no aparelho**. No console,
significa saída persistida no canal de teste; não houve WhatsApp real. failed com
DELIVERY_OUTCOME_UNKNOWN significa resultado de entrega incerto, e não prova de que
o paciente não recebeu. handoff requer responsável humano/fila humana já existente;
o watchdog não inventa atribuição na homologação.

Não se promete exactly-once absoluto de APIs externas sem suporte a idempotência.
O broker mantém seu cache atual em memória. A proteção entre workers é conservadora:
se o efeito de uma execução anterior não pode ser determinado, não há replay da
inferência. Uma repetição de entrega em áudio pode refazer síntese/upload, mas não
repete o raciocínio nem autoriza duplicação da mensagem confirmada.

### 11–12. Testes e resultados

PostgreSQL 18.3 local, banco descartável nina_watchdog_test, conexões concorrentes.
A suíte instala as migrations reais de batching, locks, revisões e traces sobre
um esquema mínimo das dependências, depois aplica a migration nova. Não usa o
Supabase remoto, registros de pacientes, credenciais reais de IA ou a API Meta.

| Ensaio | Resultado observado |
| --- | --- |
| 10 conversas simultâneas | 10 entradas, 10 completed, 0 pendências, 0 saídas duplicadas |
| 10 mensagens da mesma conversa | 10 entradas completed, 1 lote, 1 saída, ordem preservada |
| Worker morto após adquirir lock | Novo token; token antigo rejeitado; conclusão recuperada |
| Job de recuperação completo | Claim SQL, roteamento ao processador canônico simulado, conclusão e liberação do lock; 1 lote completed |
| Dois watchdogs simultâneos | Exatamente 1 claim do lote |
| Lease vencido e heartbeat recente | Reserva preservada |
| Três tentativas abandonadas | failed, sem nova tentativa infinita |
| Modelo salvo e rejeição temporária do envio | 1 chamada ao gerador, 2 tentativas de transporte, 1 entrega; finalização executada 1 vez |
| ACK não salvo após efeito externo | failed explícito; nenhum fallback que duplique a mensagem |
| Timeout do modelo | Abort real no adapter; gateway faz 3 tentativas controladas no ensaio de timeout |
| Erro permanente de modelo | 1 tentativa |
| Cliente tenta forjar completed | Banco recusa a alteração |
| Aviso já enviado e mídia sem lote | Estado depende do comprovante; nenhuma saída extra para o aviso |
| Áudio resumido sem texto completo | Banco recusa completed |
| Nenhuma mensagem da carga localizada | Erro crítico e teste reprovado |
| Conciliação de todas as entradas da suíte SQL | 43 recebidas = 37 completed + 5 failed provocadas + 1 handoff; 0 pendências |

Também foram executadas regressões do webhook, console, agrupamento persistente,
revisões, perda de reserva em finalização/TTS/upload, Tool Broker e executor de carga.
Resultado consolidado: **132 testes aprovados**, sendo 29 testes do watchdog e
103 de regressão. As falhas provocadas são resultados esperados das simulações,
não falhas dos testes. Asserções de SQL não medem qualidade clínica das respostas.

O comando de reprodução, com um PostgreSQL local dedicado já criado, é:

~~~powershell
$env:NINA_WATCHDOG_TEST_DATABASE_URL='postgres://postgres@127.0.0.1:55439/nina_watchdog_test'
bun test src/lib/nina/__tests__/watchdog-postgres.test.ts src/lib/nina/__tests__/watchdog.test.ts
~~~

A suíte recusa host remoto e qualquer nome de banco diferente de nina_watchdog_test.
**Ela recria o schema public desse banco dedicado.** Não usar esse nome para dados úteis.
Sem a variável, os testes SQL são explicitamente ignorados, não considerados aprovados.

O painel de carga concilia IDs físicos com estados duráveis, mostra entradas não
localizadas e separa terminal conhecido de sucesso funcional. Após finalização/prazo,
qualquer mensagem sem terminal é erro crítico. Falhas terminais também reprovam o
resultado funcional. Exibe fila, processing, retry, stale, recuperação, prevenção de
duplicação, média, p95 e p99; dados insuficientes aparecem sem duração inventada.
As sete métricas solicitadas estão no retorno do detalhe da carga.

Eventos estruturados correlacionam entrada, conversa, lote, processing_id, token e
tentativa. Os eventos do modelo e das ferramentas acrescentam apenas nome, status e
categoria, sem argumentos clínicos. Falhas aparecem com status error, não como etapa
bem-sucedida. O snapshot de resposta é dado protegido necessário à retomada, separado
dos eventos técnicos.

### 13. Limitações e impedimentos de publicação

- O build local foi tentado e interrompido pelo plugin @lovable.dev/mcp-js na
  validação de routesDir: diferença entre barras Windows e caminho normalizado.
  Isso ocorre antes da compilação da aplicação. Não há build aprovado para publicar.
- Typecheck continua com dois erros em arquivos não alterados: atendimento.functions.ts
  (3018) e atendimento/distribuicao.server.ts (28), sobre number | null.
- O lint global reprova a dívida existente de formatação/regras no repositório.
  O recorte dos arquivos novos/principais do watchdog tem zero erros; existem avisos
  de tipagem ampla. Os arquivos legados foram comparados ao HEAD para evitar novos
  erros de lint nas linhas desta alteração.
- Não foram executados scheduler remoto, preview visual, modelo real, WhatsApp real,
  nem carga real no deploy. O schema mínimo local não substitui aplicar a migration
  em uma cópia completa do banco com todos os triggers e RLS.
- Job indisponível, banco indisponível ou retenção externa que apague evidências
  impedem garantia de recuperação no prazo. Monitorar a execução do próprio job.
- Callbacks de ferramentas já em voo podem terminar após o prazo; o fencing impede
  novos efeitos, e a recuperação não repete inferência incerta. APIs que suportarem
  idempotência nativa devem continuar usando-a.
- Homologação reiniciada, resposta obsoleta ou Nina desativada durante o turno podem
  terminar failed/handoff; recuperação não ressuscita conversa encerrada.
- Alterações auxiliares após envio (encerramento automático e relógio de espera)
  continuam sob os serviços existentes. O recovery de ACK comprova a mensagem;
  não promete repetir todas as ações auxiliares interrompidas pelo encerramento do worker.
- O campo de status de transporte já existente continua sujeito aos recibos da Meta.
  Este watchdog acompanha conclusão do processamento e aceite do envio, não a saúde
  posterior da entrega no telefone.

### 14. Ativação, rollback e aumento de carga

Primeiro resolver os impedimentos de build/typecheck e revisar lint no ambiente
oficial. Aplicar a migration em cópia completa de homologação; verificar schema
cache do PostgREST, RLS, imports server-side e suporte a AsyncLocalStorage/AbortController.
Validar que o runtime suporta o prazo do worker e requisições pg_net longas. O job
não pode ser encerrado pelo provedor antes das etapas de checkpoint sem que isso
apareça nos resultados.

Com o código publicado em homologação e a migration validada, um operador autorizado
configura a URL real do endpoint pela RPC nina_watchdog_configurar_job(url, true).
Verificar pg_cron/pg_net e uma execução autenticada antes de admitir mensagens.
Depois habilitar somente homologacao_ativa; producao_ativa permanece false. Não
exibir, copiar para frontend ou escrever o token em logs.

Repetir os nove cenários no Test Runner real, incluindo encerramento/reabertura,
avisos de protocolo, áudio, handoff e interrupção do processo. Exigir conciliação por
ID, nenhum pending após o prazo e nenhuma duplicação real de saída. Aumentar a carga
em degraus, comparando p95/p99, fila, falhas, 429, custo e tempo do job. Uma carga que
terminou todos os estados, mas com failed, continua reprovada funcionalmente.

Rollback operacional preserva evidências:

1. Desativar homologacao_ativa e producao_ativa para impedir novas admissões.
2. Manter o código e o job novos drenando os lotes já rastreados até estado terminal.
3. Conferir zero pendências/entregas em andamento e ausência de reservas ativas.
4. Desagendar pela RPC nina_watchdog_configurar_job(url, false).
5. Só então voltar o código ao commit anterior. As colunas e tabelas aditivas podem
   permanecer para auditoria; lotes novos legados terão watchdog_state nulo.

Não remover tabelas/colunas nem apagar snapshots como rollback imediato. Para uma
reversão física posterior do banco, restaurar as definições anteriores das RPCs após
exportar as evidências e revisar dependências. Não executar versões antigas em lotes
rastreados ainda ativos: não conhecem os checkpoints de envio.

A propriedade validada localmente é: entradas admitidas chegam a estado terminal
conhecido e recovery não duplica os efeitos de entrega nos cenários testados. A
ativação para atendentes reais depende das validações remotas acima.

Os resultados estruturados e o hash da migration estão em [nina-watchdog-validacao.json](nina-watchdog-validacao.json). O banco descartável foi removido após a coleta e o servidor PostgreSQL local foi desligado.
