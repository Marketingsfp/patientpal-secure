# Confirmações curtas na Nina

Correção de continuidade conversacional: “isso” deve responder à pergunta que acabou de ser entregue. No caso analisado, existia uma única opção de médico. A repetição indevida esgotou o limite de esclarecimento. Além disso, o ajuste da especialidade “clínica médica” para “clínico geral” era tratado como dúvida sobre o nome do médico.

## Pesquisa e limites

- [PEUL/UFRJ](https://peul.letras.ufrj.br/): pesquisa variação do português falado e escrito no Rio de Janeiro. A própria diversidade estudada desaconselha presumir uma maneira única de escrever de todos os cariocas.
- [Costa, 2021 — Os marcadores conversacionais no WhatsApp: análise da conversação virtual (UFC)](https://repositorio.ufc.br/handle/riufc/61385): investiga funções de marcadores conversacionais, incluindo concordância e discordância, na escrita do WhatsApp. O corpus é de estudantes de Fortaleza; não é evidência de frequência de gírias cariocas.

Aplicação ao produto (decisão de engenharia): interpretar a concordância pela pergunta e pelo referente, tolerando escrita informal, sem inferir identidade regional. Os exemplos pedidos pelo usuário (“isso”, “esse mesmo”, “esse”, “sim”) e as abreviações testadas são casos operacionais; não constituem um levantamento representativo de frequência no Rio. Nenhum treinamento de modelo foi realizado.

## Comportamento e validação

O servidor associa a resposta afirmativa a uma única opção de profissional, vinculada à última pergunta efetivamente entregue na sessão. Reconsulta o ID publicado, preserva a especialidade e retira o esclarecimento quando a identificação é resolvida. Ajustes de escrita na especialidade não tornam ambíguo um nome exato ou ID de médico.

Várias opções, pergunta posterior, recusa, condição, dúvida e referência sem vínculo não autorizam seleção automática. Um ID e nome que deixaram de coincidir com a publicação não persistem como preferência. A seleção do médico não concede aceite de agendamento: a reserva continua exigindo os dados e o resumo final entregue.

Os testes incluem o núcleo real do atendimento com banco/modelo simulados, recuperação real do catálogo, produção e homologação; cobrem “Isso”, “esse mesmo”, “esse”, “sim”, “ss” e “Confirmo” após a segunda pergunta. Os testes não enviam mensagens nem criam agendamentos na clínica.
