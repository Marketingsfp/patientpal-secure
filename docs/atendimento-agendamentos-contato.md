# Agendamentos no painel de contato

Regra de exibição solicitada em 20/09/2026: ocultar agendamentos de dias anteriores e cancelados. O dia de hoje inteiro permanece visível, mesmo após a hora marcada, usando o calendário de `America/Sao_Paulo`.

- O backend filtra clínica, paciente, início a partir da meia-noite local e status diferente de `cancelado` antes de limitar a cinco registros. Exibe os próximos em ordem de data.
- O componente aplica a mesma regra aos dados em cache e atualiza o dia à meia-noite e ao retomar a aba.
- Eventos de agendamento atualizam apenas o contato correspondente, sem recarregar o histórico ou mudar a conversa selecionada. Reconexão e retorno à tela também conferem os dados; o fallback do canal cobre indisponibilidade do tempo real.
- Nenhum agendamento, mensagem ou histórico é apagado. Não muda a agenda nem as permissões existentes.

Validação local: cinco regressões de datas, cancelamentos, virada do dia em UTC/São Paulo e roteamento de eventos, além das regressões de seleção, acesso e tempo real (107 testes em oito arquivos). Verificação de tipos aprovada. Publicação e conferência no ambiente publicado pendentes.

Chrome, componente real com dados fictícios: registros passados e cancelados ficaram ocultos; o cancelamento simulado removeu apenas a consulta de hoje e preservou a consulta de amanhã. Nenhum registro real foi alterado.
