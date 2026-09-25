# Jev na Nina — 4 fases, só na homologação

Cada fase é entregue, testada e aprovada antes da próxima começar. Em todas as fases o Jev vale **apenas na homologação**. A produção continua exatamente como hoje até você autorizar a ligação, clínica por clínica.

## Fase 0 — Preparação (base comum, feita uma vez)
- Confirmar que o Jev está disponível na conta e verificar se ele guarda dados no fornecedor (LGPD). Se guardar, paramos e levamos a decisão à equipe da clínica antes da Fase 1.
- Criar um módulo único de chamada ao Jev, usado por todas as fases. Em caso de erro ou demora, ele devolve "sem decisão" e a Nina segue o fluxo atual (nunca trava a conversa).
- Criar uma chave "Jev" por clínica, com uma opção para cada fase. Ela fica ligada só na homologação e desligada na produção.
- Registrar cada decisão do Jev (pergunta, resposta, confiança, tempo) na trilha de auditoria que já existe, para comparar com o comportamento atual.

## Fase 1 — Entender o pedido
- A cada mensagem, o Jev classifica a intenção: agendar, remarcar, cancelar, preço/informação, resultado de exame, reclamação, falar com atendente ou outro.
- Com confiança alta, o código leva a Nina direto ao fluxo certo. Com confiança baixa, a Nina continua decidindo como hoje.
- O Gemini 3.8 continua escrevendo todas as respostas.
- Teste: conversas de homologação e cenários de carga já existentes, comparando se o fluxo escolhido é igual ou melhor.

## Fase 2 — Encaminhar para atendente
- O Jev avalia três perguntas, cada uma com uma probabilidade de "sim": sinal de urgência clínica, paciente irritado, pedido explícito de atendente.
- Acima do limite, a conversa é encaminhada para a recepção pelo fluxo de encaminhamento que já existe.
- Possível regra de negócio — validar com a equipe da clínica: quais situações encaminham e quais limites usar. Proposta inicial: urgência 0,5; pedido de atendente 0,7; irritação 0,8. Os limites ficam ajustáveis na tela, sem mexer no código.

## Fase 3 — Especialidade e serviço
- Quando o paciente descreve o que precisa, o código monta a lista real de especialidades e serviços da clínica e o Jev escolhe uma opção ou "nenhuma".
- Substitui, na Nina, a dependência da lista fixa de sinônimos. O intake da API continua como está nesta fase.
- Com confiança baixa, a Nina pergunta ao paciente em vez de escolher.

## Fase 4 — Conferir o cadastro
- Só entra quando a identificação atual (nome + nascimento + telefone) encontra mais de um cadastro possível.
- O Jev avalia qual cadastro combina com os dados da conversa. Ele não cria nem altera cadastro: só sugere.
- Com confiança baixa ou em caso de empate, a Nina pede um dado extra ao paciente. A regra atual de isolamento entre produção e homologação continua valendo.

## Fora do escopo
- Produção (só depois da sua aprovação, fase por fase).
- Voz, transcrição, Avaliação (Opus 5.5) e a checagem de resposta antes do envio (itens 5 e 6).
- Alterações no núcleo da agenda e nos dados de pacientes.

## Detalhes técnicos
- Chamadas feitas no servidor, direto ao endereço de decisões do Jev (`/v1/systemone`), com o modelo `typesafe/jev-latest` e a chave do servidor. Erros seguem as regras do AI Gateway: sem nova tentativa em recusa ou em 402/403.
- As perguntas de uma mesma mensagem vão juntas em uma única chamada (as Fases 1 e 2 compartilham a chamada quando as duas estiverem ligadas).
- Antes de cada fase: mapear o ponto exato do fluxo da Nina onde entra (turno/fluxo-estado, handoff, catálogo, cadastro-paciente) e apresentar o que muda.
- Validação de cada fase: testes automáticos das decisões e do caminho "sem decisão", typecheck, uma conversa real na homologação e um relatório Antes/Depois.
