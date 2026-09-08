# FASE 2 — Onde a resposta informativa foi substituída

Mesma execução da Fase 1. Nada foi corrigido.

## Gate de entrada (confirmado)

| Item | Valor |
|---|---|
| conversation_id | `8bf9f63a-3c8d-4237-affb-a7e53fae6d55` (caso base) e `59afe69c-60c4-4178-a29d-d756e027333b` |
| message_id | `dbef3440-a34a-4617-a245-35a864d3e9df` (caso base) |
| execucao_id | `78e5b278-8b06-4bd0-9b9c-23e9f6553a87` |
| trace_id | `ea76f318-072d-43e0-80a1-76827546be0d` |
| session_id | `65f47947-3a98-40b1-90b4-aabe1abc7720` |
| timestamp | 2026-09-08 00:24:38 UTC |
| ambiente | homologação (`is_teste = true`), prompt publicado v3 (`9456e5ce…`) |

## Fluxo reconstruído (execução 78e5b278)

| # | Etapa | Função | Entrada | Saída | Condição / próximo passo |
|---|---|---|---|---|---|
| 1 | mensagem do paciente | `message.inbound` | "…quer uma consulta de angiologia com Paulo Guilherme. Pode me informar os dias e horários, o preço em dinheiro e no cartão…" | texto do turno | segue |
| 2 | intenção | leitura de intenção no prompt | mensagem | "agendamento, valor, consulta"; múltiplas perguntas | ativa `podeAgendar` |
| 3 | estado da sessão | `salvarFluxoEstado` / saudação | primeira mensagem da sessão | `saudacao_obrigatoria = true`, `greeting_completed = false`, `agendamento_confirmado = false` | segue |
| 4 | contexto | `prompt.compose` / `instructions.published` | prompt v3 (módulos Transferência, Conhecimento) | 8.530 tokens de entrada | chamada #1 |
| 5 | **chamada #1** | `ninaAIGateway` (rodada 0) | contexto acima | **nenhum texto — tool_call `consultar_base_conhecimento{angiologia, Paulo Guilherme}`** | executa ferramenta |
| 6 | catálogo | `consultar_base_conhecimento` | termos `angiologia`, médico `Paulo Guilherme` | catálogo PUBLICADO: Paulo Guilherme + procedimento; `knowledgeStatus: found` | chamada #2 |
| 7 | **chamada #2** | `ninaAIGateway` (rodada 1) | 10.106 tokens | **resposta informativa correta** (ver abaixo) | validação pós‑modelo |
| 8 | validação pós‑modelo | guard "defesa contra falso sucesso", `whatsapp.server.ts:1399‑1418` | texto da rodada 1 | descarta o texto e injeta `[SISTEMA] Nenhum agendamento foi gravado…` como `role: "user"` | força nova rodada |
| 9 | **chamada #3 (reprocessamento)** | `ninaAIGateway` (rodada 2) | 10.318 tokens (com o `[SISTEMA]`) | `"Não consegui concluir seu agendamento neste momento. Vou verificar novamente."` | vira `resposta` |
| 10 | confidence engine | `confidence.decision` | resposta acima | score 100, HIGH, ALLOW, modo shadow, etapa A | não interferiu |
| 11 | saudação obrigatória | `aplicarSaudacaoObrigatoria` (`:1702`) | resposta acima | prefixo "Olá, boa noite! …Como posso te ajudar hoje?" | mensagem final |
| 12 | envio | `message.outbound` | 183 caracteres | mensagem gravada em `whatsapp_mensagens` | fim |

## Original x final (lado a lado)

**RESPOSTA ORIGINAL DO MODELO (chamada #2 — correta):**

> Olá, boa noite! 😊 Sou a Nina, assistente virtual da POLICLINICA MENINO JESUS.
>
> O médico Paulo Guilherme atende Angiologia às sextas-feiras a partir das 08h00, com atendimento **agendado** e chegada permitida até as 10h00 (idade mínima de 18 anos). A consulta custa R$ 120,00 em dinheiro ou R$ 145,00 no cartão.
>
> Você gostaria que eu verificasse a disponibilidade para realizar o agendamento?

**MENSAGEM FINAL ENVIADA:**

> Olá, boa noite! 😊 Sou a Nina, assistente virtual da POLICLINICA MENINO JESUS. Como posso te ajudar hoje? Não consegui concluir seu agendamento neste momento. Vou verificar novamente.

**Primeira função que descartou a resposta original:** o bloco de "defesa contra
falso sucesso" em `src/lib/whatsapp.server.ts`, linhas 1399‑1418. A expressão
`AFIRMA_AGENDAMENTO` (linha 1343) casou com a palavra **"agendado"** em
"com atendimento agendado" — texto puramente informativo. Como
`agendamentoConfirmado = false`, o guard tratou como falso sucesso.

A etapa 11 (saudação) apenas acrescentou o prefixo; ela não causou o erro, mas
é o motivo do texto final ficar com saudação + frase de falha colada.

## Chamadas ao modelo

- **Chamada #1** — motivo: turno normal. Entrada: prompt v3 + mensagem. Saída: tool_call de catálogo. Sem texto.
- **Chamada #2** — motivo: responder com o catálogo consultado. Saída: resposta informativa correta (127→118 tokens de saída).
- **Chamada #3** — motivo: **reprocessamento forçado pelo guard**, com `[SISTEMA] Nenhum agendamento foi gravado…` inserido como mensagem de usuário. Saída: exatamente a frase de falha que a própria instrução mandava usar.

## Casos irmãos (mesmo padrão confirmado)

- `9bd5128b…` (cardiologia, Alex Louza): resposta correta com dias, horários e valores → guard casou com "o atendimento é agendado" → chamada extra → frase de falha.
- `f19ea38d…` (clínico geral): resposta correta e completa → "Os atendimentos são **agendados**" → guard → frase de falha. Aqui a saudação não era obrigatória, então saiu só a frase de falha.

## Gate de saída

- A primeira resposta do modelo estava **correta** (dados vieram do catálogo publicado, `knowledgeStatus: found`).
- **Houve reprocessamento**, disparado pelo guard anti‑falso‑sucesso.
- **Houve chamada adicional ao modelo** (rodada extra) em todos os casos.
- **Não houve fallback de erro nem handoff**: `success = true`, `handoff = false`, confidence ALLOW/100. A frase final veio do próprio modelo obedecendo à instrução `[SISTEMA]`, não da linha 1420 neste caso.
- Etapa responsável pela mensagem incorreta: a **validação pós‑modelo** de `whatsapp.server.ts:1399‑1418` (regex `AFIRMA_AGENDAMENTO` da linha 1343), com agravante cosmético da saudação obrigatória (linha 1702).

Nada foi alterado. Evidências prontas para a Fase 3.
