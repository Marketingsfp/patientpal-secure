# Diagnóstico de agendamento da Nina — 21/09/2026

## Correção implementada após autorização

As causas abaixo foram tratadas no código local em 21/09/2026. Esta seção descreve a implementação; as demais seções preservam o diagnóstico e as evidências da rodada original.

- A pesquisa de consulta/procedimento permanece vinculada à mesma sessão. Antes de oferecer vagas para reserva, o executor relê o catálogo publicado e associa o atendimento ao profissional correto da agenda. Consultas e procedimentos permanecem separados, inclusive Cardiologia e Cardiologia Infantil. As pesquisas feitas por `buscar_medicos` e `buscar_procedimentos` também preservam a referência.
- Confirmações como “Sim, confirmo.” e confirmações completas com médico, data e horário passam a ser reconhecidas. Dados citados precisam corresponder à vaga apresentada. Recusas, condições, dúvidas e referências divergentes não autorizam a reserva.
- Reconsultar ou selecionar novamente a mesma vaga preserva a confirmação. A coleta de nome/nascimento não reinicia a seleção; uma repetição do aceite também não vira nome de paciente. Dados explicitamente informados antes do aceite podem ser aproveitados na conferência cadastral.
- Na verificação de horário, uma vaga real livre prevalece sobre a escala auxiliar. Escala vazia não significa que o profissional não atende. As alternativas reais também são preservadas.
- Falhas operacionais de seleção, cadastro ou agenda recebem motivo próprio para a atendente. Não são rotuladas como ausência na base ou agenda sem vagas. O tratamento específico de SFP, ambiguidade e vaga efetivamente perdida foi mantido.

Validação local: 366 testes passaram, incluindo execução do fluxo real com banco e modelo simulados, serialização do estado entre mensagens, uma única gravação, negativa de aceite divergente, proteção por clínica/sessão, reserva perdida, SFP e encaminhamento por falha operacional. A checagem de tipos passou. O lint dos arquivos de produção alterados, sem a regra de formatação herdada, não apresentou erros (48 avisos de `any`). `git diff --check` passou.

Compilação completa: passou, incluindo cliente, servidor e empacotamento final. O bloqueio inicial era uma comparação de caminhos do plugin `@lovable.dev/mcp-js` no Windows. O adaptador local `scripts/mcp-vite-plugin.ts` normaliza a raiz somente na cópia de configuração entregue a esse plugin. A configuração compartilhada, as dependências instaladas e a proteção contra geração de rotas fora do projeto foram preservadas; essas duas proteções também foram verificadas diretamente. A checagem de tipos foi repetida após esse ajuste e passou. Permanecem avisos de dependências e tamanho de pacotes, sem impedir a compilação.

Publicação e validação online: pendentes. As mudanças ainda não foram publicadas no Lovable, e nenhuma nova reserva real ou simulação online foi criada nesta etapa. Os testes locais não substituem a repetição dos casos na versão publicada.

## Escopo e resultado

Testes manuais pelo Google Chrome, na homologação da Policlínica Menino Jesus, usando Paciente Teste 10 e dados fictícios. Rodada iniciada às 13:07 e encerrada às 14:02 (America/Sao_Paulo). O usuário pediu para interromper a rodada e investigar após a 12ª simulação já estar em andamento. As sete consultas restantes não foram testadas.

Foram concluídas 12 simulações, com 12 encaminhamentos e nenhum agendamento confirmado. Em angiologia, o encaminhamento foi solicitado pelo paciente de teste após repetição de confirmações; nos demais casos ocorreu por iniciativa da Nina/sistema. Cada sessão foi encerrada pelo botão Resolver / Reiniciar teste; a última também foi reiniciada. Nenhuma mensagem foi enviada ao WhatsApp real.

Os registros consultados mostram prompt v44, modelo `google/gemini-3.7-flash` e núcleo `nina-resposta-direta-20260916-v1`. O contexto do caso de Rafael Barros registrava `pode_agendar: true`. A homologação está autorizada a usar a agenda da clínica com dados de teste. O bloqueio observado não é uma proibição geral de agendar em homologação.

Classificação: erros de lógica e continuidade de estado no agendamento, com mensagens de falha inadequadas. Não foi demonstrada falha de login ou de RLS.

## 1. Horários guardados sem a consulta associada

No caso de mastologia, a Nina consultou corretamente Rafael Barros e ofereceu 21/09/2026 às 14:45. No início da mensagem em que o paciente escolheu esse horário, o estado registrado tinha:

