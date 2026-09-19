# Profissional único: escolha da data

Regra de negócio de 19/09/2026, compartilhada pelo WhatsApp e pela homologação, para todas as clínicas.

## Antes e depois

A CONV-07 exigia oferecer escolha de profissional ou primeiro disponível mesmo quando o atendimento tinha somente um profissional. Agora a pergunta depende dos profissionais distintos publicados para a consulta, exame ou procedimento solicitado, incluindo seus executantes. Vários dias ou preços do mesmo profissional não aumentam essa quantidade; um resultado parcial não comprova profissional único.

- **Um profissional:** “Você prefere a primeira data disponível ou deseja escolher outra data?”. A primeira data consulta a agenda desse profissional; outra data respeita o dia/período informado. Só pergunta o dia se ele ainda faltar.
- **Vários profissionais:** mantém escolher o profissional ou consultar o primeiro disponível entre todos os vinculados ao atendimento.
- **Preferência já expressa:** aproveita o contexto e consulta, sem exigir repetição do nome do médico nem da escolha de data. “Sim, para amanhã” já informa uma preferência de data.
- **Exceções:** SFP continua com encaminhamento silencioso prioritário; técnico/técnica mantém omissão do nome; sem pré-agendamento mantém orientação de comparecimento, sem promessa de reserva.

Consultar disponibilidade continua diferente de selecionar uma vaga, confirmar o resumo ou gravar um agendamento.

## Publicação

A versão em uso encontrada na Arquitetura era a v32, sem rascunho. Foi modificada somente a CONV-07 e alinhada a CONV-06 para retirar a exigência conflitante de escolher um médico em todos os casos. Rascunho v33 e **v34 publicada em 19/09/2026 às 09:02 (America/Sao_Paulo)**. Após recarregar, o texto persistido foi comparado integralmente com o preparado: 39.224 caracteres. O histórico anterior foi preservado.

A cópia de fallback em `src/lib/nina/prompt/consulta-agenda.ts` recebeu a mesma CONV-07. Não foram adicionados filtros por palavras-chave, ferramentas ou alterações de banco.

## Validação

- 132 testes passaram: executor de agenda e composição do prompt, com dependências simuladas.
- 15 testes passaram: regras do catálogo no fluxo, incluindo SFP e técnico/técnica, com modelo/banco simulados e rede proibida.
- `bun run typecheck` e `git diff --check` passaram.
- Homologação com modelo real: Paciente Teste 10, sessão 19, ciclo `3201579b`. A pergunta “Olá, gostaria de informações sobre ecocardiograma.” recebeu o bloco de Rosângela Riolino e terminou com a pergunta entre primeira data disponível e outra data, sem pedir escolha de profissional.
- Os detalhes da resposta registraram **prompt 34**, `consultar_base_conhecimento` concluída e geração pelo modelo real. Nenhuma mensagem foi enviada ao WhatsApp.
- Na continuação “A primeira data disponível, por favor.”, o rastreio confirmou `buscar_medicos` e `proxima_vaga` concluídas. A Nina apresentou horários de 19/09/2026 para a mesma profissional, com valores e modalidade de hora marcada, sem pedir escolha do médico. A pesquisa não criou agendamento.
- Ao receber “Prefiro escolher outra data.”, respondeu somente “Qual data ou período você prefere para realizar o atendimento?”, sem retomar a escolha de profissional.
- O ciclo foi resolvido às 09:09. O lead ficou na sessão 20, nova e sem mensagens; o histórico da validação foi mantido. Não houve criação de paciente nem de agendamento.
