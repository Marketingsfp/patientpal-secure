# Ligação da Nina com a voz GPT-Live 1 — plano para aprovação

Área sensível: conversa com paciente (simulada), ferramentas da Nina e gasto de IA. Nada é publicado.

## Por que não cabe só em 2 arquivos
O formato que já está no código (pedido único que devolve o SDP; o navegador recebe a chamada de ferramenta e a devolve pelo canal de dados; o modelo de apoio e as ferramentas vão dentro da sessão) não é aceito pela voz da Lovable:
- a sessão precisa de uma **conexão contínua pelo servidor durante a ligação toda** (o servidor manda um "estou vivo" a cada segundo; se fechar depois do SDP, a ligação cai);
- só é aceita a delegação do tipo "cliente": o modelo de apoio, as instruções de apoio e as ferramentas **rodam no nosso servidor** e não vão dentro da sessão;
- o navegador **não pode** mandar comandos pelo canal de dados (`response.item.create`, `response.create`, `session.close` são recusados). Resultados de ferramenta voltam pela conexão do servidor, como `session.commentary.append`.

## O que muda (arquivos)
1. `src/lib/nina/ligacao/sessao-live.server.ts` — vira o "intermediário" da ligação: abre a conexão com a voz usando a LOVABLE_API_KEY (só no servidor), manda `session.start` com a voz em `audio.output.voice`, as instruções de voz e `delegation: { type: "client" }`; repassa os eventos para a tela; quando a voz pede ajuda (`session.delegation.created`), chama o modelo de apoio com as `instrucoesApoio` e as ferramentas de `contrato-ligacao.server.ts`, executa as ferramentas com o `executarFerramentaLigacao` que já existe e devolve a resposta à voz. Sem gravar áudio e sem registrar falas nem instruções em log.
2. Nova rota de servidor `/api/nina-ligacao` (conexão contínua navegador ↔ servidor), com a **mesma checagem** de hoje antes de abrir a sessão: login, vínculo com a clínica, permissão `nina-ligacao` de escrita e flag `nina_ligacao_demo`.
3. `src/server.ts` — 3 linhas para encaminhar `/api/nina-ligacao` à rota acima (o resto fica igual).
4. `vite.config.ts` — acrescentar o adaptador que faz a mesma rota funcionar na pré-visualização.
5. `src/lib/nina/ligacao/conexao-live.ts` — passa a usar a conexão contínua: gera a oferta, recebe a resposta, manda o "estou vivo" a cada segundo, `Desligar` pede o encerramento ao servidor. Canal de dados `oai-events` só para receber eventos.
6. `src/lib/nina/ligacao/eventos-ligacao.ts` — acrescentar a leitura dos eventos de "consultando" (para os Bastidores mostrarem "Consultou o catálogo publicado"); a leitura das transcrições continua igual.
7. `src/components/nina/LigacaoNina.tsx` — ajuste mínimo: deixa de executar ferramentas no navegador (o servidor faz) e passa a mostrar os Bastidores a partir dos eventos do servidor. Visual, botões, textos e voz escolhida não mudam.
8. Pacotes: `ai` e `@ai-sdk/openai` (e `ws` só para desenvolvimento).

## Modelos
- Voz: `openai/gpt-live-1`.
- Apoio: `openai/gpt-6-astra` (o `openai/gpt-5.6-terra` escrito hoje não é o modelo indicado para isso). **Se preferirem outro, digam qual.**

## Não muda
Instruções, regras, ferramentas e o que cada uma faz (`contrato-ligacao.server.ts`, `ferramentas-ligacao.server.ts`), permissões, menu, flag, banco (nenhuma tabela ou migration).

## Validação
- Testes dos formatos de evento (transcrição, pedido de ajuda, encerramento).
- Ligação real na pré-visualização com a flag ligada numa clínica: Ligar → pede microfone → a Nina se apresenta → perguntar por um exame → Bastidores mostram a consulta ao catálogo → Desligar encerra. Precisa de alguém logado com acesso para o teste falado; o áudio eu não consigo ouvir daqui, só confirmar os eventos.

## Riscos
- Cada ligação gasta créditos de IA (voz + modelo de apoio).
- Se a conta da Lovable não tiver a voz liberada, a ligação não abre — aviso com a mensagem certa, sem tentar outro modelo.
