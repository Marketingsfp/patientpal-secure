# Envio paralelo nos testes de carga

Data: 19/09/2026.

Este documento registra o executor v4, mantido para cargas antigas. Novas cargas
usam a [execução independente do navegador](carga-servidor.md), versão v5.

## Comportamento

O executor anterior (`carga-v3-item`) processava uma mensagem por requisição e
mantinha uma reserva global durante toda a resposta. A configuração de conversas
simultâneas distribuía os pacientes, mas o envio efetivo era sequencial.

Novos testes usam `carga-v4-paralela`. O navegador abre até dez requisições
independentes, respeitando o limite revisado pelo operador. Cada requisição chama
o processador normal da homologação para apenas uma mensagem. Nenhuma requisição
acumula vários pipelines do modelo em `Promise.all`.

Os textos da Luna e a preparação dos dez leads terminam antes de liberar os envios.
As primeiras requisições são iniciadas juntas. Cada trabalhador continua assim que
o seu item termina, sem aguardar o lead mais lento. Dentro de cada conversa, uma
mensagem pendente impede as posteriores desse mesmo paciente.

Os modos são:

- **Simultâneo** (padrão): sem intervalo artificial entre leads. O limite de
  conversas controla quantos podem avançar ao mesmo tempo. Campos de intervalo e
  mensagens por minuto ficam desabilitados porque não se aplicam a esse modo.
- **Com intervalo**: aplica globalmente o maior valor entre o intervalo informado
  e `60.000 / mensagensPorMinuto`, inclusive quando duas abas disputam o envio.
  Respostas de leads distintos podem permanecer em andamento ao mesmo tempo.

Sol não altera o modo escolhido pelo operador. A quantidade de mensagens, o prazo
e o orçamento continuam sendo verificados antes de uma nova geração. Chamadas já
iniciadas podem terminar depois de parar ou atingir o orçamento; o consumo dessas
chamadas precisa ser considerado ao escolher os limites.

## Persistência e retomada

As reservas por lead ficam em `nina_teste_carga.config._cargaParalela`. O CAS
existente por `updated_at`, clínica, status e cancelamento impede duas reservas
simultâneas do mesmo lead. Cada alteração relê os resultados e recompõe os totais;
respostas concorrentes não sobrescrevem os contadores umas das outras.

Heartbeat a cada 20 segundos, lease de 120 segundos e quarentena adicional de
300 segundos conservam a proteção de chamadas incertas. Retomar consulta a entrada
física e a saída antes de gerar. Amostras mantêm identidade estável e gravação
idempotente. Parar bloqueia novos disparos; requisições em voo conservam sua reserva
até terminar. Sessão alterada encerra o teste. Falhas repetidas do executor são
limitadas a três por item.

O executor antigo é mantido para testes já criados. Não há migration, nova tabela,
mudança de RLS, alteração de históricos de atendimento ou mudança no WhatsApp real.

Com a página fechada, o job existente continua elegível para os testes novos e
retoma um item por chamada, revalidando o vínculo do criador. Isso é recuperação em
ritmo reduzido, não sustenta o ritmo simultâneo da tela aberta. A interface informa
essa diferença. Reabrir a tela não dispara mensagens sem clicar em Retomar.

## Medições

A leitura completa do relatório foi retirada do caminho entre envios. A tela
atualiza os indicadores separadamente, sem sobrepor atualizações periódicas lentas.

O painel apresenta limite, requisições em voo, pico de requisições, pico de
processamento medido, janela real entre as primeiras entradas de cada lead,
fila média, processamento médio e tempos por chamada ao modelo e por ferramenta.
As durações de modelo/ferramentas são calculadas dos pares de eventos do mesmo
lote, tentativa e ferramenta; incluem o intervalo observado entre os registros.
Eventos incompletos não são convertidos em zero e são sinalizados. As leituras de
eventos são paginadas para evitar truncamento pelo limite padrão do PostgREST.

## Validação

Testes automatizados isolados verificam início concorrente com 2, 5 e 10 leads,
continuidade sem barreira, preservação da ordem por paciente, duas abas,
cancelamento, isolamento por clínica, sessão alterada, limite de duração,
falha de gravação e conciliação sem reenviar mensagens. Também verificam o modo
cadenciado, o disparador do navegador e os cálculos de tempo.

As regressões incluem planejamento Sol, redação Luna, preparação, recuperação do
executor anterior e montagem/interações React. Não foram feitas chamadas pagas ao
modelo nem enviados WhatsApps reais para validar esta mudança.

Resultado local: 121 testes aprovados na suíte de carga, além dos casos internos
dos processos isolados de handlers e React. Typecheck e ESLint sem erros.
A compilação Vite local esbarra no erro preexistente do plugin `@lovable.dev/mcp-js`
ao comparar caminhos Windows de `src/routes`. A prévia do Lovable também estava
marcada como desatualizada, com build malsucedido, antes deste envio.

Simultaneidade no controlador não prova capacidade nem isolamento de memória do
runtime publicado. Após publicar, medir com 2, depois 5 e 10 leads: janela das
primeiras entradas, sobreposição dos processamentos, latência, falhas e consumo de
memória. Os modelos e as ferramentas continuam tendo seu próprio tempo de resposta.
