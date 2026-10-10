# Simulação do atendimento OS ZAP

## Diagnóstico

O controle “Mostrar conversas de teste” apenas altera uma preferência de visualização.
Ele não gera mensagens. A geração existente (“Dia real”, na homologação) é outra
operação: executa cenários da Nina e pode criar agendamentos identificados como teste.
Não é adequada para uma demonstração da fila sem registros operacionais.

A exibição estava limitada a administrador tanto no navegador como no servidor.
Além disso, o encaminhamento da homologação preserva as conversas de teste sem
atendente real; a distribuição as exclui. Telefonia vê suas próprias atribuições,
portanto liberar somente o controle não faria esses cards chegarem à fila pessoal.

## Comportamento implementado

- “Iniciar simulação” aparece na Inbox para vínculos ativos de Administrador,
  Supervisor e Telefonia, com a publicação do recurso habilitada.
- A simulação substitui temporariamente a Inbox operacional. O componente
  operacional é desmontado; não injeta registros fictícios na fila do banco.
- Reutiliza `InboxConversationCard`, `FiltrosAtendente`, `useHoverTolerante`, o seletor de presença,
  a indicação de espera e a ordenação por entrada da Inbox.
- Gera de 6 a 24 cards, em intervalos configuráveis de 1, 3 ou 5 segundos.
  Cada card tem um nome fictício distinto, sem reutilizar nomes com números.
  Cada contato envia uma mensagem inicial e uma segunda mensagem programada.
- Abrir tira o selo Novo e as não lidas. Responder tira de Pendentes; nova
  mensagem do paciente volta a Pendentes. Resolver coloca em Fechadas.
- O status é fictício: fora de Online não recebe novas atribuições; as mensagens
  das conversas já atribuídas continuam. Offline bloqueia resposta e resolução.
- A simulação não muda a disponibilidade real. Quem estiver Online recebe a
  orientação de escolher Em pausa no atendimento antes de treinar durante o expediente.
- É possível pausar a execução, fixar/desafixar a lista, reiniciar e encerrar.
- Encerrar remove imediatamente todos os cards, mensagens e rascunhos fictícios
  e cancela as próximas chegadas. Iniciar novamente começa uma sequência nova,
  sem recuperar mensagens da simulação anterior. Pausar chegadas mantém os cards.
- Nomes e telefones são fictícios. Respostas ficam na memória do navegador:
  não há IA, WhatsApp, criação de pacientes, agenda, financeiro, protocolo ou auditoria
  operacional. Encerrar, sair da página ou recarregar descarta a simulação.
- Não simula transferência entre atendentes nem comunicação entre computadores.

O controle antigo continua significando exibir testes existentes, respeitando o
escopo original de cada pessoa. Não concede gestão à Telefonia. Listas e eventos
descartam testes ao desligar; a chave da consulta muda para rejeitar respostas
atrasadas iniciadas em outro modo. As barreiras de envio real e distribuição de
conversas da homologação continuam ativas.

## Prévia e publicação

Prévia local: `/dev/simulacao-atendimento`, indisponível em produção.
Prévia aprovada pelo usuário em 10/10/2026. A versão final habilita o recurso
globalmente para os três perfis. A chave `VITE_OSZAP_TREINAMENTO=false` oculta o
novo botão e mantém a exibição legada somente para administrador; ausência da
chave ou valor `true` habilita o recurso. Não há migração de banco.

Publicar aplicativo e servidor com a mesma configuração e conferir a Inbox com
sessões dos três perfis. Desativar a chave e republicar é o rollback; não há
registros fictícios para apagar. Aprovação visual não significa implantação.

## Validação local

Testes de regras cobrem a chegada gradual, ordenação, mensagens, leitura, Novo,
Pendentes, respostas, resolução, status, pausa, reinício, limite de cards,
perfis ativos, falha fechada de autorização e isolamento das conversas.
A conferência Playwright usa a prévia local, bloqueando acesso externo e
monitorando consultas/gravações durante toda a simulação.

Resultado em 10/10/2026: 104 testes passaram; checagem completa de tipos e
checagem final dos componentes passaram; lint sem erros (avisos existentes);
build completo aprovado. Playwright passou em desktop e celular, incluindo
sidebar desafixada, sem erros de JavaScript ou consultas/gravações da simulação.

Conferência antes do envio ao Git: 307 testes das alterações passaram em conjunto;
lint dos arquivos alterados sem erros. Playwright confirmou zero cards e mensagens
após encerrar, inclusive aguardando novas chegadas, e uma sequência limpa ao iniciar
novamente. A tipagem completa passou numa cópia do conteúdo preparado para o commit,
preservando fora dele as alterações locais em andamento no Dashboard OS ZAP.

A prévia isolada não comprova a matriz/RLS com sessões reais em produção.
Os cenários são mensagens programadas; não representam uma conversa com IA.
