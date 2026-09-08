# FASE 1 — Origem da mensagem interna "[SISTEMA] Nenhum agendamento foi gravado"

Investigação apenas. Nenhum código, prompt ou dado foi alterado.

## 1. Execução identificada

Clínica: POLICLINICA MENINO JESUS (`7570ddde-8c1c-4b55-ba72-cf12b2a6c940`)
Ambiente: conversas com `is_teste = true` (homologação), canal `test-console`.

| message_id | conversa_id | execucao_id | timestamp (UTC) | resposta |
|---|---|---|---|---|
| dbef3440-a34a-4617-a245-35a864d3e9df | 8bf9f63a-3c8d-4237-affb-a7e53fae6d55 | 78e5b278-8b06-4bd0-9b9c-23e9f6553a87 | 2026-09-08 00:24:38 | saudação + "Não consegui concluir seu agendamento…" |
| 8f574716-1542-4cb2-a67f-20c2a4e6d5ad | 8bf9f63a-… | cc4c5fc6-684a-421f-a490-34cb0a8c7482 | 00:25:13 | "Não consegui concluir seu agendamento…" |
| aadfd1eb-5dc2-458f-8763-45c6069fcfad | 59afe69c-60c4-4178-a29d-d756e027333b | 9bd5128b-af98-4bd3-9580-b74b97f29279 | 00:26:21 | saudação + frase |
| bab7e8e5-f48a-4d04-a142-7d952892e7db | 59afe69c-… | 331c645c-2235-46c8-b03c-4eabf406c338 | 00:27:22 | frase |
| 31a5bb11-073c-48ab-9c97-8d8d7f5e4e3f | 59afe69c-… | f19ea38d-cc76-452a-9e2f-49f649e35d79 | 00:28:16 | frase |

Em todas as cinco, o paciente pediu **apenas informação** (dias/horários do médico,
preço em dinheiro e cartão, ordem de chegada). Nenhuma pedia agendamento.
`nina_execucoes`: `success = true`, `handoff = false`, `retries = 0`,
ferramentas usadas apenas `consultar_base_conhecimento` / `buscar_medicos`
(nenhuma chamada à ferramenta `agendar`).

## 2. Ocorrências do texto no projeto

| Arquivo | Local | Texto | Role |
|---|---|---|---|
| `src/lib/whatsapp.server.ts` | linhas 1412‑1416, dentro do laço de rodadas de `processar` | `"[SISTEMA] Nenhum agendamento foi gravado…"` | **`role: "user"`** (`mensagens.push({ role: "user", content: "[SISTEMA] …" })`), precedido de `mensagens.push({ role: "assistant", content: texto })` |
| `src/lib/whatsapp.server.ts` | linha 1419‑1421 | `resposta = "Não consegui concluir seu agendamento neste momento. Vou verificar novamente."` — substitui a resposta do modelo | resposta final ao paciente |
| `src/lib/nina/agenda-flag.server.ts` | linha 42 | mesma frase, como instrução no prompt para erro de ferramenta de agendamento | prompt/system |
| `src/lib/nina/confidence-engine.ts` / `confidence/runtime.ts` | 219 / 163 | outro texto `[SISTEMA] Confiança insuficiente…` — mecanismo distinto, não é a origem deste caso | interno |

Não há ocorrências em Edge Functions, migrations, fixtures ou código legado.

## 3. Quem cria o "[SISTEMA] …" e quando

Função: bloco "defesa contra falso sucesso" dentro do laço de rodadas em
`src/lib/whatsapp.server.ts` (`processarMensagem`, linhas 1394‑1422).

Condição de disparo (linhas 1399‑1405):

- `podeAgendar` — ferramentas de agenda ativas na clínica (`ferramentasAgendaAtivas`, linha 993);
- `!agendamentoConfirmado` — nenhuma gravação confirmada no turno;
- `AFIRMA_AGENDAMENTO.test(texto)` — regex da linha 1343 casa com
  `estou|vou|irei agend…`, `agendando`, `agendei`, `agendada/o`, `marcada`,
  `marquei`, `reservei/reservada`, `confirmada sua consulta…`;
- `!correcaoFalsoSucessoUsada` (só uma tentativa por turno) e `rodada < MAX_RODADAS-1`.

Efeito: injeta a instrução corretiva como mensagem de **usuário** e repete a rodada.
Se na rodada seguinte o texto ainda casar com a regex e não houver `appointment_id`,
o código descarta a resposta e envia ao paciente a frase fixa (linha 1420).

## 4. Por que disparou neste caso (hipótese sustentada pelas evidências)

O paciente pediu informação; a resposta natural da Nina contém expressões como
"pode ser agendada", "consulta agendada por ordem de chegada", "vou verificar" —
que a regex `AFIRMA_AGENDAMENTO` interpreta como promessa de agendamento.
Como nenhuma ferramenta `agendar` foi chamada (nem deveria ser), o guard
substituiu a resposta informativa pela frase de falha. O resíduo de saudação
"Olá, boa noite! …" concatenado indica que parte do texto original sobreviveu
em duas das execuções.

Classificação: **erro de código/regra de bloqueio** (falso positivo do guard
anti‑falso‑sucesso), não falta de dado no catálogo nem falha da ferramenta de agenda.

## 5. Pendências para a Fase 2

- Nada foi corrigido; a função e a regex permanecem intactas.
- Não foi executado fluxo vivo novo; toda a evidência vem de registros já existentes.
- Falta confirmar, com o texto bruto de cada rodada (não persistido hoje), qual
  trecho exato casou com a regex — o corpo intermediário não é gravado.
