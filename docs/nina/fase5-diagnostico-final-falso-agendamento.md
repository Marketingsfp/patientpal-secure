# FASE 5 — Diagnóstico final e plano de correção

Somente diagnóstico. Nenhum código, prompt, tool, role, fallback ou orquestração foi alterado.

## As três perguntas

1. **O que o paciente pediu?** Informação: dias e horários de atendimento do médico,
   valores em dinheiro e no cartão, e se o atendimento é agendado ou por ordem de chegada.
2. **O que o sistema entendeu?** Que a Nina havia prometido/afirmado um agendamento sem
   ter gravado — ou seja, "falso sucesso" de agendamento.
3. **Qual código provocou a divergência?** `src/lib/whatsapp.server.ts`, função
   `processarMensagem`, bloco "defesa contra falso sucesso" (linhas 1394‑1422), condição
   `podeAgendar && !agendamentoConfirmado && AFIRMA_AGENDAMENTO.test(texto)`.
   Consequência: a resposta informativa correta é descartada e substituída pela frase
   fixa `"Não consegui concluir seu agendamento neste momento. Vou verificar novamente."`

---

## RELATÓRIO

**EXECUÇÃO INVESTIGADA**
`f19ea38d-cc76-452a-9e2f-49f649e35d79` (conversa `59afe69c-60c4-4178-a29d-d756e027333b`,
clínica POLICLINICA MENINO JESUS, `is_teste = true`, canal `test-console`,
08/09/2026 00:28:16 UTC). Casos irmãos: `78e5b278`, `cc4c5fc6`, `9bd5128b`, `331c645c`.

**MENSAGEM DO PACIENTE (lead sintético)**
"E a consulta de clínico geral com [médico] para mim, que tenho 45 anos? Preciso saber
preço no dinheiro e cartão, dias e horários habituais e se é agendada ou por chegada,
antes de decidir a data."

**INTENÇÃO CORRETA ESPERADA**
Informativa (preço + dias/horários + modo de atendimento). Explicitamente pré-decisão:
"antes de decidir a data".

**INTENÇÃO DETECTADA (pelo guard, não pelo modelo)**
Afirmação/promessa de agendamento — via regex sobre o texto de saída, não via
classificação de intenção do pedido.

**ESTADO DA SESSÃO**
`podeAgendar = true` (ferramentas de agenda ativas na clínica);
`agendamentoConfirmado = false`; `jaTinhaAgendamento = false`;
`disponibilidadeConfirmada = false`; `correcaoFalsoSucessoUsada` inicia `false`.
Nenhum estado de agendamento em curso herdado de turno anterior.

**TOOL CALLS**
`consultar_base_conhecimento` ×3 e `buscar_medicos` ×1. Nenhuma ferramenta de
disponibilidade ou de agenda.

**HOUVE `createAppointment`?** Não. A ferramenta `agendar` não foi chamada em nenhuma
das cinco execuções indevidas.

**HOUVE TENTATIVA REAL DE AGENDAMENTO?** Não. `appointment_attempted = false`.
Zero agendamentos com `origem_integracao = 'nina_whatsapp'` no período.

**RESPOSTA ORIGINAL DO MODELO**
Não persistida. O texto intermediário só aparece truncado em 200 caracteres no
`console.warn("[NINA_APPOINTMENT] falso sucesso bloqueado")` (linha 1407) e não é gravado
em `whatsapp_mensagens` nem em `nina_execucoes`. Evidência indireta de que existia texto
válido: na execução `9bd5128b` a saudação original sobreviveu concatenada
("Olá, boa noite! … Como posso te ajudar hoje?") antes da frase de falha.

**TEXTO [SISTEMA]**
`"[SISTEMA] Nenhum agendamento foi gravado. É PROIBIDO dizer que agendou … Se não for
possível, responda apenas: 'Não consegui concluir seu agendamento neste momento. Vou
verificar novamente.'"` (linha 1415)

**FUNÇÃO QUE CRIOU O [SISTEMA]**
`processarMensagem` em `src/lib/whatsapp.server.ts`, bloco das linhas 1399‑1418.

**ROLE UTILIZADA**
`role: "user"` (linha 1413), precedida de um `role: "assistant"` com o texto original
(linha 1411). Ou seja, a instrução corretiva entra no histórico como se fosse fala do
paciente.

**CONDIÇÃO QUE O INSERIU**
`podeAgendar && !agendamentoConfirmado && AFIRMA_AGENDAMENTO.test(texto) &&
!correcaoFalsoSucessoUsada && rodada < MAX_RODADAS - 1`, avaliada apenas quando
`chamadas.length === 0` (o modelo encerrou o turno sem pedir ferramenta).
`AFIRMA_AGENDAMENTO` (linha 1343) casa com `agendada`, `agendado`, `marcada`, `marquei`,
`reservei/reservada`, `agendando`, `agendei`, `(estou|vou|irei) agend…`,
`confirmad[oa] (seu|sua) (consulta|agendamento|horário)`.
Texto informativo legítimo como "a consulta **é agendada** ou por ordem de chegada" e
"pode ser **agendada**" casa com `agendada` — sem nenhuma promessa.