```json
{
  "etapa": "WAITING_SLOT_SELECTION",
  "procedimento": null,
  "especialidade": "MASTOLOGIA",
  "profissional": "RAFAEL SOARES MONTEIRO DE BARROS",
  "vaga": {
    "data": "2026-09-21",
    "hora": "14:45",
    "inicio": "2026-09-21T14:45:00-03:00",
    "fim": "2026-09-21T15:00:00-03:00",
    "modalidade": "hora_marcada",
    "procedimento": null
  },
  "confirmacao_final": null,
  "pode_agendar": true
}
```

A chamada `selecionar_horario` usou o médico, início e fim corretos. O retorno foi:

> ACTION_NOT_AUTHORIZED — Escolha uma vaga e um procedimento consultados na agenda desta sessão.

Uma nova consulta de disponibilidade retornou o mesmo horário livre. A segunda tentativa de seleção falhou com a mesma mensagem. Portanto, nesse ponto o bloqueio era a opção incompleta, não a inexistência da vaga.

O código confirma essa exigência em `src/lib/nina/paciente-tools.server.ts:1147`: a seleção falha quando não encontra a opção ou quando `vaga.procedimento` está vazio. Em `guardarOpcoes` (linha 398), o procedimento depende da seleção revalidada do turno ou do estado anterior do mesmo médico. O contexto de agenda é recriado em `src/lib/whatsapp.server.ts:1255` e a seleção revalidada é preenchida após nova consulta à base (linha 1872). Essa dependência permite perder a consulta ao prosseguir para a agenda em outro turno, mesmo com a especialidade reconhecida na conversa.

O mesmo estado incompleto foi confirmado no registro de cardiologia com Antonio Cobucci: opções presentes, `procedimento: null`, ausência de vaga validada e posterior falha de identificação/agendamento. Nessa conversa, um resumo em linguagem natural foi mostrado ao paciente sem que a seleção estivesse validada no estado interno.

Recomendação: manter o atendimento escolhido como dado estruturado da sessão, revalidá-lo sem perdê-lo a cada turno e associá-lo a cada opção antes de oferecê-la. O resumo de confirmação deve depender de uma seleção realmente validada. Não remover a proteção que exige consulta e vaga definidas.

## 2. Confirmações naturais rejeitadas

A função `ehConfirmacaoDeAgendamento`, em `src/lib/nina/identificacao-gate.server.ts:45`, aceita uma lista fechada de frases exatas e rejeita textos acima de 40 caracteres. A função atual foi executada isoladamente, sem chamar serviços ou alterar dados:

| Mensagem | Resultado |
|---|---|
| Sim | Reconhecida |
| Confirmo | Reconhecida |
| Sim, confirmo. | Não reconhecida |
| Sim, confirmo o agendamento com esses dados. | Não reconhecida |
| Sim, confirmo todos esses dados para concluir o agendamento. | Não reconhecida |

Essas formas de confirmação foram usadas nos testes. Quando o aceite não é registrado, o cadastro permanece bloqueado por `cadastroAutorizado`, que exige atendimento definido e consentimento da vaga. Os registros mostraram `ACTION_NOT_AUTHORIZED` em `identificar_paciente` e, em cardiologia, `PATIENT_NOT_VERIFIED` em `agendar`. São consequências do fluxo não validado; não comprovam proibição de cadastrar um paciente de homologação.

Recomendação: reconhecer confirmações naturais no contexto do último resumo entregue, preservando médico, consulta, data e horário. Perguntas, recusas e pedidos de mudança devem continuar fora do aceite. Não liberar agendamento apenas porque o modelo afirma que o paciente confirmou.

### 2.1. Por que o pedido de confirmação se repete

Investigação complementar solicitada pelo usuário: o ciclo foi comprovado nos registros de angiologia, sessão 25, com Paulo Guilherme, para 25/09/2026 às 08:30.

| Horário em 21/09 | Acontecimento |
|---|---|
| 13:10 | Nina apresentou o resumo da consulta e pediu confirmação. O paciente respondeu: “Sim, confirmo a consulta com o Dr. Paulo Guilherme no dia 25/09 às 08:30.” |
| 13:11 | Nina pediu nome completo e nascimento. |
| 13:13 | Paciente informou nome e nascimento fictícios. |
| 13:14 | Nina repetiu o resumo e o pedido de confirmação. O paciente respondeu: “Sim, confirmo.” |
| 13:15 | O registro ainda indicava `WAITING_FINAL_CONFIRMATION`, `intencao_confirmada: false` e `confirmacao_final.aceita: false`. A identificação foi recusada e o mesmo horário foi selecionado novamente, gerando outra cópia do resumo. |
| 13:16 | Após uma nova confirmação detalhada, o resumo voltou a ser exibido. |

A sequência técnica das 13:15 é conclusiva:

