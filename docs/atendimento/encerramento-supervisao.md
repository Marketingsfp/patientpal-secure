# Encerramento pelo responsável ou pela supervisão — OS ZAP

Pedido de JEAN em 03/10/2026: administradores e supervisão também podem encerrar conversas; a autoria deve identificar quem realizou a ação.

Antes, o botão só ficava disponível para a atendente responsável e o servidor rejeitava o encerramento por outra pessoa. Agora, interface e servidor usam `podeEncerrarConversa`: responsável atual, administrador ou supervisão autorizada por `can_manage_clinica`. O servidor verifica vínculo com a clínica, existência da conversa e estado aberto. As permissões de supervisão são consultadas no servidor, sem aceitar o perfil enviado pelo navegador.

O núcleo compartilhado `resolverConversaCore` já grava `resolved_by` e o evento `FINALIZADA.user_id` com o usuário autenticado que encerrou. `last_assigned_user_id` e `ultimo_atendente` preservam a responsável anterior. O leitor de eventos resolve o nome do autor por `user_id`, independentemente da lista de destinatários de transferência. Não é preciso assumir a conversa antes de encerrar. Uma conversa já encerrada é rejeitada antes de chamar o núcleo, preservando a autoria existente em chamadas posteriores.

Validação: 11 testes de permissão e supervisão passaram, incluindo execução do núcleo com banco simulado para admin e supervisor. Confirmados o autor real e a preservação da atendente original. Não houve encerramento de conversas reais nem teste contra o banco publicado. Não foram alterados os demais módulos do ClinicaOS e não há migration neste ajuste.
