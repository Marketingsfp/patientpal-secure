# Consulta da agenda pela intenção contextual

Solicitação de 17/09/2026: a continuidade não pode depender da frase literal do paciente ou da redação da pergunta anterior. O caso “sim, pra hoje”, após uma pergunta encerrada com “Assim já verifico as vagas certinho para você!”, perdia o interesse e retirava as ferramentas de disponibilidade antes da chamada ao modelo.

## Correção

O modelo da Nina recebe o histórico válido da sessão e decide se deve consultar a agenda, com qual profissional e quais filtros. As quatro ferramentas de leitura permanecem acessíveis desde a primeira rodada e depois da consulta ao catálogo. Foram removidas do gerador e do executor as decisões por expressões regulares de interesse, escolha de médico e preferência pelo primeiro disponível. Não há novo classificador ou nova chamada ao modelo para interpretar a intenção.

O contexto deixa de declarar `interesse_confirmado: false` e de apresentar a seleção heurística como a preferência do paciente. A mensagem atual entra uma vez por ID; mensagens repetidas em turnos diferentes continuam existindo. A janela padrão do modelo usa até 20 mensagens da sessão, com até 4.000 caracteres por mensagem, sem o corte anterior de 1.500 caracteres. Mensagens de outra conversa, sessão ou ambiente, avisos de sistema e respostas não entregues são excluídos. A leitura completa da sessão continua sujeita ao limite existente de 1.000 registros e, se incompleta, usa o histórico recente como fallback.

O servidor continua validando identificadores e vínculos oficiais, médico ativo da própria clínica, nomes ambíguos, SFP, modalidades, disponibilidade e filtros da consulta. Consultar somente registra opções; não escolhe a primeira vaga, não fabrica consentimento e não grava agendamento. As validações do resumo final, identidade, médico/data/horário e indisponibilidade da vaga confirmada permanecem em vigor. Sem migração ou alteração de dados históricos, preços, pacientes ou agendamentos reais.

A CONV-07 orienta a interpretação conjunta do pedido, histórico, pergunta pendente e resposta atual, preservando preferências e distinguindo consulta, escolha e confirmação. Negativas, desistências e ambiguidades são interpretadas pelo modelo. Se realmente faltar uma informação, ele deve esclarecer esse ponto, sem exigir que o paciente repita uma frase específica.

As heurísticas antigas em `consulta-agenda.ts` permanecem para compatibilidade com o avaliador legado; não decidem acesso à agenda no fluxo ativo.

## Validação

379 testes passaram, em 13 arquivos, com banco e modelo simulados:

- 122 do executor: consultas com diferentes redações, comparação entre médicos, escopo da clínica, ambiguidades nos identificadores, SFP, modalidades, ausência/falha de vagas e regressão de 08:00 versus 10:20, incluindo confirmação e gravação exatas.
- 14 do gerador real: contexto histórico, ferramentas acessíveis em todas as rodadas, escolha de médico, primeiro disponível, data contextual, troca de médico, negativa e resposta ambígua, nas origens WhatsApp e homologação.
- 24 de histórico e encaminhamento após agenda sem vagas.
- 163 de compatibilidade da continuidade, seleção, resumo e encaminhamento.
- 56 de construção de contexto, catálogo ausente, SFP, técnico/técnica e resposta direta.

`bun run typecheck` e `git diff --check` passaram. Os testes do gerador simulam as decisões do modelo; comprovam o contexto e a execução sem bloqueio literal, não a qualidade semântica de um modelo real. Não houve chamada ao provedor, mensagem ao WhatsApp ou reserva real.

## Ativação

Rascunho v31 atualizado e salvo na Arquitetura, com 36.425 caracteres, preservando o restante das instruções. Na última conferência, a versão em uso era v30, publicada às 16:19 de 17/09/2026. Esta entrega ao GitHub inclui o código da correção e a ferramenta `consultar_primeiro_disponivel`, integrados aos commits dos colaboradores. A implantação do site e a publicação do rascunho são etapas posteriores.

Implantar o código e publicar o rascunho na mesma entrega. Depois, validar no ambiente de homologação com o modelo real: escolha de médico → respostas curtas e variadas sobre o dia → consulta efetiva registrada na execução → horários, modalidade e valores → escolha → resumo final → aceite da opção exata. Incluir desistência e resposta realmente ambígua para conferir que o modelo esclarece sem efetuar reserva.

Atualização às 18:22 de 17/09: o conteúdo do rascunho foi preservado e publicado na v32, com reforço da oferta obrigatória das duas alternativas. O registro de ferramentas do servidor já incluía a comparação entre profissionais. A publicação e a primeira resposta com o modelo real foram verificadas; detalhes em [Escolha de médico ou primeiro disponível](primeiro-disponivel-2026-09-17.md#ativação-e-reforço-da-regra--1709-1822).