**CONFLICTING_RESULTS**
- origem A: `motivoOperacional()` em `src/lib/nina/telemetria.ts` (linhas 31‑42).
- origem B: o motivo textual e o `nivel` produzidos pelo Reasoning Router do turno.
- campos: `motivoRouter` (texto) e `nivel` (`low|medium|high`) → `route_reason`.
- valores observados: `conflicting_results` (2×), `appointment_tool_required` (2×),
  `direct_knowledge_lookup` (1×).
- função: `motivoOperacional(motivoRouter, nivel)`.
- **Importante:** `conflicting_results` aqui é rótulo de telemetria derivado de heurística
  de texto/nível (`nivel === "high"` cai nesse código por padrão, linha 39). **Não** indica
  conflito real entre duas fontes de dados, e **não** participa da condição do guard.
  O guard ignora `route_reason` por completo — daí três rotas diferentes produzirem o mesmo
  defeito.

**HOUVE REPROCESSAMENTO?** Sim. `continue` na linha 1417 repete a rodada do laço
(`MAX_RODADAS = 6` quando há agenda ativa), uma única vez por turno.

**HOUVE SEGUNDA CHAMADA?** Sim — nova chamada a `ninaAIGateway` (linha 1355) na rodada
seguinte, com o histórico já contaminado pelo `[SISTEMA]` como `user`.

**HOUVE FALLBACK?** Sim. Na rodada seguinte o texto voltou a casar com a regex e sem
`appointment_id`, então a linha 1419‑1421 aplicou o fallback fixo e encerrou o laço.

**FUNÇÃO QUE SUBSTITUIU A RESPOSTA**
A mesma `processarMensagem`, linha 1420: `resposta = "Não consegui concluir seu
agendamento neste momento. Vou verificar novamente."` seguida de `break`. A substituição é
total: o texto do modelo é descartado sem registro.

**MENSAGEM FINAL**
"Não consegui concluir seu agendamento neste momento. Vou verificar novamente."

**CAUSA RAIZ COMPROVADA**
O guard anti-falso-sucesso decide **pela forma do texto de saída** (regex de palavras) e
**não pela evidência da execução**. Ele nunca verifica se houve tentativa de agendamento
(`appointment_attempted`), se alguma ferramenta de agenda foi chamada, se houve
confirmação de disponibilidade, nem qual era a intenção do pedido. Basta a clínica ter
agenda ativa e a resposta conter a palavra "agendada" para uma resposta informativa
correta ser descartada e trocada por uma falha operacional que nunca ocorreu.
Classificação: **erro de código / regra de bloqueio**, não regra de negócio, não falha de
modelo, prompt, catálogo ou ferramenta.

**HIPÓTESES AINDA NÃO COMPROVADAS**
- Qual trecho exato de cada resposta casou com a regex — o texto intermediário não é
  persistido (apenas `console.warn` truncado, não retido).
- Se o `[SISTEMA]` como `role: "user"` piora a segunda rodada (contaminação do histórico)
  ou é neutro. Plausível, sem evidência direta.
- Se o mesmo defeito ocorre em produção. Até 08/09/2026 não há nenhuma ocorrência em
  conversa de produção — o que pode ser baixo volume, não imunidade.
- Se algum outro texto de fallback sofre do mesmo padrão. Não foi auditado.

**QUANTIDADE DE OUTRAS OCORRÊNCIAS**
7 mensagens no total na base (03/09 a 08/09/2026): 5 indevidas (Grupo B, todas do guard),
2 legítimas (Grupo A, falha real de agendamento por dado faltante / erro de identificação,
texto gerado pelo modelo com motivo explícito), 0 inconclusivas. Detalhe em
`docs/nina/fase4-alcance-bug-mensagem-agendamento.md`.

**IMPACTO**
Classe sistêmica, não caso isolado. Atinge qualquer resposta informativa em clínica com
ferramentas de agenda ativas: preço, dias de atendimento, ordem de chegada, busca de
médicos, preparo. Efeitos: resposta correta perdida; paciente recebe informação falsa de
falha; consumo extra de uma chamada de modelo por turno; ruído em métricas de erro
(execução registrada como `success = true`). Não afeta o caminho de agendamento real que
falha de verdade.

**CORREÇÃO RECOMENDADA (não implementada)**
1. Condicionar o guard à evidência da execução, não ao texto: só ativar quando houver
   tentativa/intenção real de agendamento no turno — por exemplo, ferramenta de agenda ou
   de disponibilidade chamada, ou `BOOKING_INTENT_PENDING` legítimo — em vez de apenas
   `podeAgendar`.
