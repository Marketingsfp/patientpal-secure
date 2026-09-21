# Até duas perguntas de identificação

Regra autorizada em 21/09/2026: permitir até duas perguntas para identificar o atendimento ou profissional de cada solicitação. Se a identificação for resolvida antes, continuar imediatamente. Após duas respostas inconclusivas, encaminhar uma vez, com as perguntas e a dúvida restante no motivo interno.

- A contagem fica no estado JSON da sessão, sem tabela ou coluna nova. Estados antigos com uma pergunta pendente equivalem à primeira tentativa.
- A contagem usa o estado de entrada do turno; reconsultar a base no mesmo turno não consome outra pergunta.
- A segunda pergunta usa as opções atuais ou pede os dados específicos que faltam. Uma busca sem resultado após a primeira pergunta ainda permite a segunda tentativa; falha técnica não vira dúvida do paciente.
- Consulta identificada não recebe pedido de exame para esclarecimento. Datas, horários, cadastro e consentimento de reserva não entram nesse limite.
- `nova_solicitacao` na consulta de conhecimento permite ao modelo sinalizar outra solicitação independente a partir do contexto. Especificar o tipo da mesma USG, escolher uma opção ou corrigir grafia não reinicia o contador.
- Identificação resolvida e nova sessão removem a contagem anterior. Transferências antigas continuam mostrando a regra de uma tentativa que valia na ocasião.

## Publicação

O comportamento completo exige o código e `20260921150000_nina_duas_perguntas_esclarecimento.sql`. A migration altera apenas três trechos das instruções WhatsApp, cria uma nova versão, arquiva a anterior preservando seu conteúdo e deixa o painel interno e rascunhos intactos. É idempotente e recusa textos incompatíveis em vez de sobrescrevê-los. Nenhuma mudança de preços, agenda ou dados clínicos. Reversão exige retornar código e instruções em conjunto.

Em 21/09/2026, a migration foi aplicada pelo editor SQL do Lovable Cloud: WhatsApp global v42 publicada (`733767ac-e41a-4f62-bfc8-0ac3b4074bc7`, MD5 `464634490fdf336265679c319e71d75f`, 50.817 caracteres), vinculada à v41 arquivada. O hash e conteúdo da v41 permaneceram iguais, assim como o painel interno v4. A publicação do código da aplicação no Lovable continua pendente; só o texto das instruções não remove o limite anterior imposto pelo código.

A migration anterior de consolidação continua intacta. Seu gerador reproduz o conteúdo histórico da própria migration, evitando regenerá-la com regras futuras.

## Validação

Testes locais cobrem primeira/segunda pergunta, transferência depois da segunda resposta, resolução em qualquer etapa, continuidade entre turnos, nova solicitação, sessão distinta, buscas sem resultado, consultas versus exames, siglas e identificação exata da USG. Os testes de fluxo executam o núcleo WhatsApp/homologação com modelo e banco simulados e rede proibida.

O script `scripts/test-nina-duas-perguntas.mjs` executa a migration em PostgreSQL descartável e verifica o conteúdo, histórico, rascunhos, diferentes escopos de clínica, idempotência e proteção de publicações posteriores/concorrentes. Não envia mensagens nem cria agendamentos reais.
