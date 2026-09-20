# Mensagens da Nina sem emojis

Regra de atendimento solicitada pelo usuário em 19/09/2026: emojis são proibidos em qualquer mensagem da Nina.

A função `removerEmojisNina` remove pictogramas, bandeiras, modificadores de pele e componentes de sequências compostas. Teclas numéricas em formato de emoji passam a ser dígitos comuns. Acentos, preços, datas, horários, asteriscos do WhatsApp e separação dos blocos são preservados.

A regra é aplicada depois dos templates e da despedida, antes de calcular o hash final. O texto original continua disponível para diagnóstico; registros históricos não são reescritos. Uma resposta composta somente por emojis é descartada, sem enviar bolha vazia.

Os transportes do WhatsApp e da homologação também limpam respostas recuperadas de checkpoints anteriores ou retornadas após falha na finalização. As mensagens de encaminhamento são limpas antes da validação e da reserva de envio. O painel interno usa a mesma função. O transporte genérico do WhatsApp permanece intacto, preservando as mensagens de pacientes e atendentes humanos.

Os padrões de confirmação, mídia, encaminhamento e despedida foram revisados para usar pontuação em lugar dos emojis. Templates publicados antigos e variáveis interpoladas também passam pela limpeza. Mensagens de áudio da Nina deixam de acrescentar o emoji de microfone ao corpo da mensagem; a identificação de mídia continua no campo de tipo.

## Publicação e validação

- Em 19/09/2026 às 23:48:35 (São Paulo), publicada e verificada a regra LING-03 na versão 40 de `whatsapp` e na versão 3 de `painel_interno`, na configuração global. A homologação usa o prompt de WhatsApp. As versões anteriores foram arquivadas, com conteúdo preservado, sem modificar rascunhos.
- Publicação administrativa pelo SQL editor do Lovable, com comentário identificando o pedido do usuário e vínculo à versão anterior. Autoria de aplicação não foi atribuída a outra conta. A transação conferiu os IDs das versões anteriores sob bloqueio antes de publicar, prevenindo sobreposição com publicações concorrentes.
- 102 testes em sete arquivos passaram, incluindo 17 casos da nova regra, finalização, templates, catálogo, modalidades, composição do prompt e regressão da homologação. Testes locais não enviam mensagens reais nem executam agendamentos. Sem credenciais de serviço locais, os testes de finalização exercitam os padrões de contingência; os templates publicados antigos são cobertos no módulo puro.
- Verificação de tipos aprovada. ESLint sem erros de código com a regra de formatação desativada; os arquivos existentes possuem divergências de Prettier anteriores a esta mudança, que não foram reformatados em massa.

As instruções publicadas já orientam o modelo. A limpeza determinística no servidor depende da publicação do aplicativo; não foi executada publicação geral do Lovable nesta tarefa. A autorização para publicar o conjunto de alterações pendentes dos colaboradores permanece separada.
