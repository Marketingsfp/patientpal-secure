# Escala habitual antes de consultar vagas

Regra solicitada em 05/10/2026 após o exemplo da sessão 631 do Paciente Teste 01: apresentar primeiro os dias e horários habituais dos médicos; consultar a agenda do Clínica OS depois que o paciente demonstrar interesse em agendar.

As instruções anteriores favoreciam a oferta do primeiro disponível, inclusive antes da lista quando havia mais de quatro profissionais. O prompt de referência passa a orientar escala por profissional e oferta de agendamento. O contrato efetivo do turno recebe a mesma regra com prioridade sobre a orientação anterior, inclusive quando o prompt publicado ainda é antigo. As descrições de consultar_disponibilidade, verificar_horario, proxima_vaga e consultar_primeiro_disponivel foram alinhadas.

Escala não comprova vaga. Se não estiver informada, a Nina deve dizer isso e oferecer a consulta após interesse, sem inventar horários. Conversas que já estão escolhendo vagas continuam da etapa atual. Permanecem as exceções SFP/encaminhamento e comparecimento sem pré-agendamento, bem como cadastro e confirmação antes da reserva.

A interpretação da mensagem continua com o modelo e o histórico da sessão. Esta mudança não adiciona um bloqueio determinístico por palavras-chave, novas chamadas ao modelo ou outro classificador. Não altera agenda, preços, banco ou histórico dos prompts publicados. Jev não ganha autorização para reservar.

## Verificação

- 398 testes passaram em seis arquivos, com banco/modelo simulados: contrato entregue ao modelo nos dois ambientes, continuidade de escolha e confirmação, executor de agenda, cadastro e regras do catálogo.
- O teste de equivalência entre a publicação histórica consolidada e o prompt atual já falhava no commit anterior `df4609aa575b8088c5a5f2a465f843a5fcd35272`. A falha foi reproduzida com cópias dos arquivos daquele commit e não foi ocultada nem alterada nesta entrega. Ele requer uma revisão própria da evolução histórica dos prompts.
- Implantação no Lovable e comportamento com o modelo real precisam ser verificados após a publicação do backend. Os testes simulados não comprovam que o modelo seguirá a sequência em produção.

Rollback: reverter este commit de instruções e descrições; não há migration ou registros operacionais a desfazer.
