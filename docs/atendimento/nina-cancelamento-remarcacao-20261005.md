# Cancelamento e remarcação — Nina

Regra confirmada por JEAN em 05/10/2026: a Nina não cancela nem remarca. Pedidos dessas operações são encaminhados à equipe humana.

No MJ-730, a Nina ofereceu outro horário após uma reserva concluída e tentou `selecionar_horario`. A operação retornou `ACTION_NOT_AUTHORIZED`: “O horário já confirmado não pode ser alterado por esta operação.” A proteção de reserva funcionou; o erro era conduzir a remarcação como nova seleção e apresentar uma causa genérica de falha operacional.

## Implementação

- `cancelamento-remarcacao.ts`: leitura conservadora de pedidos explícitos e classificação contextual na chamada existente do Jev, sem nova chamada de IA. A referência a uma reserva confirmada deve pertencer à sessão atual; os demais casos dependem do pedido explícito ou da interpretação do histórico.
- `whatsapp.server.ts`: encaminhamento antes de cadastro, seleção e criação de reserva. Também interrompe todo o lote quando o modelo solicita o handoff administrativo. Usa broker, protocolo, conferência de revisão e transporte existentes.
- Contrato obrigatório e prompt de referência: não oferecer troca, consultar alternativas nem pedir confirmação adicional para encaminhar. Não publicar automaticamente um novo prompt nem reescrever versões históricas.
- Motivos `CANCELAMENTO_SOLICITADO` e `REMARCACAO_SOLICITADA` têm categoria `cancelamento_remarcacao` e apresentação legível para a equipe. Possível urgência mantém prioridade e ambas as causas ficam no registro.
- Não cria ferramenta de cancelamento/remarcação nem modifica o módulo de agenda, reservas ou cadastros. Homologação preserva o encaminhamento simulado.

## Validação e limites

Regressões no núcleo compartilhado com serviços simulados: MJ-730, reserva na mesma sessão, pedido explícito em sessão nova, Jev desligado, decisão contextual, lote com handoff e tentativa posterior de reserva, negação, pergunta geral, escolha sem reserva, urgência e revisão obsoleta. Testes de motivos, ausência de nome e falhas de agenda também executados.

Os testes locais não validam a interpretação pelos modelos reais nem a implantação. Após publicar o servidor, conferir o fingerprint e repetir cancelamento/remarcação nos dois caminhos com as mesmas fontes e configurações. Verificar que não há consulta de vaga substituta ou gravação, que o motivo é legível e que mensagens repetidas/simultâneas não duplicam protocolo. A verificação real de transporte/atribuição permanece pendente; envio ao GitHub não comprova implantação no Lovable.
