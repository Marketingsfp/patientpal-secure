# Nina/Maria: agenda do Clínica OS reativada em 05/10/2026

## Decisão e escopo

Solicitação do responsável: a Nina deve consultar a agenda do Clínica OS e
agendar. A decisão substitui a configuração de 29/09/2026 que limitava o
atendimento a informações e encaminhamento à recepção.

Classificação: regra de negócio/configuração operacional, com validação da
integração existente. Escopo: WhatsApp, Nina/Maria e OS ZAP nas três clínicas.
Nina e Maria são o mesmo agente.

## Causa observada

No atendimento de homologação MJ-701, em 05/10 às 09:41, o paciente pediu o
primeiro horário do Dr. Alex no sábado e informou nome e nascimento.
O registro técnico mostrou `pode_agendar: false` e sete ferramentas oferecidas
ao modelo, sem consulta de vagas nem gravação de agendamento.

O modelo consultou o cadastro e os médicos nas duas primeiras rodadas. Na
terceira, destinada à resposta final e sem ferramentas, pediu
`consultar_vagas_agenda`, que não estava disponível. O núcleo encerrou com
`LIMITE_RODADAS: 3 rodadas sem resposta textual`. Não houve consulta efetiva à
agenda nesse turno. O encaminhamento foi consequência do limite do código;
não foi decisão aplicada pelo Jev.

O limite é por mensagem processada, não por quantidade de mensagens do
paciente. Em `src/lib/whatsapp.server.ts`, o limite existente é de três rodadas
sem agendamento habilitado e seis com agendamento habilitado. Aumentar apenas
o número de rodadas não disponibilizaria as ferramentas ausentes.

## Alteração aplicada

Em 05/10/2026 às 09:52:07.98909 (America/Sao_Paulo), foram atualizadas somente
as três linhas existentes de `public.clinica_feature_flags` com a chave
`nina_agenda_ativa`, previamente conferidas como `false`:

| Clínica | Antes | Depois |
| --- | --- | --- |
| Policlínica Menino Jesus | false | true |
| SFP | false | true |
| Consulta Hoje | false | true |

A descrição passou a ser: `Nina consulta vagas e agenda no Clinica OS apos
confirmacao do paciente (reativada em 05/10/2026)`; `updated_at` foi atualizado
pela mesma operação. A atualização foi restrita aos IDs previamente lidos e
às linhas ainda inativas, com `RETURNING` confirmando três resultados.

Leitura posterior confirmou as três linhas ativas. As outras 51 linhas da
tabela mantiveram o mesmo checksum antes/depois:
`c6509216a86bf03898f4290c9ce56c7c` (MD5 da concatenação ordenada por ID de
`row_to_json(f)::text`, separada por quebra de linha).

Nenhuma alteração em prompt publicado, Jev, limites de rodadas, preços,
cadastros, reservas, estrutura do banco ou histórico. A configuração é lida
pelo núcleo compartilhado a cada atendimento; não exigiu implantação de
código para entrar em vigor. O consentimento e a revalidação da vaga antes
de gravar continuam obrigatórios.

## Validação publicada com modelo real

Foi usado o Paciente Teste 06, sessão 31, em homologação, com instrução explícita
para consultar sem cadastrar paciente e sem reservar. Mensagem às 09:55:
consulta de Cardiologia, Dr. Alex Louza Macedo, sábado 10/10/2026 de manhã.

Às 09:56, a Nina apresentou 08:00 como primeira vaga e 08:10/08:20 como
alternativas. A auditoria confirmou:

- Fonte da consulta: Clínica OS.
- Modelo `google/gemini-3.8-flash`, prompt publicado 64.
- `pode_agendar: true`, 16 ferramentas disponíveis, incluindo
  `consultar_disponibilidade`, `selecionar_horario` e `agendar`.
- Rodada 1: `consultar_cadastro` e `buscar_medicos`, concluídas.
- Rodada 2: `consultar_disponibilidade` para 10/10/2026 de manhã, concluída.
- Rodada 3: resposta textual com as vagas, sem encaminhamento.
- Nenhuma chamada a `agendar` ou à criação de paciente nesse teste.
- Fingerprint do turno igual ao servidor consultado:
  `sha256:c4ef87c832df54caf3d44bcf7163a13d7d69e7ccde6853ab64f9c3693c1a10e3`.

A sessão foi resolvida/reiniciada às 10:10; o histórico de homologação foi
preservado. Nenhuma mensagem foi enviada ao WhatsApp real e nenhuma
transferência operacional foi realizada.

O fingerprint identifica os fontes cobertos pelo build, não comprova um SHA
GitHub implantado. O teste confirma a consulta publicada, não uma reserva
completa pelo WhatsApp real nem disponibilidade futura dos mesmos horários.

## Testes locais

Base de trabalho: `origin/main` em
`f61eaba0d53ef84d3047ec9553d953d716734e22`, atualizada antes da análise e edição.
Checkout isolado preservou as alterações locais de outros trabalhos.

Na primeira execução, dez casos de `agendamento-resumo-runtime.test.ts`
falharam por inconsistência da simulação: a entrada dizia apenas “Tem vagas?”
enquanto o modelo simulado insistia em escolher horário e gravar. O gate
preservava essa pergunta para o modelo responder, e a simulação repetia as
mesmas ações até esgotar as rodadas. A entrada dos cenários `escolha_*` passou
a declarar a escolha de 10:20. A comparação do resumo completo passou a
aceitar as quebras de parágrafo do acabamento mobile, preservando a igualdade
de todo o conteúdo. Não foi alterado código de atendimento para passar testes.

Resultado final: 335 testes passaram em nove arquivos, zero falhas, 1.735
asserções. Banco, modelo e serviços externos são simulados nesses testes.
Cobertura executada:

- `agendamento-resumo-runtime.test.ts`
- `confirmacao-agendamento.test.ts`
- `agendamento-memoria-paridade.test.ts`
- `consulta-agenda-contexto-fluxo.test.ts`
- `agenda-sem-vagas-fluxo.test.ts`
- `perguntas-independentes-fluxo.test.ts`
- `cadastro-paciente-gate.test.ts`
- `cadastro-paciente-executor.test.ts`
- `agendamento-escolha.test.ts`

Incluem escolha com nome/nascimento, cadastro antes do resumo, proibição de
reserva no mesmo lote da escolha, aceite posterior, confirmação comprovada,
memória de sessão, perguntas independentes e os dois ambientes.

`bunx --no-install tsc --noEmit` concluiu sem erros. `git diff --check` passou.

## Limites e reversão

O agendamento ficou habilitado no sistema publicado; a gravação final foi
validada com serviços simulados. Não foi criada reserva real para validar a
mudança. Homologação continua usando o núcleo compartilhado com transporte e
encaminhamento operacional isolados.

Se uma futura decisão exigir desativação, a mesma chave existente pode voltar
a `false`, com nova descrição/data que registrem essa decisão. Isso retira as
ferramentas de agenda e retorna ao limite de três rodadas. Não reescrever
auditoria nem restaurar timestamps históricos.

O commit deste registro documenta uma configuração já aplicada e corrige os
testes; seu push não é evidência de implantação no Lovable.
