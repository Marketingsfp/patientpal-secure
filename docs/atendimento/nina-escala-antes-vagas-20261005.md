# Escala habitual antes de consultar vagas

Regra solicitada em 05/10/2026 após o exemplo da sessão 631 do Paciente Teste 01: apresentar primeiro os dias e horários habituais dos médicos; consultar a agenda do Clínica OS depois que o paciente demonstrar interesse em agendar.

As instruções anteriores favoreciam a oferta do primeiro disponível, inclusive antes da lista quando havia mais de quatro profissionais. O prompt de referência passa a orientar escala por profissional e oferta de agendamento. O contrato efetivo do turno recebe a mesma regra com prioridade sobre a orientação anterior, inclusive quando o prompt publicado ainda é antigo. As descrições de consultar_disponibilidade, verificar_horario, proxima_vaga e consultar_primeiro_disponivel foram alinhadas.

Escala não comprova vaga. Atualização após o exemplo da sessão 632: se a escala do médico não estiver informada, a Nina deve encaminhar para atendimento humano; a orientação anterior de oferecer consulta à agenda nesse caso foi substituída. O núcleo verifica a ausência no retorno do catálogo e interrompe o lote de ferramentas. O motivo HORARIOS_HABITUAIS_NAO_INFORMADOS é distinto de AGENDA_SEM_VAGAS, usado quando a consulta real não encontra disponibilidade. Preservam-se as exceções SFP, identificação incerta e modalidades sem pré-agendamento com escala publicada, bem como cadastro e confirmação antes da reserva.

A interpretação da mensagem continua com o modelo e o histórico da sessão. A verificação de escala ausente lê campos do catálogo, não palavras-chave da mensagem do paciente. Não adiciona chamadas ao modelo ou outro classificador. Não altera agenda, preços, banco ou histórico dos prompts publicados. Jev não ganha autorização para reservar.

## Verificação

- Atualização de escala ausente: 379 testes passaram em nove arquivos. O núcleo foi testado com um modelo simulado tentando consultar e reservar após catálogo sem escala; as chamadas foram interrompidas. Casos de falha no encaminhamento e turno obsoleto preservam respostas honestas e não executam reservas. Testes usam serviços simulados, sem pacientes ou transferências reais.
- 398 testes passaram em seis arquivos, com banco/modelo simulados: contrato entregue ao modelo nos dois ambientes, continuidade de escolha e confirmação, executor de agenda, cadastro e regras do catálogo.
- O teste de equivalência entre a publicação histórica consolidada e o prompt atual já falhava no commit anterior `df4609aa575b8088c5a5f2a465f843a5fcd35272`. A falha foi reproduzida com cópias dos arquivos daquele commit e não foi ocultada nem alterada nesta entrega. Ele requer uma revisão própria da evolução histórica dos prompts.
- Implantação no Lovable e comportamento com o modelo real precisam ser verificados após a publicação do backend. Os testes simulados não comprovam que o modelo seguirá a sequência em produção.

Rollback: reverter este commit de instruções e descrições; não há migration ou registros operacionais a desfazer.