1. A frase “Sim, confirmo.” não passa pelo reconhecimento de aceite da função `ehConfirmacaoDeAgendamento`. Por isso, o aceite não é registrado no estado da sessão.
2. O modelo recebe o histórico com as confirmações e os dados do paciente e tenta `identificar_paciente`. A ferramenta recusa com `ACTION_NOT_AUTHORIZED`: “Defina o atendimento e aguarde a confirmação da vaga antes de cadastrar.”
3. Em seguida, o modelo chama `selecionar_horario` para o mesmo médico e o mesmo intervalo 08:30–08:45. Essa chamada é concluída com sucesso.
4. `selecionarVagaValidada` (`src/lib/nina/agendamento-escolha.ts:122`) limpa e recria a escolha, mantendo uma nova confirmação com `aceita: false`.
5. O servidor (`src/lib/whatsapp.server.ts:2190`) devolve automaticamente o resumo dessa seleção e interrompe as demais ações até outro aceite. O paciente vê novamente a pergunta que já respondeu.

O resumo entregue antes de “Sim, confirmo.” era exatamente igual ao resumo guardado na sessão, após a normalização usada pelo código. Portanto, nesse episódio, a causa não foi divergência no texto do resumo. A consulta, o médico e a vaga também estavam preenchidos; este ciclo é independente da perda de procedimento observada em outros testes.

Não havia agendamento concluído: `agendamento_id` estava vazio e `agendamento_confirmado` era falso. Houve confirmação explícita do paciente, mas ela não foi registrada como aceite pelo sistema. A repetição não comprova criação de reservas duplicadas.

Correção recomendada: registrar confirmações naturais vinculadas à seleção válida; impedir que a seleção repetida do mesmo horário reinicie a etapa; preservar o aceite durante a coleta de dados faltantes; solicitar nova confirmação quando houver mudança nos dados do agendamento. A confirmação de sucesso ao paciente deve continuar dependendo da gravação verificada na agenda.

Rastro: execução `a63c6233-21c8-4cf1-a416-5d47f0c541cf`, trace `853e693f-4567-469d-883c-daba9f691342`, sessão técnica `b9f39549-af70-4b9d-8f23-3f6fc8984580`. Esta investigação complementar não alterou a aplicação nem iniciou novas simulações.

## 3. Rafael Barros às 14:45: falso resultado de indisponibilidade

O usuário estava correto: a vaga existia e estava livre. Foram reunidas duas evidências independentes:

1. No próprio turno, `consultar_disponibilidade` retornou a vaga 14:45–15:00 para Rafael Barros, entre outras opções livres.
2. Consulta SQL somente de leitura confirmou a linha livre em `agendamentos` e ausência de registros na escala auxiliar `medico_disponibilidades` desse médico/clínica.

Identificação da vaga:

- Médico: `ee7420ca-614d-487f-b638-06e0ab3856b1`.
- Agenda: `0ccbbf08-e4c2-44e4-886c-7f97bcb8d4b0`.
- Vaga: `3274fea5-ad60-454b-9022-c3a32f484a60`.
- Início: `2026-09-21T14:45:00-03:00`.
- Fim: `2026-09-21T15:00:00-03:00`.
- Livre: `true`.
- Escala auxiliar: nenhuma linha encontrada.

Após as duas recusas de seleção, a Nina chamou `verificar_horario`. Essa ferramenta retornou `NAO_ATENDE_NO_DIA`, com `disponivel: false` e alternativas vazias. O servidor gerou então `AGENDA_SEM_VAGAS` e encaminhou automaticamente.

O erro está na precedência das fontes. `medicoAtendeNoDia` (`src/lib/nina/paciente-tools.server.ts:569`) considera apenas `medico_disponibilidades`. Se a tabela não tem linhas, retorna falso. Em `verificar_horario` (linha 1494 em diante), esse falso prevalece mesmo depois de consultar as vagas reais de `agendamentos`, descarta as alternativas e declara que o médico não atende naquele dia. `src/lib/nina/agenda-sem-vagas.ts` transforma esse resultado em encaminhamento por ausência de vagas.

Recomendação: a existência de uma vaga livre na agenda real deve prevalecer. Ausência de escala auxiliar significa falta desse cadastro, não ausência de atendimento. Não preencher nem mudar a escala da clínica automaticamente para esconder esse erro de lógica.

Rastro do caso: protocolo MJ-128, sessão 33, execução `33d652d7-f86a-4533-925e-d58461995a7a`, trace `59c14fdb-8258-4bde-be75-b0eeca2cdbe8`. Mensagem final: `76946863-6abb-4b95-8261-99ad33a51f38`.

## Resultados por consulta

Todos os horários abaixo foram oferecidos pela Nina e escolhidos pelo paciente de teste; não são reservas concluídas.

