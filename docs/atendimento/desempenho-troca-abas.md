# Troca entre Ativas, Pendentes e Fechadas

Relato: aproximadamente quatro segundos para os cards aparecerem ao trocar de aba, mesmo com poucas conversas. A investigação usa a main `d8b339139`; não é uma medição de produção nem se refere à abertura do histórico.

## Esperas identificadas e alteração

- A consulta da lista aguardava as não lidas antes de buscar o selo Novo; dentro do selo, aguardava as leituras antes dos eventos. Agora as quatro consultas independentes começam juntas, depois da autorização e da seleção das conversas. Paginação, filtros de clínica/responsável e tratamento de falhas permanecem.
- No navegador, uma conversa selecionada fora da nova lista podia exigir outra chamada autenticada. A lista só era publicada depois dessa conferência. Agora os cards autorizados são publicados primeiro. A conferência do chat continua, sem bloquear a lista nem enfraquecer seu controle de acesso.
- Pendentes já recebia a espera oficial na resposta, mas os cards dependiam de outro mapa carregado separadamente. Agora a própria resposta alimenta esse mapa; uma consulta auxiliar anterior é invalidada para não apagar o resultado recém-carregado.
- A lista vazia durante uma busca indica carregamento, em vez de afirmar que não há conversas.

Não introduz cache de permissões ou de listas entre usuários, não altera atribuição, fila, limites, ordenação, encerramento, mensagem ou dados históricos. Não há migration. Falha ao consultar não lidas/selo continua sendo erro, não zero fictício.

## Validação

Testes de filtros, movimentação, merge e selo Novo; testes de concorrência com banco controlado; execução do callback real de `carregarConvs` com respostas atrasadas, verificando publicação antes do chat e descarte de resposta de outra aba. TypeScript, ESLint dos módulos alterados e build cliente/servidor.

O teste de concorrência comprova quatro leituras em voo antes de qualquer resposta. Não mede rede nem Supabase real. Os tempos `nao_lidas` e `aberturas` no log existente `listarConversas lenta` agora são durações sobrepostas e não devem ser somados; `metadados_paralelos` mede a etapa conjunta.

## Conferência após publicação

Confirmar a revisão publicada e medir, com o mesmo usuário e conexão, Ativas → Pendentes → Fechadas → Ativas. Repetir com chat aberto e sem seleção, com listas vazias e preenchidas, e com trocas rápidas enquanto a rede está lenta. Verificar que não há cards de outra aba/atendente, que o selo e as não lidas permanecem corretos e que o chat não troca sozinho.

Separar o primeiro acesso das trocas seguintes e medir clique → cards visíveis. Comparar mediana e pior tempo das mesmas condições antes/depois. Não há promessa de um tempo absoluto: autenticação, consulta da lista, banco, rede e inicialização do servidor continuam no caminho.
