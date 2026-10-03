# Melhorias do Jev — em etapas, uma de cada vez

O pedido junta 10 melhorias em áreas críticas (agenda, transferência, Central). Fazer tudo de uma vez reduz a qualidade e dificulta encontrar erros. Cada etapa é entregue, testada e aprovada antes da próxima. Toda novidade fica atrás de uma chave própria por clínica, desligada até você ligar. Se o Jev errar ou demorar, a Maria segue o fluxo atual.

## Etapa A — Conferir a resposta antes de enviar (item 1)
- Antes de cada envio, o Jev responde a perguntas de sim ou não sobre a resposta da Maria:
  - prometeu vaga sem consultar a agenda?
  - disse "agendado" sem confirmação do sistema?
  - citou valor, endereço ou telefone que não estão nos dados fornecidos?
  - cancelou ou prometeu cancelar (o cancelamento é sempre feito pela recepção)?
- Se algum sinal passar do limite, a Maria refaz a resposta uma vez, com o problema apontado. Se o erro continuar, a mensagem segura é enviada e o caso fica registrado.
- Chave: `nina_jev_fase6`.

## Etapa B — Entender o "sim" e a escolha de horário (itens 2 e 3)
- Só entra quando a Maria acabou de propor um resumo ou uma lista de opções.
- Escolha: aceitou / recusou / pediu outra coisa / não está claro.
- Horário: qual das opções realmente oferecidas foi escolhida, ou "nenhuma". O Jev nunca inventa um horário.
- Com 80% de certeza ou mais, o sistema usa a resposta. Abaixo disso, a Maria pergunta de novo. A gravação continua dependendo da confirmação do sistema.
- Chave: `nina_jev_fase7`.

## Etapa C — Painel de decisões e calibragem (itens 5 e 6)
- Uma tela somente leitura com as decisões do Jev: fase, resposta, certeza, tempo e se foi aplicada. Tem filtros por clínica, período e fase.
- Um relatório de cada sinal de transferência, com a quantidade de casos por faixa de pontuação. Ele ajuda a escolher limites novos.
- Os limites passam a ser ajustáveis na tela, por clínica, sem mexer no código. Os valores atuais são o padrão.

## Etapa D — Motivo da transferência e fila (itens 7, 9 e 10)
- O Jev escolhe o motivo entre categorias fixas, e a Maria escreve só a frase do resumo.
- A Central ganha um filtro por categoria da conversa.
- Em "Prioridades agora", urgência e irritação sobem na lista, sem mudar as regras de espera que já existem.

## Etapa E — Remarcação (item 4) e sinais de urgência (item 8)
- Bloqueada por regra de negócio:
  - Remarcação: falta a antecedência mínima.
  - Urgência: falta a lista de sinais (dor forte, sangramento, gestante, criança...) e o limite de cada um.
- Possível regra de negócio — validar com a equipe da clínica.

## Fora do escopo
- Publicar (só com a sua autorização).
- Mudar a gravação de agendamentos ou os dados de pacientes.
- O Jev escrevendo textos.

## Detalhes técnicos
- Todas as chamadas passam por `perguntarJev` (`jev.server.ts`), com registro em `nina_jev_decisoes`. As perguntas da mesma mensagem vão juntas numa só chamada (a Etapa A é uma chamada própria, depois que a resposta é gerada).
- Novos módulos puros: `jev-conferencia.ts`, `jev-confirmacao.ts` e `jev-motivo.ts`, cada um com testes do caminho "sem decisão".
- Os limites ficam numa tabela por clínica, com padrão no código e RLS restrita a administradores.
- A Etapa A acrescenta cerca de 1 chamada por mensagem enviada. Vou medir o tempo e o custo na homologação antes de ligar.
- Validação por etapa: `bun test`, `bunx tsgo --noEmit -p tsconfig.json`, uma conversa real na homologação e um relatório Antes/Depois.

Ordem sugerida: A → B → C → D. A Etapa E fica aguardando as respostas.
