# Encaminhamento após 30 minutos sem retorno à Nina

Regra: a Nina enviou uma mensagem e o paciente não retornou por 30 minutos, enquanto a conversa permanece aberta, exclusivamente com a Nina. O conteúdo da resposta não restringe a regra: informação, saudação, pergunta e áudio contam. Não é o tempo total da conversa.

Exemplo: resposta da Nina às 14h abre prazo até 14h30. Uma mensagem do paciente às 14h20 cancela esse prazo. Se a Nina responder às 14h21, o novo prazo termina às 14h51. Se um atendente assumir ou encerrar a conversa antes, não há transferência por esse prazo.

## Implementação

- Reutiliza `atend_conversas.awaiting_patient_since` e `patient_response_deadline`. Prazo fixo de 30 minutos nos dois ambientes. A antiga variável `NINA_PATIENT_RESPONSE_TIMEOUT_MINUTES` deixa de alterar essa regra.
- WhatsApp e console registram a espera depois da saída. O registro confere a última mensagem efetivamente persistida com estado `sent`, `delivered` ou `read`, autora Nina, sessão e dono atuais. Mensagens internas, saída pendente/falha e resposta do paciente não abrem contagem. Repetir o registro da mesma saída não prolonga o prazo.
- A rota autenticada `/api/public/nina/watchdog` executa a varredura de espera a cada chamada do cron existente `nina-watchdog-processamento`, configurado para cada minuto. Não exige novas mensagens, modelo ou navegador aberto. O endpoint legado de timeout continua disponível. A varredura do webhook ocorre depois de cancelar a espera pelo retorno do paciente.
- O vencimento troca responsável, limpa prazo e invalida operação pendente em um único UPDATE do handoff canônico, condicionado ao mesmo prazo, última mensagem, sessão, IA ativa e ausência de atendente. Duas execuções não duplicam o encaminhamento. Falha antes do UPDATE mantém o prazo para outra tentativa.
- Atendimento real usa a distribuição existente; sem atendente elegível, aguarda na fila humana. Homologação registra encaminhamento e silencia a Nina sem atribuir atendente real. Conversa não é encerrada por esse timeout.
- Evento `TIMEOUT_NINA` registra mensagem da Nina, início, prazo e motivo `patient_response_timeout`. O resumo usa o contexto anterior ao handoff; não pode regravar o estado de uma sessão reaberta.

## Validação e limites

Testes com relógio, armazenamento e transporte simulados exercitam os serviços reais de espera/handoff: limite exato de 30 minutos, retorno do paciente, mensagem informativa, nova resposta, registro repetido, transferência humana, homologação, ausência de atendente, falha de banco, dupla execução, sessão nova e corridas de encerramento/atribuição/entrada. Testes dos adaptadores conferem registro após persistência nos dois canais. O job testa autenticação e independência de falhas da recuperação.

Não há migration nova. O cron existente precisa estar ativo e apontar para a aplicação atualizada. A transferência ocorre na primeira varredura após vencer o prazo; em funcionamento normal há até cerca de um minuto adicional, além do tempo de processamento/fila. Falhas de infraestrutura ou lotes acima da capacidade podem atrasar a execução. O lote processa até 25 conversas por chamada.

Esta entrega não preenche prazos retroativamente em conversas antigas sem registro de espera. Não foram enviados testes a pacientes reais. Publicação e validação operacional do cron são etapas posteriores à validação local.
