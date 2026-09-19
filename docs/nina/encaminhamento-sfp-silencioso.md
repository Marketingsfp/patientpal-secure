# Encaminhamento silencioso por profissional SFP

Regra solicitada em 19/09/2026: consulta ou procedimento publicado com profissional SFP deve continuar com a equipe humana, sem mensagem da Nina ao paciente.

## Comportamento

- A transferência mantém a distribuição existente: Online recebe em Ativas; Pausa recebe em Não atribuídas individual, até dez; sem candidata elegível, fica na global. Offline continua excluído.
- Protocolo, motivo e resumo permanecem internos. Não há saudação, preço, instruções, aviso de transferência ou protocolo enviado ao paciente nesse encaminhamento.
- A atribuição posterior e novas tentativas de anúncio também respeitam o silêncio, usando o motivo gravado na conversa.
- Homologação registra a passagem à fila humana sem ocupar atendentes reais, mantendo o isolamento já existente.
- Se a transferência falhar, a Nina informa a dificuldade, sem afirmar que encaminhou. Outros motivos de transferência conservam o comportamento anterior.

## Correção

O anúncio do protocolo e o texto final da Nina eram caminhos separados. Agora o serviço de protocolo bloqueia o anúncio SFP e a geração retorna um resultado explícito `descartar`. O console e o transporte reconhecem esse resultado como silêncio deliberado, sem resposta de contingência, áudio ou novo temporizador de espera.

A regra vale tanto para consulta automática ao catálogo quanto para transferência solicitada pelo modelo e bloqueio de agendamento por SFP. O lote de ferramentas termina após a transferência, sem executar um agendamento subsequente.

## Validação

Regressões executam os serviços reais com banco, modelo e transporte simulados: retorno do catálogo, recusa da agenda, motivo da imagem de Anestesia da Videohisteroscopia, atribuição com/sem atendente, repetição, protocolo, console com texto/áudio e falha de transferência. Nenhum paciente real participa dos testes e nenhuma migration é necessária.
