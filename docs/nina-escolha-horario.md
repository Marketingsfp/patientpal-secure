# Escolha e confirmação do horário da Nina

Correção do caso em que o paciente escolhe 10:20, recebe um resumo com 10:20, mas a primeira vaga consultada (08:00) fica no estado e é gravada ao responder “Sim”.

## Comportamento implementado

- Consultar disponibilidade guarda opções da clínica e sessão atuais, sem selecionar uma delas.
- Horário explícito é extraído de linguagem livre, sem comparação com uma frase literal. Mais de uma opção compatível exige esclarecimento.
- Escolhas por extenso e referências às opções podem ser interpretadas pelo modelo através de `selecionar_horario`. O executor aceita apenas vagas consultadas e revalida a disponibilidade.
- O servidor produz o resumo com o profissional, procedimento, data, horário e clínica da escolha validada. A geração termina nesse ponto; outra ferramenta do mesmo lote não pode agendar.
- O aceite só é registrado quando o resumo correspondente consta como a última mensagem entregue na sessão. Um “Sim” após uma lista de horários não autoriza o primeiro item.
- A reserva exige correspondência entre o consentimento, o estado e os argumentos da operação. Consultas posteriores não podem mudar a vaga aceita.
- Se a vaga ficar indisponível, o fluxo usa o encaminhamento humano existente. A homologação mantém a simulação de transferência sem atribuir atendente real.
- A conversão da vaga na agenda usa a condição de ocupação da RPC já existente, inclusive quando o horário permanece igual. Não cria encaixe nem sobrescreve uma vaga ocupada durante a operação.

## Validação

Resultado local: **355 testes aprovados em 19 arquivos**, `bun run typecheck` aprovado e `git diff --check` sem erros. Os arquivos com mocks de módulos foram executados em processos separados para impedir interferência entre simulações.

Testes automatizados com banco e provedor simulados cobrem variações como “10:20 fica melhor”, “eu prefiro 10:20”, “marca pra 10:20”, “eu vou 10:20”, ambiguidades, isolamento entre sessões/clínicas, resumo não entregue, consentimento incompatível, ocupação concorrente, transferência e interrupção de ferramentas após o resumo. Os caminhos de produção e homologação utilizam o mesmo código.

Os testes da interpretação por extenso fornecem a chamada estruturada do modelo: não constituem uma avaliação de linguagem natural contra um provedor ao vivo. A validação operacional no ambiente publicado permanece posterior à publicação. Não foram criados ou alterados agendamentos reais.

Sem migração de banco. Os campos de opções e confirmação ficam no estado JSON existente. Sessões anteriores sem prova de resumo precisam receber uma nova confirmação antes de agendar.
