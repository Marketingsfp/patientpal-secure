# Falha de preparação da Nina no worker

A saudação recebida depois de reabrir uma conversa podia falhar antes de chamar o modelo. O cadastro mínimo reutilizava `pacienteSchema`, que importava a normalização de texto de um módulo com DOMPurify. A compilação do worker selecionava a exportação de navegador de `isomorphic-dompurify`, que executava `sanitize.bind` sem DOM disponível. A conversa reabria corretamente, mas seu lote terminava `failed / RESPONSE_NOT_CONFIRMED`, ainda sob responsabilidade da IA.

## Correção

- `seguranca/texto.ts` concentra as mesmas funções de texto puro e limites, sem dependência de DOM. O schema compartilhado do paciente importa esse módulo. `seguranca/sanitizar.ts` preserva a sanitização de HTML e reexporta as funções anteriores para compatibilidade.
- O watchdog registra `preparing` enquanto prepara contexto e instruções. Modelo, broker e executor direto de ferramentas avançam para `generating` **antes** de qualquer execução. Isso também cobre o gate de cadastro.
- Uma falha transitória capturada durante a preparação, sem snapshot nem entrega, agenda retomada pelas RPCs existentes, respeitando o máximo configurado (padrão: três tentativas). Erro de código, limite esgotado ou falha depois de iniciar efeitos não repete a geração: usa o encaminhamento humano canônico.
- O encaminhamento real avisa pelo fluxo existente e distribui para atendente disponível; sem pessoa disponível, mantém na fila humana. Homologação usa o mesmo desfecho sem atribuir a uma pessoa real.
- Reserva perdida, conversa encerrada, nova sessão ou revisão posterior não autorizam esse encaminhamento. O UPDATE verifica dono, estado, última mensagem e sessão; uma simples leitura da Inbox não invalida a transferência.
- A causa original fica no evento `PROCESSING_ERROR` e no desfecho. O aviso confirmado e seu identificador ficam em `PROCESSING_ERROR_HANDOFF`. Falha no encaminhamento é registrada explicitamente, sem afirmar que houve transferência.
- O console deixa de substituir erro rastreado por um texto de contingência que divergia do WhatsApp. A recuperação aplica o mesmo finalizador em ambos os transportes.

## Validação

- Teste `cadastro-worker.test.ts`: compila cadastro e etapas com condições de Workers e executa em Miniflare, sem DOM. Verifica os dados obrigatórios, normalização, data inválida e saudação. Confirma ausência de DOMPurify/jsdom nesse grafo.
- `watchdog-falha.test.ts` e fixture isolada: reabertura real da rotina, erro de importação, handoff real/simulado, ausência de atendente, retry transitório seguido de sucesso, limite de tentativas, ferramenta direta, aviso único e corridas com encerramento, reset, nova mensagem e leitura da Inbox.
- Regressões de webhook, agrupamento, reserva, sessão, cadastro e protocolo.
- `scripts/test-nina-watchdog-preparacao.mjs <caminho-do-pglite>`: aplica as migrations existentes em PostgreSQL temporário em memória; verifica duas retomadas, máximo de três tentativas, terminal humano e bloqueio de replay de geração incerta.
- Checagem de tipos e compilação completa. Importação dos módulos efetivamente compilados de cadastro, etapas, ferramentas, watchdog e WhatsApp sem erro.

No Windows, o build local necessita contornar a comparação de separadores de caminho do plugin `@lovable.dev/mcp-js`. Na validação foi normalizado apenas `parent/child` em `assertContains` da cópia instalada e o arquivo foi restaurado ao fim. Isso não modifica a configuração, o pacote versionado nem o código publicado da aplicação.

## Limites e publicação

Não requer migration nova nem alteração de prompt. A correção vale para todas as clínicas; o tratamento do watchdog usa sua ativação existente. Entregas incertas e perda de reserva continuam sem reenvio automático. Mortes abruptas do processo seguem as proteções de recuperação SQL já existentes. Lotes históricos não são reabertos automaticamente. Não foram usados pacientes reais, chamadas ao modelo ou envios à Meta nos testes.

A validação local não equivale a publicação. Após publicar, conferir a assinatura do runtime e realizar um novo turno em homologação antes de testar pelo WhatsApp real.