2. Restringir a regex a promessas em 1ª pessoa/perfeito (`agendei`, `vou agendar`,
   `sua consulta está agendada`), excluindo usos descritivos ("é agendada", "pode ser
   agendada", "agendada por ordem de chegada").
3. Não substituir a resposta inteira: quando o guard disparar sem evidência de operação,
   preferir remover/reescrever apenas a afirmação indevida, ou cair em pedido de
   esclarecimento, em vez de anunciar falha.
4. Persistir o texto descartado (sanitizado) no trace da execução, para tornar o próximo
   diagnóstico verificável.
5. Trocar a role do `[SISTEMA]` de `user` para `system`, evitando que a instrução interna
   apareça como fala do paciente no histórico.

**Proteção futura avaliada (recomendada, não implementada)**
Regra determinística antes de qualquer mensagem que afirme falha de agendamento:
`resposta afirma falha de agendamento` → `existe appointment_attempted = true?` →
`existe evidência de operação (tool de agenda chamada / resultado registrado)?`
Se não houver, **impedir** que a falha operacional seja apresentada como fato.
Avaliação: é o formato correto, porque inverte o critério de "forma do texto" para
"evidência da execução", que é exatamente a causa raiz. Custo baixo — os dados
(`nomesFerramentasTurno`, `evidenciasFerramentas`, `disponibilidadeConfirmada`,
`agendamentoConfirmado`) já existem no escopo da função. Fica para a fase de correção.

**RISCOS DA CORREÇÃO**
- Afrouxar a regex pode reabrir o falso sucesso original (Nina dizer que agendou sem ter
  agendado) — risco alto, é o motivo de o guard existir. Exige teste de regressão explícito.
- Exigir `appointment_attempted` pode deixar passar promessa feita antes de qualquer
  chamada de ferramenta; por isso a checagem de intenção precisa entrar junto.
- Mexer no laço de rodadas afeta o caminho de agendamento real (Grupo A) e o pré-commit
  de disponibilidade.
- Mudar a role do `[SISTEMA]` altera o histórico enviado ao modelo e pode mudar respostas.
- Área crítica: agenda e atendimento. Mudança deve ser pequena e reversível.

**TESTES DE REGRESSÃO NECESSÁRIOS**
1. Falso sucesso real: modelo diz "agendei sua consulta" sem chamar `agendar` → guard
   ainda bloqueia.
2. Informativo com "agendada": pergunta de preço/dias/ordem de chegada → resposta
   informativa preservada, sem frase de falha.
3. Agendamento real bem-sucedido → `appointment_id` presente, sem interferência do guard.
4. Agendamento real que falha (dado faltante / erro de identificação, casos de 03/09) →
   mensagem de falha continua sendo enviada, com motivo.
5. "consulta agendada por ordem de chegada" e "pode ser agendada" → não disparam o guard.
6. Reprocessamento: no máximo uma correção por turno; sem estouro de `MAX_RODADAS`.
7. Paridade produção × homologação: mesmo cenário, mesmo resultado, só o transporte muda.
8. Telemetria: `route_reason` não influencia a decisão do guard.

---

## Gate final — fato x hipótese

**Fatos comprovados** (evidência em banco e código):
7 ocorrências, 5 indevidas; nenhuma chamou `agendar`; nenhum agendamento criado no
período; o texto final é literal do código, linha 1420; a condição não consulta
`appointment_attempted`; a role do `[SISTEMA]` é `user`; três `route_reason` distintos
produziram o mesmo defeito.

**Hipóteses** (não comprovadas): trecho exato que casou com a regex; efeito de
contaminação do histórico; existência do defeito em produção; outros fallbacks afetados.

Nenhuma culpa é atribuída ao modelo, ao prompt, ao catálogo ou às ferramentas: em todas as
cinco execuções indevidas o modelo consultou o catálogo publicado, não pediu ferramenta de
agenda e produziu texto que foi descartado pelo código antes de chegar ao paciente.

**Resposta à pergunta final:** o código que transformou uma solicitação informativa em
suposta falha de agendamento é o bloco "defesa contra falso sucesso" de
`processarMensagem` em `src/lib/whatsapp.server.ts` (linhas 1394‑1422). A condição foi
ativada porque exige apenas agenda habilitada na clínica e a presença de palavras como
"agendada" no texto, sem qualquer verificação de tentativa real de agendamento. A resposta
correta foi substituída na linha 1420, integralmente e sem registro do texto original.

## Pendências

- Nada foi corrigido. Aguardando autorização explícita para a fase de correção.
- Nenhum fluxo vivo, envio, agendamento ou publicação foi executado nesta fase.
