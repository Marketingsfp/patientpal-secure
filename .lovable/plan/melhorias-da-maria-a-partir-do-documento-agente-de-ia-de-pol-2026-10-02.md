# Melhorias da Maria a partir do documento "agente de IA de policlínica"

## Situação atual (comparação rápida)
A maior parte do que o documento recomenda a Maria já faz:
- Etapas controladas (saudação, intenção, preferências, dados, confirmação, criação, transferência).
- Não oferece horário sem consultar a agenda; até 3 opções por vez.
- Confirmação em duas etapas: escolher horário não é confirmar; resumo antes de gravar.
- Só diz "agendado" depois que o sistema grava e a leitura confere (bloqueia promessas falsas).
- Proteção contra agendamento duplicado e registro de auditoria por turno.
- Busca com sinônimos e erros de digitação; pergunta antes de transferir.
- Pede dados do paciente só quando precisa.

## O que falta ou está fraco (proposta em etapas)

**Etapa 1 — Horário identificado por código, não por texto (item 13)**
Hoje a vaga escolhida é guardada por data/hora escrita. Passar a guardar um código único da vaga devolvido pela agenda, para não haver confusão entre "14h" de médicos diferentes.

**Etapa 2 — Reagendamento e alteração (itens 15 e 16)**
Hoje há pouco tratamento. Criar fluxo próprio: localizar o agendamento atual, oferecer novas vagas, confirmar, gravar o novo e só então cancelar o antigo. Área crítica — precisa de regra da clínica (prazo mínimo, quem pode remarcar).

**Etapa 3 — Revalidar a vaga logo após o "sim" (item 12)**
Já existe verificação na gravação; garantir mensagem clara quando a vaga foi ocupada nesse meio tempo, oferecendo as próximas opções em vez de erro genérico.

**Etapa 4 — Instruções mais curtas (itens 23 e 24)**
As instruções da Maria estão perto de 60 mil caracteres. Mover para o código regras que já são garantidas por ele e deixar no texto só tom e comportamento. Feito em rascunho, sem publicar.

**Etapa 5 — Conferência final das 10 regras invioláveis (item 26)**
Um teste para cada regra, para que nenhuma mudança futura quebre essas garantias.

## Decisões que preciso de você
- Reagendamento: a Maria pode remarcar sozinha? Com que antecedência mínima?
- Cancelamento pelo WhatsApp é permitido ou sempre vai para a recepção?
- Ordem das etapas: sugiro 3 → 1 → 2 → 5 → 4.

## Fora do escopo
Nada é publicado; instruções publicadas (v59) e rascunho (v60) não mudam sem sua autorização. Vale para todas as clínicas.
