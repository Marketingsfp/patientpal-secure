# FASE 1 — Execução preservada: resposta com preços de ultrassonografia

Clínica: POLICLINICA MENINO JESUS (`7570ddde-8c1c-4b55-ba72-cf12b2a6c940`)
Ambiente: homologação (`environment = homologation`, `is_test = true`)
Somente leitura — nenhuma alteração de dados, prompt, cache, catálogo ou sessão.

## A — Execução principal investigada (resposta mais recente, Lead 02, 11:36 local)

| Campo | Valor |
|---|---|
| conversation_id | d2adc481-8d98-4c89-a161-b9dee204818d |
| message_id (resposta Nina) | 33e46c67-5328-472f-b024-9ad38f803499 |
| mensagem do paciente | 1068e027-e4c4-4e9c-8bff-ca3feb84326f — "Quanto custa uma ultrassonografia?" (07/09/2026 11:36:13 BRT) |
| test_lead_id | 47f60baa-426d-4949-a23b-340e2901ca58 (Lead Teste 02) |
| test_session_id | sessão 19 · ciclo fb541da5-0c08-4375-83da-b5192d7b9cd5 · telefone 55000200019 |
| execution_id | 4a371384-f9ad-46c2-b5eb-49d96120e487 |
| trace_id | 2089e6b9-ee80-4e2a-a9b5-4479aaf21cff |
| model / provider | google/gemini-3.7-flash (Lovable AI Gateway) |
| horário da execução | 2026-09-07 14:36:30 UTC (11:36:30 BRT) |
| prompt | v3 publicada — 9456e5ce-3e9e-40c9-8e0e-e16d7a2a214f |
| tools chamadas | buscar_procedimentos, buscar_procedimentos, consultar_base_conhecimento |
| route_reason | conflicting_results · thinking high · latência 2.443 ms · 46.792 in / 96 out |
| knowledge_status | NULL (não registrado) |

## B — Execuções anteriores com listas detalhadas de preços (08:27 UTC / 05:27 BRT)

Lead 02 — conversa d2adc481-8d98-4c89-a161-b9dee204818d
- message_id 93053884-93f9-4276-8cb0-29233ca8e46b
- execution_id bf3ba993-612f-40f8-8a6b-b9431cf4e30d · trace 46273bb9-e4dc-4bf6-bc41-28c1ea58eeb7
- model google/gemini-3.7-flash · prompt v3 · route_reason direct_knowledge_lookup · tool_calls [] · 2026-09-07 08:27:25 UTC

Lead 08 — conversa 14c7ca47-eddc-4240-8623-6086eb61daf3 (sessão 12, lead 07a9e153-de14-42e6-bbe0-dc37d1226afb)
- message_id cafed089-7ea7-4fd0-9315-384f2f9abc72
- execution_id bb4a8a5b-dce8-4433-9a93-a4deafe68bf9 · trace c676557f-6eaa-4dcd-84f0-89b2fefe7035
- model google/gemini-3.7-flash · prompt v3 · route_reason direct_knowledge_lookup · tool_calls [] · 2026-09-07 08:27:26 UTC

Observação factual (sem conclusão): nessas duas execuções `tool_calls` está vazio e `knowledge_status` é NULL, enquanto a execução A registrou chamadas de ferramentas.

## C — Estado da auditoria

Auditoria PARCIAL.
- Presente: registro em `nina_execucoes` (modelo, prompt, tokens, latência, tools, route_reason) e eventos em `nina_trace_eventos` (message.inbound, llm.generate, response.validate, message.outbound, prompt.compose, instructions.published), além das mensagens em `whatsapp_mensagens`.
- Ausente: payload do prompt final, resultado bruto retornado pelas tools/base de conhecimento e `knowledge_status`. Não há como reconstruir a origem exata dos valores citados a partir do que está gravado — nada foi reconstruído retrospectivamente.

## D — Preservação

Nenhum cache foi limpo, nenhum embedding apagado, nenhum prompt/catálogo alterado, nenhuma sessão reiniciada e nenhum modelo/tool trocado. Os identificadores acima ficam disponíveis para a Fase 2.
