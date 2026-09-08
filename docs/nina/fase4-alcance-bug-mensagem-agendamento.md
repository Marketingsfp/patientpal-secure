# FASE 4 — Alcance do bug "Não consegui concluir seu agendamento"

Somente medição. Nenhum código, prompt ou dado foi alterado. Nenhum fluxo vivo executado.

## Escopo da busca

- Base: `whatsapp_mensagens` (2.153 mensagens no total), todas as clínicas.
- Padrões buscados: `Não consegui concluir seu agendamento`, `não foi possível ... agend%`,
  `[SISTEMA] Nenhum agendamento foi gravado`.
- Período com ocorrências: **2026-09-03 21:31 UTC a 2026-09-08 00:28 UTC**.
- Ocorrências dos outros dois padrões: **0** (o texto `[SISTEMA]` nunca é gravado como mensagem;
  ele só existe no laço de rodadas, em memória).

## Ocorrências encontradas: 7

Todas na clínica POLICLINICA MENINO JESUS (`7570ddde-…`), todas em conversas `is_teste = true`.

| # | data (UTC) | conversa | execução | route_reason | tools chamadas | agendar? | grupo |
|---|---|---|---|---|---|---|---|
| 1 | 03/09 21:31:00 | 9a9130ba | — | — | fluxo de agendamento em andamento | sim, faltou data de nascimento | A |
| 2 | 03/09 21:31:17 | 9a9130ba | — | — | idem | sim, erro ao identificar paciente | A |
| 3 | 08/09 00:24:38 | 8bf9f63a | 78e5b278 | appointment_tool_required | consultar_base_conhecimento | não | B |
| 4 | 08/09 00:25:13 | 8bf9f63a | cc4c5fc6 | direct_knowledge_lookup | consultar_base_conhecimento | não | B |
| 5 | 08/09 00:26:21 | 59afe69c | 9bd5128b | appointment_tool_required | consultar_base_conhecimento | não | B |
| 6 | 08/09 00:27:22 | 59afe69c | 331c645c | conflicting_results | consultar_base_conhecimento ×2, buscar_medicos | não | B |
| 7 | 08/09 00:28:16 | 59afe69c | f19ea38d | conflicting_results | consultar_base_conhecimento ×3, buscar_medicos | não | B |

Nas execuções 3–7: `success = true`, `handoff = false`, `retries = 0`, modelo
`google/gemini-3.7-flash`, perfil `whatsapp`. Nenhuma chamada a ferramenta de
disponibilidade ou de criação de agendamento. `appointment_attempted` = falso.

Nas ocorrências 1–2 o texto é gerado pelo próprio modelo e traz o motivo real
("precisamos da sua data de nascimento", "erro ao identificar o paciente"),
dentro de um diálogo em que o paciente escolheu médico, dia e horário.
São falhas legítimas de agendamento, de causa distinta.

Agendamentos criados por `origem_integracao = 'nina_whatsapp'` no período: **0**.

## Contagem

- Total de ocorrências: **7**
- Legítimas (Grupo A): **2**
- Indevidas (Grupo B): **5**
- Inconclusivas (Grupo C): **0**
- Período analisado: 03/09/2026 a 08/09/2026 (toda a base de mensagens; não há
  ocorrência anterior a 03/09)

Nenhum dado pessoal de paciente foi reproduzido acima.

## Causa comum dos casos indevidos (Grupo B)

Os cinco compartilham:

- **mesma função**: bloco "defesa contra falso sucesso" em
  `src/lib/whatsapp.server.ts`, `processarMensagem`, linhas ~1394‑1422;
- **mesmo `[SISTEMA]`**: `"[SISTEMA] Nenhum agendamento foi gravado…"` injetado
  como mensagem de `role: "user"` e repetição da rodada;
- **mesmo fallback**: substituição integral da resposta pela frase fixa da linha 1420;
- **mesmo gatilho**: regex `AFIRMA_AGENDAMENTO` (linha 1343) casando com
  linguagem informativa ("pode ser agendada", "agendada por ordem de chegada");
- **mesma versão do código** e mesma clínica/ambiente (homologação, canal `test-console`);
- **mesmo estado herdado**: `podeAgendar = true` (ferramentas de agenda ativas na clínica).

Não compartilham `route_reason`: aparecem três valores diferentes
(`appointment_tool_required`, `direct_knowledge_lookup`, `conflicting_results`).
Ou seja, o disparo **não depende da rota** — depende apenas de a clínica ter
agenda habilitada e de o texto casar com a regex.

## Gate de saída

**Bug = classe sistêmica**, não caso isolado. Cinco de sete ocorrências (71%)
são falsos positivos do mesmo guard, em duas conversas distintas, sob três
rotas distintas, em três minutos.

Fluxos afetados: qualquer resposta **informativa** da Nina em clínica com
ferramentas de agenda ativas — preço, dias de atendimento, ordem de chegada,
busca de médicos — pode ter a resposta correta descartada e substituída pela
frase de falha, mesmo sem nenhuma tentativa de agendamento.

Fluxo **não** afetado: agendamento real que falha por dado faltante ou erro de
identificação (Grupo A) — ali a mensagem é legítima e vem do modelo, com motivo.

## Pendências

- Toda a evidência vem de registros existentes; nenhum fluxo vivo foi executado.
- O texto bruto de cada rodada intermediária não é persistido, então não é
  possível confirmar qual trecho exato casou com a regex em cada caso.
- Só há dados de homologação; não há ocorrência em conversa de produção até
  08/09/2026 — o que não descarta o risco, apenas indica baixo volume real.
- Nada foi corrigido.
