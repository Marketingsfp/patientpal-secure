# Fila individual e continuidade após a primeira resposta

Regra reforçada em 17/09/2026:

- Ficar Online mantém as conversas já reservadas em **Não atribuídas**.
- A primeira resposta humana enviada com sucesso coloca aquela conversa em **Ativas**.
- O cartão sai de Não atribuídas, mas o chat permanece aberto com o mesmo paciente. O filtro não muda automaticamente e outra conversa não é selecionada.
- As mensagens, o próximo rascunho e o cache do chat continuam disponíveis durante a reconciliação da lista.

## Implementação

O banco já implementa essa regra na migration canônica `20260917144041_b618961f-ac79-4d95-977a-1eac1d3541fa.sql`. A promoção depende de resposta humana `sent`, `delivered` ou `read`; entrar em Online, mensagem da Nina, recebida ou com falha não inicia a conversa. Nenhuma migration ou regra de distribuição foi alterada nesta entrega.

Antes, a Inbox removia a seleção quando o cartão desaparecia do filtro. Agora, no filtro individual, ela consulta o registro atual pelo endpoint autenticado `obterConversa` antes de fechar um chat ausente da lista. Mantém somente a conversa da mesma clínica, mesma atendente e mesmo id, sob atendimento humano, com fila pendente encerrada e status ativo. Transferências, encerramentos, perda de acesso e troca de contexto continuam invalidando a seleção.

O evento de conversa atualiza o cabeçalho mesmo após remover o cartão. A confirmação da primeira resposta também solicita a reconciliação da lista para cobrir atraso do Realtime. Respostas atrasadas da consulta são descartadas quando seleção, filtro ou contexto mudam.

## Verificação

- Testes de continuidade, filtros, cache, atualização em tempo real e pós-envio.
- PostgreSQL local isolado: permanecer na fila após Online/Offline, promoção apenas por resposta humana bem-sucedida, limites, concorrência, permissões e isolamento entre clínicas.
- Chrome com dados fictícios e função de recarga extraída do componente real: Online conserva duas pendências; responder uma deixa uma pendência, uma ativa e o mesmo chat aberto; outra reconciliação preserva o próximo texto digitado.

O cenário de navegador usa transporte simulado. Não foram enviadas mensagens reais nem alteradas conversas de produção.
