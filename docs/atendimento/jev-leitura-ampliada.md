# JEV: leitura ampliada em observação

Base: `2e859c781`, origin/main conferida em 04/10/2026.
Escopo: atendimento WhatsApp/Nina/OS ZAP. Implementação da primeira etapa
recomendada e aprovada: registrar e revisar antes de aplicar novas ações.

## O que foi implementado

1. Pedidos independentes no mesmo turno: preço, pagamento, profissionais,
   preparo, documentos, localização, funcionamento, horário habitual,
   disponibilidade, agendamento, cancelamento e remarcação.
2. Sinais separados para escala habitual e consulta de vagas; ambos podem
   estar presentes se o paciente perguntar as duas coisas.
3. Alcance do aceite: consultar agenda, aceitar resumo específico, aceitar
   com condição, recusar, ausência de autorização e ambiguidade.
4. Correção de profissional, especialidade, procedimento, data, período,
   paciente ou vários campos. Não extrai nem grava um novo cadastro.

As perguntas adicionais entram na mesma chamada das fases 1/2, somente se
a fase 1 estiver habilitada. A configuração é a mesma para real/homologação.
Não há novo banco, migration ou consulta adicional ao modelo. Há 14 perguntas
extras; isso aumenta conteúdo/tokenização e pode afetar custo, latência e as
respostas do próprio modelo, mesmo compartilhando a chamada. O limite atual
de 4 segundos e a ausência de repetição automática permanecem.

As respostas antigas seguem separadas das observações antes de entrar em
`intencaoAplicavel` e nas regras de encaminhamento. Uma observação ausente,
inválida, sem confiança, infinita ou fora de 0–1 não invalida respostas antigas
válidas. Se a chamada inteira falhar, vale o fallback atual de sem decisão.

## Auditoria e interface

O registro da fase 1 guarda `_observacao_intencao` em `respostas`, versão
`intencoes-v1`, modo `observacao`, `aplicada: false`. Não duplica essa leitura
na fase 2 nem a mistura com a contagem de falhas em `_nina`.
O JSON `perguntas` registra também o contexto enviado, início do ciclo e a
intenção operacional aplicada. Registros anteriores não são alterados.

A tabela apresenta **Leitura ampliada · em observação**. Ao expandir:

- pedidos apontados e pontuações;
- horário habitual e vagas separados;
- alcance do aceite e tipo de correção;
- ausência de dados e baixa certeza indicadas explicitamente.

As faixas de apresentação (até 20% não indicado; entre 20% e 80% incerto;
a partir de 80% indicado) são apenas convenções de leitura. Não são limites
de ação ou probabilidades calibradas. A coluna Aplicada continua se referindo
à decisão original, e a observação informa que não foi aplicada ao atendimento.

## Validação e limites

Testes automatizados cobrem parsing, vários pedidos, ausência/invalidade das
observações, manutenção dos resultados originais, persistência real/teste,
uma chamada sem repetição, timeout e não duplicação na transferência.
As funções reais `perguntarJev`/`registrarDecisaoJev` são executadas com
transporte simulado. Não são testes de acerto do modelo real.

`scripts/check-jev-auditoria.mjs` valida a página React com dados simulados,
incluindo múltiplos pedidos, incerteza, sinais ausentes, observação não aplicada,
texto expandido e tela pequena.

## Roteiro para conferir com o modelo real após publicação

Repetir em homologação e real com mesma versão, flags, estado, fontes e
histórico. Atendimento real requer teste controlado autorizado; não enviar
mensagens a pacientes reais para validar o recurso.

| Contexto / mensagem | Leitura esperada para revisão |
| --- | --- |
| Sessão nova: “Quanto custa o cardiologista e quais dias ele atende?” | Preço + horários habituais; sem autorização para confirmar reserva. |
| “Qual o preço, o preparo e o endereço?” | Três pedidos independentes. |
| “Que dias o Alex atende?” | Escala habitual; não presumir pedido de vaga. |
| “O Alex tem vaga amanhã?” | Consulta de disponibilidade. |
| “Quais dias atende e tem vaga na sexta?” | Horário habitual + disponibilidade. |
| Após “Quer que eu verifique vagas?”: “Sim” | Aceite de consulta de agenda. |
| Após resumo específico e pergunta de confirmação, na etapa final: “Sim” | Aceite do resumo, apenas observado; operação ainda depende das regras atuais. |
| Após resumo: “Sim, mas só depois das 15h” | Aceite condicional; não aceitar exatamente o resumo. |
| Sessão nova: “Sim” | Ambiguidade, sem presumir confirmação. |
| Após escolha de cardiologia: “Não é cardio, é neuro” | Correção de especialidade. |
| Após lista de médicos, sem escolha anterior: “Vou fazer com o Alex” | Primeira escolha, não correção. |
| Após escolha de Alex: “Na verdade prefiro a Rosângela” | Correção do profissional. |
| Após escolha inicial: “Pode ser terça de tarde, não segunda de manhã” | Correção de vários campos, não remarcação de agendamento existente. |
| Duas conversas simultâneas, uma com “sim” e outra com correção | Cada observação permanece ligada à sua conversa, mensagem e contexto. |
| Repetição de mensagem e retomada após reiniciar sessão | Usar somente o ciclo atual; não herdar uma confirmação de ciclo anterior. |

Registrar revisão humana com acertos, erros e casos inconclusivos, além de
latência e falhas da chamada. Só depois desenhar e validar a aplicação das
novas classificações ao fluxo. Nenhuma confirmação do JEV substitui base
oficial, agenda, identificação do paciente ou confirmação do sistema.

Publicação no Lovable e precisão do modelo real continuam pendentes de
verificação. GitHub e testes simulados não demonstram paridade publicada.
