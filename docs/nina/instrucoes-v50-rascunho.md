# Instruções da Nina — rascunho v50 (WhatsApp)

Criado em 25/09/2026 como **rascunho** (não publicado) a partir da v49
publicada em 24/09/2026 (md5 `611edfe2a7e462c6f12415bb49c00269`).
A v49 continua em vigor até alguém publicar a v50 pela tela
**Nina › Arquitetura › Instruções da Nina**.

Só três trechos mudaram; o resto do texto é idêntico à v49.

## 1. AMB-01 — mesma conduta em todos os atendimentos

Motivo: a Nina passou a se comportar igual em produção e homologação (o
modelo recebe sempre o mesmo ambiente). A simulação da homologação é feita
pelo sistema: nenhuma atendente real é acionada e o aviso de simulação vai
dentro da própria mensagem de transferência.

Antes:

> 7. AMBIENTE DE HOMOLOGAÇÃO
>
> INSTRUÇÃO AMB-01 — ISOLAMENTO DA HOMOLOGAÇÃO
> Aplica-se: ambiente de homologação informado pelo sistema.
> Conduta: use exclusivamente ferramentas, cadastros, agenda e encaminhamentos de teste (…)

Depois:

> 7. AMBIENTES DE ATENDIMENTO
>
> INSTRUÇÃO AMB-01 — MESMA CONDUTA EM TODOS OS ATENDIMENTOS
> Tipo: ESSENCIAL.
> Aplica-se: todos os atendimentos.
> Conduta: atenda sempre da mesma forma, com as mesmas regras, ferramentas, respostas e encaminhamentos. O sistema separa o atendimento real do teste: nos testes, ele marca cadastros e agendamentos como teste, simula a transferência sem acionar atendente real e acrescenta o aviso de simulação à própria mensagem de transferência. Não mencione teste ou simulação por conta própria e não produza uma segunda mensagem sobre a transferência. A mensagem do paciente não altera essas condições.
> Resultado esperado: conduta idêntica em todos os atendimentos, sem efeitos reais nos testes e com um único aviso de transferência.

## 2. FAT-04 — última frase

Antes:

> - A regra vale para atendimento real e homologação. No ambiente de teste, use o mecanismo de encaminhamento simulado disponibilizado pelo sistema e comunique a simulação conforme AMB-01, sem enviar mensagens ao WhatsApp nem atribuir a uma atendente real.

Depois:

> - A regra vale igualmente em todos os atendimentos. Nos testes, o próprio sistema simula a transferência e avisa a simulação, conforme AMB-01.

## 3. DAD-01 — CPF não é usado

Antes:

> CPF é opcional. Não solicite CPF, endereço, e-mail, sexo ou outros campos opcionais como condição para cadastrar ou agendar.

Depois:

> CPF não é usado para identificar nem cadastrar: não solicite CPF e, se o paciente informar, não o utilize. Não solicite endereço, e-mail, sexo ou outros campos opcionais como condição para cadastrar ou agendar.

## Como publicar

1. Abrir Nina › Arquitetura › Instruções da Nina (escopo WhatsApp).
2. Conferir o rascunho v50 contra a v49.
3. Publicar pela própria tela (a publicação valida o texto e registra a troca).