| Nº | Consulta | Profissional | Horário escolhido | Sessão / protocolo | Desfecho |
|---|---|---|---|---|---|
| 1 | Angiologia | Paulo Guilherme | 25/09 08:30 | 25 / MJ-120 | Repetiu confirmação; identificação bloqueada. Paciente pediu encaminhamento para encerrar o ciclo. |
| 2 | Cardiologia | Antonio Cobucci | 24/09 08:20 | 26 / MJ-121 | Encaminhou após confirmação; ACTION_NOT_AUTHORIZED e PATIENT_NOT_VERIFIED. |
| 3 | Cardiologia infantil | Alex Louza | 26/09 08:30 | 27 / MJ-122 | Encaminhou após confirmação; identificação e seleção com ACTION_NOT_AUTHORIZED. |
| 4 | Clínico geral | Sandro Prinscewal | Não ofereceu vaga | 28 / MJ-123 | Vínculo de agenda não resolvido para o médico. |
| 5 | Dermatologia | Raisa Moura | 23/09 08:15 | 29 / MJ-124 | Seleção recusada duas vezes; depois alegou falta de vagas. |
| 6 | Endocrinologia | Felipe Moura | 22/09 08:30 | 30 / MJ-125 | Seleção recusada; motivo interno passou a dizer base não encontrada. |
| 7 | Gastroenterologia | Diogo Del Cima | 21/09 14:30 | 31 / MJ-126 | Identificação recusada após confirmação; motivo interno base não encontrada. |
| 8 | Ginecologia | Marcilio Quintão | 22/09 09:00 | 32 / MJ-127 | Seleção recusada; motivo interno base não encontrada. |
| 9 | Mastologia | Rafael Barros | 21/09 14:45 | 33 / MJ-128 | Opção sem consulta associada; depois escala auxiliar vazia gerou falso sem vagas. |
| 10 | Neurologia | Anderson Eloy | 25/09 08:20 | 34 / MJ-129 | Seleção recusada com ACTION_NOT_AUTHORIZED. |
| 11 | Nutrição | Mariana Portugal | 23/09 10:30 | 35 / MJ-130 | Seleção recusada com ACTION_NOT_AUTHORIZED. |
| 12 | Obstetrícia | Sérgio Satoshi | 22/09 08:40 | 36 / MJ-131 | Encaminhou; motivo interno falha operacional ao selecionar horário. |

Não testadas após a interrupção solicitada: oftalmologia, ortopedia, otorrinolaringologia, pediatria, psicologia, avaliação odontológica e consulta + preventivo.

## Outras observações e limites

- A consulta inicial à base funcionou nos 12 casos. Identificar a especialidade e responder sobre ela não garante que a consulta tenha sido guardada corretamente no fluxo de agendamento.
- A Nina distinguiu ginecologia sem preventivo, manteve o critério de 40 kg em gastroenterologia e explicou o pré-agendamento por ordem de chegada em neurologia. Em consultas de um único profissional, perguntou pela data.
- Em clínico geral, informou seis profissionais, enquanto a listagem do catálogo contém onze. O motivo desse limite não foi aprofundado nesta investigação.
- Houve diferenças entre os dias/horários habituais informados pelo catálogo e vagas oferecidas pela agenda. Isso não demonstra, isoladamente, vaga inválida: a agenda real é a fonte para agendar. Nenhum horário da clínica foi alterado nesta investigação.
- Alguns encaminhamentos foram rotulados como “base não encontrada” mesmo após a consulta ter sido apresentada. A mensagem interna precisa distinguir falha operacional, problema de vínculo e indisponibilidade comprovada.
- A homologação usou dados de teste, mas a disponibilidade consultada vem da agenda real. O código de consulta não depende de uma agenda fictícia separada.
- Os registros de homologação não comprovam que todas as conversas reais falham; porém os trechos examinados são compartilhados com o fluxo real e merecem correção e validação conjunta.
- Os ajustes de código da tarefa anterior ainda dependiam de publicação no Lovable. Este relatório registra o comportamento efetivamente observado e os registros do servidor durante a rodada, sem presumir que todos os commits locais estavam publicados.
- Não foram alterados código da aplicação, catálogo, permissões, escala médica ou vagas. O editor SQL foi restaurado ao conteúdo anterior, sem executar esse conteúdo.

## Ordem recomendada da correção

1. Preservar o vínculo entre consulta escolhida, médico e opções de vaga em todos os turnos; impedir resumo de confirmação sem seleção validada.
2. Aceitar confirmações naturais com referência ao resumo correto, sem permitir troca silenciosa da vaga.
3. Fazer a vaga real prevalecer sobre a ausência de escala auxiliar na verificação de horário.
4. Informar o motivo verdadeiro no encaminhamento interno, sem converter falha técnica em base ausente ou agenda cheia.
5. Após publicação, repetir os casos de angiologia, cardiologia e Rafael Barros, verificar a reserva criada na agenda e limpar os registros de teste pelo reinício oficial. Só então retomar as sete consultas restantes.
