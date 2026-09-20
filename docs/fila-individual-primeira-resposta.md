# Fila individual e continuidade após a primeira resposta

Regra reforçada em 17/09/2026:

- Ficar Online mantém as conversas já reservadas em **Não atribuídas**.
- A primeira resposta humana enviada com sucesso coloca aquela conversa em **Ativas**.
- O cartão sai de Não atribuídas, mas o chat permanece aberto com o mesmo paciente. O filtro não muda automaticamente e outra conversa não é selecionada.
- As mensagens, o próximo rascunho e o cache do chat continuam disponíveis durante a reconciliação da lista.

## Implementação

O banco já implementa essa regra na migration canônica `20260917144041_b618961f-ac79-4d95-977a-1eac1d3541fa.sql`. A promoção depende de resposta humana `sent`, `delivered` ou `read`; entrar em Online, mensagem da Nina, recebida ou com falha não inicia a conversa. Nenhuma migration ou regra de distribuição foi alterada nesta entrega.

Antes, a Inbox removia a seleção quando o cartão desaparecia do filtro. Agora a seleção é independente da lista: trocar entre Ativas, Não atribuídas e Fechadas, responder, encerrar ou reabrir não limpa o chat, mensagens, rascunho ou posição de leitura. A supervisão também pode mudar filtros sem trocar o chat aberto. A conversa só muda por nova seleção; uma perda comprovada de permissão ou mudança de contexto continua protegendo o acesso aos dados.

A conferência autenticada usa a mesma autorização canônica do backend, sem exigir um status específico, a presença do card na lista ou atendimento humano. Falhas de rede/servidor preservam o conteúdo já autorizado; apenas conversa inexistente ou negativa explícita de acesso invalidam a seleção. O carregamento dos dados de contato também distingue falha de consulta de inexistência, evitando limpar o chat em uma indisponibilidade transitória.

O evento de conversa atualiza o cabeçalho mesmo após remover o cartão. A confirmação da primeira resposta também solicita a reconciliação da lista para cobrir atraso do Realtime. Respostas atrasadas da consulta são descartadas quando seleção, filtro ou contexto mudam.

## Verificação

- Testes de continuidade, filtros, cache, atualização em tempo real e pós-envio.
- PostgreSQL local isolado: permanecer na fila após Online/Offline, promoção apenas por resposta humana bem-sucedida, limites, concorrência, permissões e isolamento entre clínicas.
- Chrome com dados fictícios e função de recarga extraída do componente real: Online conserva duas pendências; responder uma deixa uma pendência, uma ativa e o mesmo chat aberto; outra reconciliação preserva o próximo texto digitado.

O cenário de navegador usa transporte simulado. Não foram enviadas mensagens reais nem alteradas conversas de produção.

### Troca entre as três abas — 20/09/2026

A proteção antes limitada à primeira resposta na fila foi estendida às três abas. Os cards continuam respeitando o filtro escolhido, mesmo quando o chat selecionado pertence a outra aba. A atualização em tempo real também confere transferências quando o card do chat aberto não está na lista atual.

71 testes passaram nos quatro arquivos de continuidade, cache, filtros das atendentes e ordenação estável. Cobrem as seis trocas entre abas com conversas ativas, pendentes e fechadas, lista vazia, confirmação de acesso, vínculos históricos e transferência. Essa ampliação foi validada localmente; a publicação e a conferência no aplicativo publicado continuam pendentes.

Reforço posterior da mesma data: a seleção deixou de depender de estados especiais. Regressões adicionais cobrem falha de rede na troca de Não atribuídas para Ativas, supervisão, estado pendente com dono `NONE`, encerramento/reabertura e negativa explícita de acesso. No conjunto com o painel de contato, 107 testes passaram em oito arquivos; a verificação de tipos passou. A ativação ainda depende da publicação do aplicativo.

A função real `carregarConvs`, extraída do componente para uma execução local com transporte simulado, também foi conferida: trocas entre as três abas, falha de rede e clique em outra conversa durante uma revalidação não limparam chat ou cache nem restauraram a seleção anterior.
