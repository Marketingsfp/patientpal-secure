# Motivos de transferência da Nina

Revisão de referência: 53dff35ea68a41bc022598c678728d86b34b51cc (origin/main), com a correção de apresentação e propagação desta alteração. Escopo: Nina, WhatsApp e OS ZAP.

## O que mudou

Antes, códigos como PROFISSIONAL_SFP e NINA_PROCESSING_FAILED viravam uma frase genérica na tela. Restrições do catálogo podiam perder a identificação do item no caminho até a transferência. A ferramenta atribuía um pedido ao paciente quando o modelo omitia o motivo.

Agora, o motivo acompanha a decisão até o encaminhamento e tem apresentação legível no cartão interno, na fila humana, nos marcadores e nos detalhes técnicos. O registro original continua disponível no diagnóstico. O motivo independe da geração do resumo. Se faltar em um histórico antigo, a tela informa “Motivo não registrado neste atendimento”. Não há reconstrução pelo cadastro atual nem reescrita de históricos.

## Causas existentes no código

| Motivo | Quando ocorre |
| --- | --- |
| PROFISSIONAL_SFP | O modelo solicita encaminhamento pela regra SFP das instruções publicadas. Uma restrição explícita do catálogo também leva essa identificação quando a evidência correspondente aponta exclusivamente para SFP. Apenas encontrar esse nome não cria uma transferência. |
| CATALOGO_ATENDIMENTO_HUMANO | O serviço ou profissional consultado tem encaminhamento humano obrigatório no cadastro. Leva o nome do item; SFP não é presumido em listas com outros profissionais. |
| CATALOGO_SEM_REGISTRO | A busca e o fluxo de esclarecimento não encontram a consulta ou procedimento solicitado. Ausência na primeira tentativa não deve ser confundida com o limite de identificação. |
| CATALOGO_MEDICO_SEM_REGISTRO | O profissional solicitado não foi localizado no catálogo após o fluxo de identificação aplicável. |
| CATALOGO_IDENTIFICACAO_NAO_ESCLARECIDA | O esclarecimento do atendimento ou profissional continua inconclusivo; o fluxo usa o estado da conversa e as respostas do paciente, não o número de chamadas de ferramenta. |
| CATALOGO_MEDICO_NAO_IDENTIFICADO | Após reapresentar opções e pedir escolha, ainda não foi possível identificar o médico desejado. |
| AGENDA_SEM_VAGAS | A consulta à agenda foi concluída e não encontrou vagas nem alternativas aplicáveis. Erro na consulta não é prova de agenda vazia. |
| VAGA_ESCOLHIDA_INDISPONIVEL | O fluxo de confirmação não consegue concluir a vaga selecionada. O erro SLOT_UNAVAILABLE pode oferecer nova escolha; nem todo conflito de vaga gera transferência automática. |
| MODALIDADE_NAO_DEFINIDA | Falta definição confiável de horário marcado, ordem de chegada ou pré-agendamento. |
| MODALIDADE_ALTERADA | A modalidade/agenda mudou depois da escolha e precisa de conferência. |
| FALHA_OPERACIONAL_AGENDAMENTO | Falha de consulta, identificação, vínculo ou reserva impede concluir o agendamento. O motivo conserva a etapa/código; quando o vínculo catálogo–agenda está ausente, a tela explica essa causa específica. |
| JEV_URGENCIA_CLINICA | Com a fase correspondente habilitada, o Jev identifica possível urgência acima do limite configurado. Encaminha com prioridade alta. Não é diagnóstico médico. |
| JEV_PEDIDO_ATENDENTE | Jev identifica pedido de atendimento humano acima do limite configurado. |
| JEV_IRRITACAO | Jev identifica irritação/insatisfação acima do limite configurado. |
| JEV_DUVIDA_REPETIDA | Jev identifica três mensagens seguidas sem entendimento e sem avanço; o código considera até duas perguntas de esclarecimento. O fluxo próprio do catálogo tem precedência quando há esclarecimento de identificação pendente. |
| FOTO_NAO_LIDA_APOS_NOVA_TENTATIVA | Outra foto continua ilegível após o pedido de uma nova imagem ter sido entregue. Repetição de processamento ou duas fotos do mesmo lote não equivalem a duas tentativas. |
| FOTO_REQUER_AVALIACAO_HUMANA | A leitura identifica imagem fora do escopo administrativo de pedidos, como receita de medicamento ou outro documento que exige conferência. |
| patient_response_timeout | O paciente permanece sem responder durante 30 minutos após a mensagem que iniciou a espera, respeitando as condições de sessão, responsável e atualização da conversa. |
| LIMITE_RODADAS | O modelo consome o limite de etapas sem produzir resposta textual. |
| NINA_PROCESSING_FAILED | A recuperação do processamento conclui que houve falha técnica definitiva e encaminha para evitar abandono. |

As implementações estão em regras-catalogo, catalogo-sem-registro, catalogo-esclarecimento, identificacao-gate, falha-agendamento, jev-encaminhamento, fotos, espera-timeout, watchdog e no núcleo whatsapp.server.ts.

## Decisões do modelo e categorias do Jev

A ferramenta de atendimento humano permanece disponível ao modelo. Também pode ser usada para pedido explícito de uma pessoa, reclamação, cobrança, dependência de conferência pela equipe e outras situações justificadas nas instruções publicadas. A Nina deve registrar a pendência concreta: por exemplo, “Conferir recebimento do pagamento da consulta”. Não existe uma lista finita de frases produzidas pelo modelo.

Agendamento automático desativado na unidade é outra situação em que a ferramenta de vagas orienta o modelo a encaminhar à recepção. Isso não significa que toda pergunta sobre preço ou horário deva ser transferida.

Na Fase 8, o Jev apenas categoriza um encaminhamento já solicitado: urgência, insatisfação, pedido de atendente, agendamento, cancelamento/remarcação, financeiro, resultado/documento, cadastro/identificação, não compreendido ou outro. Outra unidade é uma categoria reconhecida pelo código para SFP. Categoria e motivo não são a mesma coisa: “Financeiro” não substitui a explicação do problema.

Se o modelo omitir o motivo, registra-se MOTIVO_NAO_INFORMADO, sem afirmar que o paciente pediu a transferência. A transferência não é bloqueada por falta dessa descrição.

## Registros antigos

Há traduções de códigos legados, como patient_request, NO_AVAILABILITY, TOOL_ERROR, LLM_ERROR, watchdog_timeout, MISSING_REQUIRED_SOURCE e ENTIDADE_AMBIGUA. Exibi-los não reativa motores ou políticas antigas. Códigos desconhecidos permanecem no diagnóstico e a tela sinaliza que é necessário consultar os detalhes técnicos.

## Validação e publicação

Critérios de encaminhamento, permissões, atribuição e opção de avisar o paciente foram preservados. Homologação e ambiente real usam o mesmo núcleo; apenas os efeitos de transporte/atribuição diferem. Testes automatizados cobrem motivos, SFP, restrições de catálogo, propagação no executor/gate, apresentação e silêncio em retries, com serviços externos simulados. Esses testes não comprovam o comportamento de modelos reais nem a implantação no Lovable. O push ao GitHub precisa ser seguido da conferência da versão publicada.
