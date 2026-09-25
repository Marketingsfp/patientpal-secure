# Bateria por profissional nos testes de carga

Data: 25/09/2026. Modo novo da tela **Homologação → Testes de carga e alto volume**,
ao lado de "Planejar com Sol" e "Manual". Reproduz as simulações manuais de pacientes
(uma consulta por médico, perfis variados) sem depender de alguém conduzindo a conversa.

## O que muda em relação aos outros modos

- **Mensagens adaptativas.** Nos outros modos as mensagens são fixas, escritas antes do
  teste. Aqui a Luna faz o papel do paciente: a cada passo lê a conversa e escreve a próxima
  mensagem, seguindo um objetivo que a Nina não vê (consulta, profissional, perfil e dados
  fictícios "Simulação Teste NN").
- **Cenários vêm do catálogo publicado**, lidos no servidor: cada bloco `CONSULTA ...` de
  cada profissional escolhido × perfis de paciente. Exames e procedimentos ficam fora.
- **Previsão por cenário:** agendar (hora marcada com vaga nos próximos 60 dias), orientar
  ordem de chegada, sem vaga/encaminhar, encaminhar (catálogo manda) ou indefinido.
- **Verificação e devolução.** No fim de cada cenário o executor lê o que ficou registrado
  (respostas, agendamento de teste, encaminhamento, erros) e avalia; depois devolve a vaga.

## Regras preservadas

- **Reinício só no início da carga** (`reset-somente-pelo-botao.test.ts`): cada cenário usa um
  lead próprio, então uma bateria tem no máximo 10 cenários. Os 41 médicos cabem em lotes; a
  tela sugere o próximo lote ainda não testado.
- A primeira mensagem de cada lead espera 15 s depois do reinício (enviar logo após o reset
  travou a Nina em 24/09/2026).
- Execução no servidor (`carga-v5-servidor`), um passo por requisição, sem depender da aba.
- Terra, biblioteca de cenários, avaliador Sol e console da homologação não mudaram.

## Agenda real

A ferramenta de agendamento da Nina grava por cima do próprio registro da vaga DISPONÍVEL
(marca `[TESTE NINA]`, `is_mock_data`, `origem_integracao = 'nina_homologacao'`,
`id_externo = <conversa>|<médico>|<início>`). A bateria nunca apaga esse registro: devolve a
vaga com os campos que o agendamento preencheu (`carga-bateria.server.ts`, `VAGA_LIVRE`).

- Devolução no fim de cada cenário; se alguma vaga não voltar, o teste para.
- Encerrar o teste, estourar prazo ou orçamento também devolve as vagas.
- O relatório mostra vagas ainda ocupadas e o botão "Devolver vagas" (teste encerrado).

## Passos no plano

Cada cenário gera `turnos` passos de mensagem, um passo de verificação e um de devolução.
Passos de mensagem depois do fim da conversa (agendado, encaminhado, erro técnico, sem
progresso) são registrados como `dispensado`, sem chamar a Nina. O resultado estruturado de
cada passo fica em `nina_teste_carga_amostras.resultado` (migration `20260925210000`).

## Limites e custo

- Até 10 cenários por disparo, 4 a 12 mensagens do paciente por cenário, conversas
  simultâneas configuráveis (padrão 3).
- O orçamento de tokens do teste soma Nina e Luna. O prazo total é calculado pelas rodadas
  (cenários ÷ conversas simultâneas × mensagens × 150 s + 10 min), com teto de 4 h.
- Custo real ainda não medido: rodar um piloto pequeno antes de lotes completos.
